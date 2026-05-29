import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// --- In-memory DB state -----------------------------------------------------

interface ActionRow {
  id: string;
  user_id: string;
  agent_id: string;
  agent_type: string;
  action_type: string;
  target: string | null;
  status: string;
  idempotency_key: string | null;
  audit_log: Array<{ ts: string; step: string; ok: boolean; detail?: Record<string, unknown> }>;
  roi_amount: number | null;
  error_message: string | null;
}

interface DisputeRecord {
  id: string;
  user_id: string;
  transaction_id: string;
  agent_action_id: string | null;
  status: string;
  reason: string;
  detection_score: number | null;
  amount: number;
  recovered_amount: number | null;
  bank: string | null;
  bank_case_id: string | null;
  filed_at: string | null;
  resolved_at: string | null;
  evidence: Record<string, unknown>;
  created_at: string;
}

const OPEN_STATUSES = new Set(['detected', 'awaiting_user', 'filing', 'filed']);

const dbState = {
  actionsById: new Map<string, ActionRow>(),
  disputesById: new Map<string, DisputeRecord>(),
  transactions: new Map<
    string,
    { id: string; user_id: string; account_id: string; amount: number; merchant: string | null; date: string }
  >(),
  seq: 0,
  /**
   * When > 0, the next N `disputes.update` calls that would persist a 'filed'
   * status throw a transient error WITHOUT applying the patch — simulating a DB
   * blip AFTER the bank call succeeded but BEFORE bank_case_id is persisted.
   */
  failFiledUpdates: 0,
};

const startActionMock = vi.fn(async (input: {
  userId: string; agentId: string; agentType: string; actionType: string;
  target?: string | null; idempotencyKey?: string; requiresApproval?: boolean;
}) => {
  const existing = [...dbState.actionsById.values()].find(
    (a) => a.agent_id === input.agentId && a.idempotency_key === (input.idempotencyKey ?? null),
  );
  if (existing && input.idempotencyKey) return existing;
  const id = `action-${++dbState.seq}`;
  const row: ActionRow = {
    id,
    user_id: input.userId,
    agent_id: input.agentId,
    agent_type: input.agentType,
    action_type: input.actionType,
    target: input.target ?? null,
    status: input.requiresApproval ? 'awaiting_approval' : 'pending',
    idempotency_key: input.idempotencyKey ?? null,
    audit_log: [],
    roi_amount: null,
    error_message: null,
  };
  dbState.actionsById.set(id, row);
  return row;
});

const logStepMock = vi.fn(async (actionId: string, step: { step: string; ok: boolean; detail?: Record<string, unknown> }) => {
  const row = dbState.actionsById.get(actionId);
  if (row) row.audit_log.push({ ts: new Date().toISOString(), ...step });
});

const transition = (actionId: string, status: string, extra?: Record<string, unknown>) => {
  const row = dbState.actionsById.get(actionId);
  if (row) {
    row.status = status;
    if (extra && 'roi_amount' in extra) row.roi_amount = extra.roi_amount as number | null;
    if (extra && 'error_message' in extra) row.error_message = extra.error_message as string;
    row.audit_log.push({ ts: new Date().toISOString(), step: `status:${status}`, ok: status !== 'failed', detail: extra ?? {} });
  }
};

