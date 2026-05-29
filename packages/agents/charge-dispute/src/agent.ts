// PRD §8.3 Agent 8 — Charge Dispute.
//
// Flow (per PRD §10 orchestration + §16 trust):
//   1. Surface candidates using the EXISTING @fa/plaid detectors
//      (detectAnomalies + detectChargesAfterCancellation). This agent does NOT
//      re-implement anomaly logic — see candidates.ts.
//   2. requiresApproval: true — the action lands in `awaiting_approval`. The
//      web UI shows the candidate; the user confirms ("yes, dispute this").
//   3. On the approved run, we open a dispute row (status: detected) in the
//      existing `disputes` table, transition detected → filing → filed, and
//      file with the bank ONLY through BankDisputePort. We never fabricate a
//      filing (HONESTY CONTRACT): the real port reads per-bank env keys
//      (PRD §13); tests inject a mock.
//   4. Bank success → status 'filed', persist bank_case_id, roi = disputed
//      amount (the dollars we're trying to recover). Bank failure → throw;
//      defineAgent retries, then onFailure transitions the dispute to
//      'cancelled' so it doesn't dangle "filing".

import { defineAgent, type AgentDefinition, type AgentRunContext, type AgentRunResult } from '@fa/inngest';
import type { DisputeRow } from '@fa/db/types';
import {
  createDispute,
  findOpenDispute,
  getTransaction,
  setDisputeStatus,
} from './disputes-db';
import { isSupportedBank, type BankKey } from './bank-port';
import { getBankDisputePort } from './port-registry';
import type { DisputeReason } from './candidates';

export interface ChargeDisputeInput {
  /** The transaction the user confirmed they want to dispute. */
  transactionId: string;
  /** Dispute reason — comes from the surfaced candidate. */
  reason: DisputeReason;
  /** Bank to file with (PRD §13 supported set). */
  bank: BankKey;
  /** Detection confidence from the candidate (→ disputes.detection_score). */
  detectionScore?: number | null;
  /** Human-readable explanation from the candidate (→ evidence + bank call). */
  detail?: string;
  /** Extra supporting context (e.g. duplicate txn ids, screenshots). */
  evidence?: Record<string, unknown>;
}

const REASON_DESCRIPTION: Record<DisputeReason, string> = {
  duplicate: 'Duplicate charge — same merchant and amount billed more than once.',
  unauthorized: 'Unauthorized charge — cardholder did not authorize this transaction.',
  incorrect_amount: 'Incorrect amount — charged more than the agreed/expected amount.',
  subscription_cancelled: 'Charge after cancellation — subscription was already cancelled.',
  service_not_rendered: 'Service not rendered — paid for goods/services not received.',
};

