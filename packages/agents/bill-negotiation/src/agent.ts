// PRD §8.3 Agent 7 — Bill Negotiation (the killer feature).
//
// Flow (per PRD §8.3 + §10 orchestration + §16 trust):
//   1. Load the bill (provider, current $) and the user's target $.
//   2. Create a bill_negotiations row (status preparing_call).
//   3. Generate a negotiation call script via @fa/claude, persist it on the row
//      (call_script) and advance to status 'calling' — the dial-attempt marker.
//   4. Place the outbound call via @fa/twilio, then persist the call_sid. The
//      'calling' marker is written BEFORE the dial so a retry whose call_sid
//      write failed never re-dials (no provider-side idempotency exists).
//   5. Poll call status until terminal.
//   6. If the call did not connect+complete → throw → defineAgent retries 3x
//      then escalates (status failed). We NEVER fake a completed call.
//   7. On completion: fetch the recording + transcript, analyze the transcript
//      to decide if savings were actually agreed.
//        - savings: store achieved/monthly_savings + recording_url, status
//          succeeded, return roi = (current - target) * 12.
//        - no savings: store recording_url, status no_savings, roi = 0.
//
// requiresApproval=true — the user authorizes the call before we dial.
//
// HONESTY: all telephony + TTS go through @fa/twilio's TwilioPort; unit tests
// run against MockTwilioAdapter, production wires RealTwilioAdapter. The agent
// logic never pretends a live call happened.

import { defineAgent, type AgentRunContext, type AgentRunResult } from '@fa/inngest';
import {
  placeCall,
  getCallStatus,
  getRecording,
  isTerminalStatus,
  isConnectedCompletion,
} from '@fa/twilio';
import { generateScript } from './script';
import { analyzeOutcome } from './outcome';
import {
  getBill,
  createNegotiation,
  updateNegotiation,
  markBillNegotiated,
  findNegotiationByActionId,
} from './negotiation-db';
import type { BillNegotiationRow } from '@fa/db/types';

export interface BillNegotiationInput {
  billId: string;
  /** Provider/support line in E.164 to dial. */
  providerPhone: string;
  /** Desired new monthly amount. */
  targetAmount: number;
  /** Optional voice persona for the call (ElevenLabs voice id). */
  voiceId?: string | undefined;
  /** Poll tuning — overridable in tests. */
  poll?: {
    intervalMs?: number;
    maxPolls?: number;
    sleep?: (ms: number) => Promise<void>;
  };
}

const DEFAULT_POLL_INTERVAL_MS = 5000;
const DEFAULT_MAX_POLLS = 180; // 5s * 180 = 15 min ceiling

const defaultSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function runNegotiation(
  input: BillNegotiationInput,
  ctx: AgentRunContext,
): Promise<AgentRunResult> {
  // 1. Load the bill.
  const bill = await getBill(input.billId);
  if (!bill) throw new Error(`bill not found: ${input.billId}`);
  await ctx.log('bill:loaded', true, {
    billId: bill.id,
    provider: bill.provider_name,
    current: bill.current_amount,
    target: input.targetAmount,
  });

  if (input.targetAmount >= bill.current_amount) {
    // Nothing to negotiate down to — record as no_savings without dialing.
    const neg0 = await createNegotiation({
      userId: ctx.userId,
      billId: bill.id,
      agentActionId: ctx.actionId,
      targetAmount: input.targetAmount,
      status: 'no_savings',
    });
    await updateNegotiation(neg0.id, {
      status: 'no_savings',
      notes: 'target not below current amount — no call placed',
    });
    await ctx.log('negotiation:no-op', true, { reason: 'target >= current' });
    return { roi: 0, data: { negotiationId: neg0.id, savingsAchieved: false, called: false } };
  }

  // 2. RESUME or CREATE. defineAgent retries runNegotiation from the top, and
  // the production Inngest function adds its own outer retries. There is NO
  // provider-side idempotency on the Twilio Create Call endpoint, so
  // double-dial prevention is authoritative in OUR state.
  //
  // The authoritative signal is "a call was ATTEMPTED for this action" — which
  // we record by advancing the row to the 'calling' marker BEFORE we dial. The
  // call_sid is written AFTER the dial returns, in a separate write that can
  // fail. So we must NOT key resume on call_sid alone: if that second write
  // failed, the row still carries the 'calling' marker and a naive retry would
  // re-dial. callAttempted() captures both cases.
  let neg: BillNegotiationRow;
  let callSid: string;
  const existing = await findNegotiationByActionId(ctx.actionId);
  // "A call was attempted for this action" = the row has advanced past the
  // pre-dial states. We persist the 'calling' marker BEFORE dialing, and any
  // later status (negotiating/succeeded/failed/no_savings) likewise means a
  // dial already happened. Only 'pending'/'preparing_call' are pre-dial. We do
  // NOT key off call_sid alone — it is written AFTER the dial in a separate
  // write that can fail, leaving an attempted call with a null SID.
  const callAttempted = (row: BillNegotiationRow): boolean =>
    row.status !== 'pending' && row.status !== 'preparing_call';

  if (existing && callAttempted(existing) && existing.call_sid) {
    // A call was placed AND we have its SID — resume polling that same call.
    neg = existing;
    callSid = existing.call_sid;
    await ctx.log('negotiation:resumed', true, {
      negotiationId: neg.id,
      callSid,
      status: existing.status,
    });
  } else if (existing && callAttempted(existing)) {
    // We marked 'calling' (so the dial MAY have gone out) but never persisted a
    // call_sid. We cannot safely re-dial — that risks a double-dial to the
    // provider's support line — and we have no SID to resume polling. Route to
    // human review and escalate rather than re-dialing. (PRD §16 trust.)
    neg = existing;
    await updateNegotiation(neg.id, {
      status: 'negotiating',
      notes: 'call was attempted but no call SID was recorded — routed to human review',
    });
    await ctx.log('negotiation:attempted-no-sid', false, {
      negotiationId: neg.id,
      status: existing.status,
    });
    throw new Error('bill negotiation call was attempted but no call SID recorded — needs human review');
  } else {
    // No prior attempt for this action (no row, or row still in a pre-dial
    // state). Safe to (re)generate the script and dial.
    neg = existing ?? (await createNegotiation({
      userId: ctx.userId,
      billId: bill.id,
      agentActionId: ctx.actionId,
      targetAmount: input.targetAmount,
      status: 'preparing_call',
    }));
    if (!existing) {
      await ctx.log('negotiation:created', true, { negotiationId: neg.id });
    }

    // 3. Generate the call script.
    const { script } = await generateScript({
      provider: bill.provider_name,
      currentAmount: bill.current_amount,
      targetAmount: input.targetAmount,
      accountNumberMasked: bill.account_number_masked ?? undefined,
      billingPeriod: bill.billing_period ?? undefined,
    });
    await ctx.log('script:generated', true, { chars: script.length });

    // Persist the 'calling' marker AND the script BEFORE dialing. The marker is
    // what makes a re-dial impossible on a subsequent retry (callAttempted),
    // and the script is looked up by negotiationId by /api/voice/twiml — it is
    // never passed in the TwiML Url.
    const callStartedAt = new Date().toISOString();
    await updateNegotiation(neg.id, {
      status: 'calling',
      callStartedAt,
      callScript: script,
    });

    // 4. Place the call. The idempotency key is derived from STABLE inputs
    // (actionId + billId) and carried for OUR correlation/dedupe — Twilio does
    // not honor it (no provider-side idempotency on Create Call).
    const placed = await placeCall({
      to: input.providerPhone,
      script,
      voiceId: input.voiceId,
      idempotencyKey: `bill-neg:${ctx.actionId}:${bill.id}`,
      metadata: { negotiationId: neg.id, billId: bill.id },
    });
    callSid = placed.callSid;
    // Persist the callSid so a retry after this point resumes polling rather
    // than dialing. If THIS write fails, the 'calling' marker above still
    // prevents a re-dial (callAttempted → escalate, never re-dial).
    await updateNegotiation(neg.id, { callSid });
    await ctx.log('call:placed', true, { callSid, status: placed.status });
  }

  // 5. Poll to a terminal status.
  const intervalMs = input.poll?.intervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const maxPolls = input.poll?.maxPolls ?? DEFAULT_MAX_POLLS;
  const sleep = input.poll?.sleep ?? defaultSleep;

  let status = await getCallStatus(callSid);
  let polls = 0;
  while (!isTerminalStatus(status.status) && polls < maxPolls) {
    await sleep(intervalMs);
    status = await getCallStatus(callSid);
    polls += 1;
  }
  await ctx.log('call:status', true, { status: status.status, polls });

  const callEndedAt = status.endedAt ?? new Date().toISOString();

  // 6. Non-completion → fail (escalates via defineAgent). Never fake success.
  if (!isConnectedCompletion(status.status)) {
    await updateNegotiation(neg.id, {
      status: 'failed',
      callEndedAt,
      callDurationSeconds: status.durationSeconds,
      notes: `call did not complete (status=${status.status})`,
    });
    throw new Error(`bill negotiation call did not complete: status=${status.status}`);
  }

  // 7. Fetch recording + transcript, analyze the actual outcome.
  const recording = await getRecording(callSid);
  await ctx.log('recording:fetched', true, {
    hasRecording: recording.recordingUrl !== null,
    hasTranscript: recording.transcriptText !== null,
  });

  // The call connected and completed, but we have NO transcript to read. We
  // must not silently record this as 'no_savings' — that would discard a real
  // savings outcome the rep may have agreed to. Instead route to human review
  // (PRD §16 trust): mark the row 'negotiating' (needs-review), persist the
  // recording, and throw so defineAgent escalates after retries. A retry will
  // re-fetch in case the transcript was still processing.
  if (!recording.transcriptText || recording.transcriptText.trim().length === 0) {
    await updateNegotiation(neg.id, {
      status: 'negotiating',
      callEndedAt,
      callDurationSeconds: status.durationSeconds,
      voiceRecordingUrl: recording.recordingUrl,
      transcriptUrl: recording.transcriptUrl,
      notes: 'call completed but no transcript yet — routed to human review',
    });
    await ctx.log('outcome:needs-review', false, {
      reason: 'completed call has no transcript to confirm the outcome',
    });
    throw new Error('bill negotiation completed without a transcript — needs human review');
  }

  const outcome = await analyzeOutcome({
    provider: bill.provider_name,
    currentAmount: bill.current_amount,
    targetAmount: input.targetAmount,
    transcriptText: recording.transcriptText,
  });
  await ctx.log('outcome:analyzed', outcome.savingsAchieved, {
    savingsAchieved: outcome.savingsAchieved,
    achievedAmount: outcome.achievedAmount,
    reason: outcome.reason,
  });

  await markBillNegotiated(bill.id, callEndedAt);

  if (!outcome.savingsAchieved || outcome.achievedAmount === null) {
    // No-savings path — record honestly, roi 0.
    await updateNegotiation(neg.id, {
      status: 'no_savings',
      callEndedAt,
      callDurationSeconds: status.durationSeconds,
      voiceRecordingUrl: recording.recordingUrl,
      transcriptUrl: recording.transcriptUrl,
      achievedAmount: null,
      monthlySavings: 0,
      notes: outcome.reason,
    });
    return {
      roi: 0,
      data: {
        negotiationId: neg.id,
        savingsAchieved: false,
        recordingUrl: recording.recordingUrl,
        reason: outcome.reason,
      },
    };
  }

  // Savings path.
  const achieved = outcome.achievedAmount;
  const monthlySavings = Number((bill.current_amount - achieved).toFixed(2));
  const roi = Number((monthlySavings * 12).toFixed(2));

  await updateNegotiation(neg.id, {
    status: 'succeeded',
    callEndedAt,
    callDurationSeconds: status.durationSeconds,
    voiceRecordingUrl: recording.recordingUrl,
    transcriptUrl: recording.transcriptUrl,
    achievedAmount: achieved,
    monthlySavings,
    notes: outcome.reason,
  });

  return {
    roi,
    data: {
      negotiationId: neg.id,
      savingsAchieved: true,
      achievedAmount: achieved,
      monthlySavings,
      recordingUrl: recording.recordingUrl,
    },
  };
}

export const billNegotiationAgent = defineAgent<BillNegotiationInput>({
  type: 'bill_negotiation',
  actionType: 'negotiate',
  requiresApproval: true,
  idempotencyKey: ({ billId }) => `bill-negotiate:${billId}`,
  run: runNegotiation,
});