// Minimal supabase-like chainable client backed by the maps above.
function makeClient() {
  return {
    from(table: string) {
      if (table === 'transactions') {
        let capturedId = '';
        const chain = {
          select: () => chain,
          eq: (_c: string, v: string) => {
            capturedId = v;
            return chain;
          },
          maybeSingle: async () => ({ data: dbState.transactions.get(capturedId) ?? null, error: null }),
        };
        return chain;
      }
      if (table === 'disputes') {
        let txnFilter = '';
        let statusNotIn = false;
        const chain = {
          select: () => chain,
          eq: (col: string, v: string) => {
            if (col === 'transaction_id') txnFilter = v;
            return chain;
          },
          not: (_c: string, _op: string, _v: string) => {
            statusNotIn = true;
            return chain;
          },
          maybeSingle: async () => {
            const match = [...dbState.disputesById.values()].find(
              (d) =>
                d.transaction_id === txnFilter &&
                (!statusNotIn || OPEN_STATUSES.has(d.status)),
            );
            return { data: match ?? null, error: null };
          },
          insert: (patch: Partial<DisputeRecord>) => ({
            select: () => ({
              single: async () => {
                const id = `dispute-${++dbState.seq}`;
                const rec: DisputeRecord = {
                  id,
                  user_id: patch.user_id!,
                  transaction_id: patch.transaction_id!,
                  agent_action_id: patch.agent_action_id ?? null,
                  status: patch.status ?? 'detected',
                  reason: patch.reason!,
                  detection_score: patch.detection_score ?? null,
                  amount: patch.amount!,
                  recovered_amount: null,
                  bank: patch.bank ?? null,
                  bank_case_id: null,
                  filed_at: null,
                  resolved_at: null,
                  evidence: patch.evidence ?? {},
                  created_at: new Date().toISOString(),
                };
                dbState.disputesById.set(id, rec);
                return { data: rec, error: null };
              },
            }),
          }),
          update: (patch: Partial<DisputeRecord>) => ({
            eq: async (_c: string, id: string) => {
              // Simulate a transient DB failure on the 'filed' write: the patch
              // is NOT applied and updateDispute() surfaces an error → throw,
              // exactly like a real outage striking after the bank call.
              if (patch.status === 'filed' && dbState.failFiledUpdates > 0) {
                dbState.failFiledUpdates -= 1;
                return { error: { message: 'transient: connection reset' } };
              }
              const rec = dbState.disputesById.get(id);
              if (rec) Object.assign(rec, patch);
              return { error: null };
            },
          }),
        };
        return chain;
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

vi.mock('@fa/db', () => ({
  startAction: (...a: unknown[]) => startActionMock(...(a as Parameters<typeof startActionMock>)),
  logStep: (...a: unknown[]) => logStepMock(...(a as Parameters<typeof logStepMock>)),
  markRunning: async (id: string) => transition(id, 'running'),
  markSucceeded: async (id: string, roi: number | null) => transition(id, 'succeeded', { roi_amount: roi }),
  markFailed: async (id: string, msg: string) => transition(id, 'failed', { error_message: msg }),
  markEscalated: async (id: string, reason: string) => transition(id, 'escalated', { error_message: reason }),
  createServiceClient: () => makeClient(),
}));

// Re-export the REAL inngest (resolves @fa/db via the mock above).
vi.mock('@fa/inngest', async () => {
  const actual = await vi.importActual<typeof import('@fa/inngest')>('@fa/inngest');
  return actual;
});

import { runAgent } from '@fa/inngest';
import { chargeDisputeAgent } from '../src/agent';
import { setBankDisputePort, resetBankDisputePort } from '../src/port-registry';
import { mockBankDisputePort } from '../src/bank-port.mock';
import type { ChargeDisputeInput } from '../src/agent';

const seedTxn = (id: string, amount: number, merchant = 'ACME') => {
  dbState.transactions.set(id, {
    id,
    user_id: 'user-1',
    account_id: 'acct-1',
    amount,
    merchant,
    date: '2026-05-20',
  });
};

const runDispute = async (input: ChargeDisputeInput) => {
  const first = await runAgent(
    chargeDisputeAgent,
    { userId: 'user-1', agentId: 'agent-row-1', input },
    { sleep: () => Promise.resolve() },
  );
  if (first.status === 'awaiting_approval') {
    // Simulate the user confirming the candidate in the web UI: flip the row to
    // pending and re-run with the same idempotency key.
    const row = dbState.actionsById.get(first.actionId);
    if (row) row.status = 'pending';
    return runAgent(
      chargeDisputeAgent,
      { userId: 'user-1', agentId: 'agent-row-1', input },
      { sleep: () => Promise.resolve() },
    );
  }
  return first;
};

describe('chargeDisputeAgent', () => {
  beforeEach(() => {
    dbState.actionsById.clear();
    dbState.disputesById.clear();
    dbState.transactions.clear();
    dbState.seq = 0;
    dbState.failFiledUpdates = 0;
    startActionMock.mockClear();
    logStepMock.mockClear();
  });
  afterEach(() => resetBankDisputePort());

  it('anomaly → dispute happy path: files with bank, status filed, roi = amount', async () => {
    const port = mockBankDisputePort();
    setBankDisputePort(port);
    seedTxn('txn-anomaly', 249.99);

    const result = await runDispute({
      transactionId: 'txn-anomaly',
      reason: 'incorrect_amount',
      bank: 'chase',
      detectionScore: 0.82,
      detail: 'Unusual amount: 3x the median.',
    });

    expect(result.status).toBe('succeeded');
    expect(result.result?.roi).toBeCloseTo(249.99, 2);

    // Dispute row was created and transitioned to 'filed' with a bank case id.
    const dispute = [...dbState.disputesById.values()][0]!;
    expect(dispute.status).toBe('filed');
    expect(dispute.reason).toBe('incorrect_amount');
    expect(dispute.bank).toBe('chase');
    expect(dispute.detection_score).toBe(0.82);
    expect(dispute.bank_case_id).toMatch(/^MOCK-chase-/);
    expect(dispute.filed_at).not.toBeNull();
    expect(dispute.agent_action_id).toBe(result.actionId);

    // Bank port received exactly one filing.
    expect(port.requests.length).toBe(1);
    expect(port.requests[0]!.bank).toBe('chase');
    expect(port.requests[0]!.amount).toBeCloseTo(249.99, 2);

    // Audit trail shows the detected→filing→filed progression.
    const steps = dbState.actionsById.get(result.actionId)!.audit_log.map((s) => s.step);
    expect(steps).toContain('dispute:created');
    expect(steps).toContain('dispute:filing');
    expect(steps).toContain('dispute:filed');
    expect(steps).toContain('status:succeeded');
  });

  it('duplicate-charge path files a duplicate-reason dispute', async () => {
    const port = mockBankDisputePort();
    setBankDisputePort(port);
    seedTxn('txn-dup', 19.99, 'Netflix');

    const result = await runDispute({
      transactionId: 'txn-dup',
      reason: 'duplicate',
      bank: 'amex',
      detectionScore: 0.85,
      detail: 'Duplicate charge within 3 days.',
      evidence: { duplicateOf: 'txn-dup-original' },
    });

    expect(result.status).toBe('succeeded');
    const dispute = [...dbState.disputesById.values()][0]!;
    expect(dispute.reason).toBe('duplicate');
    expect(dispute.bank).toBe('amex');
    expect(dispute.status).toBe('filed');
    expect(dispute.evidence.duplicateOf).toBe('txn-dup-original');
    expect(port.requests[0]!.reason).toBe('duplicate');
    expect(port.requests[0]!.description).toMatch(/Duplicate charge/);
  });

  it('bank-failure escalation: dispute cancelled, action escalated, retries used', async () => {
    const port = mockBankDisputePort({ failAll: true, reason: 'bank declined' });
    setBankDisputePort(port);
    seedTxn('txn-fail', 75.0);

    const result = await runDispute({
      transactionId: 'txn-fail',
      reason: 'unauthorized',
      bank: 'wells',
      detectionScore: 0.9,
    });

    expect(result.status).toBe('escalated');

    // Dispute was opened then cancelled in onFailure (not left dangling in filing).
    const dispute = [...dbState.disputesById.values()][0]!;
    expect(dispute.status).toBe('cancelled');

    // Bank port was retried (run + 3 retries = 4 attempts).
    expect(port.requests.length).toBe(4);

    const steps = dbState.actionsById.get(result.actionId)!.audit_log.map((s) => s.step);
    expect(steps).toContain('dispute:bank-rejected');
    expect(steps).toContain('dispute:cancelled-on-failure');
    expect(steps).toContain('status:escalated');
  });

  it('idempotent: existing open dispute short-circuits without re-filing', async () => {
    const port = mockBankDisputePort();
    setBankDisputePort(port);
    seedTxn('txn-open', 50);

    // First run files it.
    await runDispute({ transactionId: 'txn-open', reason: 'duplicate', bank: 'citi' });
    expect(port.requests.length).toBe(1);

    // Second run (new agent row id, same txn) finds the open dispute and no-ops.
    const second = await runAgent(
      chargeDisputeAgent,
      { userId: 'user-1', agentId: 'agent-row-2', input: { transactionId: 'txn-open', reason: 'duplicate', bank: 'citi' } },
      { sleep: () => Promise.resolve() },
    );
    const secondFinal =
      second.status === 'awaiting_approval'
        ? await (async () => {
            const row = dbState.actionsById.get(second.actionId);
            if (row) row.status = 'pending';
            return runAgent(
              chargeDisputeAgent,
              { userId: 'user-1', agentId: 'agent-row-2', input: { transactionId: 'txn-open', reason: 'duplicate', bank: 'citi' } },
              { sleep: () => Promise.resolve() },
            );
          })()
        : second;

    expect(secondFinal.status).toBe('succeeded');
    expect(secondFinal.result?.data?.alreadyOpen).toBe(true);
    // No second filing.
    expect(port.requests.length).toBe(1);
  });

  it('transient DB failure AFTER a successful bank filing does NOT double-file on retry', async () => {
    const port = mockBankDisputePort();
    setBankDisputePort(port);
    seedTxn('txn-retry', 120.5);

    // The bank call will succeed on the first attempt, but persisting the
    // 'filed' status (with bank_case_id) throws once — a DB blip. runAgent
    // retries; the agent re-issues fileDispute with the SAME idempotency key,
    // and the bank dedupes to the original case rather than opening a second
    // chargeback.
    dbState.failFiledUpdates = 1;

    const result = await runDispute({
      transactionId: 'txn-retry',
      reason: 'unauthorized',
      bank: 'chase',
      detectionScore: 0.91,
    });

    expect(result.status).toBe('succeeded');

    // CRITICAL: exactly ONE chargeback was filed at the bank despite the retry.
    expect(port.requests.length).toBe(1);

    // The dispute ends in a clean 'filed' terminal state with the bank case id.
    const dispute = [...dbState.disputesById.values()][0]!;
    expect(dispute.status).toBe('filed');
    expect(dispute.bank_case_id).toMatch(/^MOCK-chase-/);
    expect(dispute.filed_at).not.toBeNull();

    // Only one disputes row exists — the retry reused it, it did not create a
    // second dangling dispute.
    expect(dbState.disputesById.size).toBe(1);

    // The bank port saw the same idempotency key (the dispute id) it would have
    // re-sent on retry.
    expect(port.requests[0]!.idempotencyKey).toBe(dispute.id);
  });

  it('reentrant retry with a persisted bank_case_id reconciles to filed WITHOUT re-calling the bank', async () => {
    const port = mockBankDisputePort();
    setBankDisputePort(port);
    seedTxn('txn-stuck', 60);

    // Simulate a prior attempt of THIS action that filed with the bank
    // (bank_case_id persisted) but got stuck in 'filing' before reaching a
    // clean terminal state.
    const actionId = 'action-stuck';
    dbState.actionsById.set(actionId, {
      id: actionId,
      user_id: 'user-1',
      agent_id: 'agent-row-stuck',
      agent_type: 'charge_dispute',
      action_type: 'file_dispute',
      target: null,
      status: 'pending',
      idempotency_key: 'dispute:txn-stuck',
      audit_log: [],
      roi_amount: null,
      error_message: null,
    });
    dbState.disputesById.set('dispute-stuck', {
      id: 'dispute-stuck',
      user_id: 'user-1',
      transaction_id: 'txn-stuck',
      agent_action_id: actionId,
      status: 'filing',
      reason: 'duplicate',
      detection_score: null,
      amount: 60,
      recovered_amount: null,
      bank: 'amex',
      bank_case_id: 'EXISTING-CASE-123',
      filed_at: null,
      resolved_at: null,
      evidence: {},
      created_at: new Date().toISOString(),
    });

    const result = await runAgent(
      chargeDisputeAgent,
      { userId: 'user-1', agentId: 'agent-row-stuck', input: { transactionId: 'txn-stuck', reason: 'duplicate', bank: 'amex' } },
      { existingActionId: actionId, sleep: () => Promise.resolve() },
    );

    expect(result.status).toBe('succeeded');
    expect(result.result?.data?.alreadyFiled).toBe(true);
    expect(result.result?.data?.bankCaseId).toBe('EXISTING-CASE-123');

    // No bank call was made — the durable bank_case_id short-circuited filing.
    expect(port.requests.length).toBe(0);

    const dispute = dbState.disputesById.get('dispute-stuck')!;
    expect(dispute.status).toBe('filed');
    expect(dispute.bank_case_id).toBe('EXISTING-CASE-123');
  });

  it('rejects an unsupported bank', async () => {
    setBankDisputePort(mockBankDisputePort());
    seedTxn('txn-bad-bank', 10);
    const result = await runDispute({
      transactionId: 'txn-bad-bank',
      // @ts-expect-error — exercising the runtime guard with a bad bank.
      bank: 'monzo',
      reason: 'duplicate',
    });
    expect(result.status).toBe('escalated');
  });
});