async function runDispute(
  input: ChargeDisputeInput,
  ctx: AgentRunContext,
): Promise<AgentRunResult> {
  if (!isSupportedBank(input.bank)) {
    throw new Error(`unsupported bank "${input.bank}" — see PRD §13 supported set`);
  }

  // Idempotency on top of Inngest: if an open dispute already exists for this
  // transaction (the unique partial index enforces at most one), decide based
  // on ownership. A dispute opened by a DIFFERENT action means the user already
  // disputed this charge — no-op. A dispute opened by THIS action means a prior
  // retry attempt got partway (e.g. created the row, then the bank call threw):
  // reuse that row and continue filing rather than creating a duplicate.
  const existingOpen = await findOpenDispute(input.transactionId);
  const reentrant = existingOpen && existingOpen.agent_action_id === ctx.actionId;
  if (existingOpen && !reentrant) {
    await ctx.log('dispute:already-open', true, {
      transactionId: input.transactionId,
      disputeId: existingOpen.id,
      status: existingOpen.status,
    });
    return {
      roi: null,
      data: { alreadyOpen: true, disputeId: existingOpen.id, status: existingOpen.status },
    };
  }

  const txn = await getTransaction(input.transactionId);
  await ctx.log('transaction:lookup', !!txn, { transactionId: input.transactionId });
  if (!txn) throw new Error(`transaction ${input.transactionId} not found`);
  if (Number(txn.amount) <= 0) {
    throw new Error(`transaction ${input.transactionId} is not a debit (amount ${txn.amount})`);
  }

  const amount = Number(txn.amount);
  const description = `${REASON_DESCRIPTION[input.reason]} ${input.detail ?? ''}`.trim();
  const evidence: Record<string, unknown> = {
    detail: input.detail ?? null,
    merchant: txn.merchant,
    txn_date: txn.date,
    account_id: txn.account_id,
    ...(input.evidence ?? {}),
  };

  // 1. Open the dispute row (status: detected) — or reuse this action's prior
  //    attempt on a retry.
  const dispute: DisputeRow =
    reentrant && existingOpen
      ? existingOpen
      : await createDispute({
          userId: txn.user_id,
          transactionId: input.transactionId,
          agentActionId: ctx.actionId,
          reason: input.reason,
          detectionScore: input.detectionScore ?? null,
          amount,
          bank: input.bank,
          evidence,
          status: 'detected',
        });
  await ctx.log('dispute:created', reentrant ? false : true, {
    disputeId: dispute.id,
    reason: input.reason,
    amount,
    reused: !!reentrant,
  });

  // 1b. Already filed? If a prior attempt of THIS action got a successful bank
  //     filing (bank_case_id persisted) but then threw before reaching a clean
  //     terminal state, the retry must NOT re-file an irreversible chargeback.
  //     Detect the durable filed marker and reconcile to 'filed' idempotently.
  //     (The bank idempotencyKey below covers the narrower window where the
  //     bank call succeeded but persisting bank_case_id failed — there we
  //     re-call with the same key and the bank dedupes to the same case.)
  if (reentrant && dispute.bank_case_id) {
    if (dispute.status !== 'filed') {
      await setDisputeStatus(dispute.id, 'filed', { bank_case_id: dispute.bank_case_id });
    }
    await ctx.log('dispute:already-filed', true, {
      disputeId: dispute.id,
      bankCaseId: dispute.bank_case_id,
    });
    return {
      roi: Number(amount.toFixed(2)),
      data: {
        disputeId: dispute.id,
        bank: input.bank,
        bankCaseId: dispute.bank_case_id,
        reason: input.reason,
        amount,
        alreadyFiled: true,
      },
    };
  }

  // 2. Transition to 'filing' before any outbound bank contact.
  await setDisputeStatus(dispute.id, 'filing');
  await ctx.log('dispute:filing', true, { disputeId: dispute.id, bank: input.bank });

  // 3. File via the bank port. The agent NEVER fabricates a filing — this is
  //    the only outbound seam, and on failure we throw to escalate. We pass the
  //    dispute id as the bank idempotency key: if a transient DB failure strikes
  //    AFTER a successful bank call but BEFORE we persist bank_case_id, the
  //    retry re-issues with the SAME key and the bank returns the original case
  //    instead of opening a second chargeback (see BankDisputeRequest).
  const port = getBankDisputePort();
  let result: { ok: boolean; bankCaseId?: string; reason?: string };
  try {
    result = await port.fileDispute({
      bank: input.bank,
      idempotencyKey: dispute.id,
      transactionId: input.transactionId,
      amount,
      reason: input.reason,
      description,
      evidence,
    });
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    await ctx.log('dispute:bank-error', false, { disputeId: dispute.id, reason });
    // Stash failure context so onFailure can mark the dispute cancelled.
    (ctx as AgentRunContext & { _disputeId?: string })._disputeId = dispute.id;
    throw new Error(`bank filing threw: ${reason}`);
  }

  if (!result.ok) {
    await ctx.log('dispute:bank-rejected', false, {
      disputeId: dispute.id,
      reason: result.reason ?? 'unknown',
    });
    (ctx as AgentRunContext & { _disputeId?: string })._disputeId = dispute.id;
    throw new Error(`bank rejected dispute: ${result.reason ?? 'unknown'}`);
  }

  // 4. Filed successfully — persist the bank case id.
  await setDisputeStatus(dispute.id, 'filed', {
    bank_case_id: result.bankCaseId ?? null,
  });
  await ctx.log('dispute:filed', true, {
    disputeId: dispute.id,
    bankCaseId: result.bankCaseId ?? null,
  });

  return {
    // ROI = the dollars we're attempting to recover. Realized recovery is
    // reconciled later when the bank resolves the case (resolved_won).
    roi: Number(amount.toFixed(2)),
    data: {
      disputeId: dispute.id,
      bank: input.bank,
      bankCaseId: result.bankCaseId ?? null,
      reason: input.reason,
      amount,
    },
  };
}

export const chargeDisputeAgent: AgentDefinition<ChargeDisputeInput> = defineAgent<ChargeDisputeInput>({
  type: 'charge_dispute',
  actionType: 'file_dispute',
  requiresApproval: true,
  idempotencyKey: (i) => `dispute:${i.transactionId}`,
  run: runDispute,
  onFailure: async (input, ctx) => {
    // Bank filing failed after retries. Don't leave the dispute dangling in
    // 'filing' — mark it cancelled so the user/UI sees a clean terminal state
    // and we don't double-file on a later candidate sweep. Defensive: only act
    // if we actually opened a row this run.
    const disputeId = (ctx as AgentRunContext & { _disputeId?: string })._disputeId;
    if (!disputeId) {
      await ctx.log('dispute:failure-no-row', true, { transactionId: input.transactionId });
      return;
    }
    try {
      await setDisputeStatus(disputeId, 'cancelled');
      await ctx.log('dispute:cancelled-on-failure', true, { disputeId });
    } catch (e) {
      await ctx.log('dispute:cancelled-on-failure', false, {
        disputeId,
        reason: e instanceof Error ? e.message : String(e),
      });
    }
  },
});
