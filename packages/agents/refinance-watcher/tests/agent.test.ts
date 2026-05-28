import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { LoanRow, LoanType, RateSnapshotRow } from '@fa/db/types';

// --- DB mock (mirrors subscription-killer's agent.test.ts approach). --------

interface ActionRow {
  id: string;
  user_id: string;
  agent_id: string;
  agent_type: string;
  action_type: string;
  target: string | null;
  status: string;
  idempotency_key: string | null;
  audit_log: Array<{ step: string; ok: boolean; detail?: Record<string, unknown> }>;
  roi_amount: number | null;
}

const dbState = {
  actionsById: new Map<string, ActionRow>(),
  loans: [] as LoanRow[],
  snapshots: [] as RateSnapshotRow[],
  /** When set, the loans query returns this Supabase error (exercises the
   *  throw-on-error branch in loan-store.ts). */
  loansError: null as { message: string } | null,
};

const startActionMock = vi.fn(async (input: {
  userId: string; agentId: string; agentType: string; actionType: string;
  target?: string | null; idempotencyKey?: string; requiresApproval?: boolean;
}) => {
  const existing = [...dbState.actionsById.values()].find(
    (a) => a.agent_id === input.agentId && a.idempotency_key === (input.idempotencyKey ?? null),
  );
  if (existing && input.idempotencyKey) return existing;
  const id = `action-${dbState.actionsById.size + 1}`;
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
  };
  dbState.actionsById.set(id, row);
  return row;
});

const logStepMock = vi.fn(async (actionId: string, step: { step: string; ok: boolean; detail?: Record<string, unknown> }) => {
  dbState.actionsById.get(actionId)?.audit_log.push(step);
});

const transition = (actionId: string, status: string, extra?: Record<string, unknown>) => {
  const row = dbState.actionsById.get(actionId);
  if (!row) return;
  row.status = status;
  if (extra?.roi_amount !== undefined) row.roi_amount = extra.roi_amount as number | null;
  row.audit_log.push({ step: `status:${status}`, ok: status !== 'failed', detail: extra ?? {} });
};

vi.mock('@fa/db', () => ({
  startAction: (...a: unknown[]) => startActionMock(...(a as Parameters<typeof startActionMock>)),
  logStep: (...a: unknown[]) => logStepMock(...(a as Parameters<typeof logStepMock>)),
  markRunning: async (id: string) => transition(id, 'running'),
  markSucceeded: async (id: string, roi: number | null) => transition(id, 'succeeded', { roi_amount: roi }),
  markFailed: async (id: string, msg: string) => transition(id, 'failed', { error_message: msg }),
  markEscalated: async (id: string, reason: string) => transition(id, 'escalated', { reason }),
  createServiceClient: () => ({
    from(table: string) {
      if (table === 'loans') {
        const chain = {
          select: () => chain,
          eq: async (_col: string, userId: string) =>
            dbState.loansError
              ? { data: null, error: dbState.loansError }
              : {
                  data: dbState.loans.filter((l) => l.user_id === userId),
                  error: null,
                },
        };
        return chain;
      }
      if (table === 'rate_snapshots') {
        let types: LoanType[] = [];
        const chain = {
          select: () => chain,
          in: (_col: string, vals: LoanType[]) => {
            types = vals;
            return chain;
          },
          order: (_col: string, _opts: unknown) => {
            const rows = dbState.snapshots
              .filter((s) => types.includes(s.loan_type))
              .sort((a, b) => (a.captured_on < b.captured_on ? 1 : -1));
            return Promise.resolve({ data: rows, error: null });
          },
        };
        return chain;
      }
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

vi.mock('@fa/inngest', async () => {
  const actual = await vi.importActual<typeof import('@fa/inngest')>('@fa/inngest');
  return actual;
});

import { runAgent } from '@fa/inngest';
import { refinanceWatcherAgent } from '../src/agent';

// --- Fixture builders. ------------------------------------------------------

let loanSeq = 0;
function makeLoan(over: Partial<LoanRow> & { user_id: string; loan_type: LoanType }): LoanRow {
  loanSeq += 1;
  return {
    id: `loan-${loanSeq}`,
    servicer: 'Test Servicer',
    principal: 250_000,
    current_balance: 250_000,
    apr: 0.07,
    term_months: 360,
    remaining_months: 360,
    origination_date: null,
    account_id: null,
    notes: null,
    created_at: '2026-01-01T00:00:00Z',
    ...over,
  } as LoanRow;
}

let snapSeq = 0;
function makeSnapshot(loanType: LoanType, aprAvg: number, capturedOn = '2026-05-28'): RateSnapshotRow {
  snapSeq += 1;
  return {
    id: `snap-${snapSeq}`,
    loan_type: loanType,
    source: 'bankrate',
    apr_low: aprAvg - 0.0025,
    apr_avg: aprAvg,
    apr_high: aprAvg + 0.0025,
    captured_on: capturedOn,
    created_at: `${capturedOn}T00:00:00Z`,
  };
}

async function run(userId: string) {
  // requiresApproval=true → first run returns awaiting_approval. Flip to pending
  // (simulating user approval in the web app) and re-run, as subscription-killer does.
  const first = await runAgent(
    refinanceWatcherAgent,
    { userId, agentId: 'agent-refi-1', input: { userId, evaluatedOn: '2026-05-28' } },
    { sleep: () => Promise.resolve() },
  );
  if (first.status !== 'awaiting_approval') return first;
  const row = dbState.actionsById.get(first.actionId);
  if (row) row.status = 'pending';
  return runAgent(
    refinanceWatcherAgent,
    { userId, agentId: 'agent-refi-1', input: { userId, evaluatedOn: '2026-05-28' } },
    { sleep: () => Promise.resolve() },
  );
}

describe('refinanceWatcherAgent', () => {
  beforeEach(() => {
    dbState.actionsById.clear();
    dbState.loans = [];
    dbState.snapshots = [];
    dbState.loansError = null;
    startActionMock.mockClear();
    logStepMock.mockClear();
  });

  it('savings clears threshold → surfaces an opportunity with ROI', async () => {
    dbState.loans = [makeLoan({ user_id: 'u1', loan_type: 'mortgage', apr: 0.07 })];
    dbState.snapshots = [makeSnapshot('mortgage', 0.055)];

    const res = await run('u1');
    expect(res.status).toBe('succeeded');
    const data = res.result?.data as { opportunities: unknown[]; loansEvaluated: number };
    expect(data.loansEvaluated).toBe(1);
    expect(data.opportunities).toHaveLength(1);
    expect(res.result?.roi).toBeGreaterThan(0);
  });

  it('below threshold → no opportunity, roi null', async () => {
    // 0.061 → 0.06 on a small short loan: savings well under $1000.
    dbState.loans = [
      makeLoan({
        user_id: 'u1',
        loan_type: 'auto',
        apr: 0.061,
        principal: 4_000,
        current_balance: 4_000,
        term_months: 24,
        remaining_months: 24,
      }),
    ];
    dbState.snapshots = [makeSnapshot('auto', 0.06)];

    const res = await run('u1');
    expect(res.status).toBe('succeeded');
    const data = res.result?.data as { opportunities: unknown[]; loansEvaluated: number };
    expect(data.loansEvaluated).toBe(1);
    expect(data.opportunities).toHaveLength(0);
    expect(res.result?.roi).toBeNull();
  });

  it('no loans → no-op, roi null', async () => {
    dbState.loans = [];
    const res = await run('u1');
    expect(res.status).toBe('succeeded');
    const data = res.result?.data as { opportunities: unknown[]; loansEvaluated: number };
    expect(data.loansEvaluated).toBe(0);
    expect(data.opportunities).toHaveLength(0);
    expect(res.result?.roi).toBeNull();
    // Audit trail records the no-loans branch.
    const row = dbState.actionsById.get(res.actionId);
    expect(row?.audit_log.some((s) => s.step === 'evaluate:no-loans')).toBe(true);
  });

  it('multiple loan types → evaluates each against its own snapshot', async () => {
    dbState.loans = [
      makeLoan({ user_id: 'u1', loan_type: 'mortgage', apr: 0.07 }), // clears (250k, big delta)
      makeLoan({
        user_id: 'u1',
        loan_type: 'student',
        apr: 0.065,
        principal: 40_000,
        current_balance: 40_000,
        term_months: 120,
        remaining_months: 120,
      }), // clears (0.065 → 0.045 on 40k/120mo)
      makeLoan({
        user_id: 'u1',
        loan_type: 'auto',
        apr: 0.061,
        principal: 4_000,
        current_balance: 4_000,
        term_months: 24,
        remaining_months: 24,
      }), // below threshold
    ];
    dbState.snapshots = [
      makeSnapshot('mortgage', 0.055),
      makeSnapshot('student', 0.045),
      makeSnapshot('auto', 0.06),
      // Newer mortgage snapshot to prove latest-wins selection.
      makeSnapshot('mortgage', 0.099, '2026-05-20'),
    ];

    const res = await run('u1');
    expect(res.status).toBe('succeeded');
    const data = res.result?.data as {
      opportunities: Array<{ loanType: LoanType; offeredApr: number }>;
      loansEvaluated: number;
    };
    expect(data.loansEvaluated).toBe(3);
    const types = data.opportunities.map((o) => o.loanType).sort();
    expect(types).toEqual(['mortgage', 'student']);
    // Latest mortgage snapshot (0.055 captured 2026-05-28) was used, not 0.099.
    const mort = data.opportunities.find((o) => o.loanType === 'mortgage');
    expect(mort?.offeredApr).toBe(0.055);
  });

  it('loan with no published snapshot is skipped (no fabricated rate)', async () => {
    dbState.loans = [makeLoan({ user_id: 'u1', loan_type: 'heloc', apr: 0.09 })];
    dbState.snapshots = []; // no heloc rate available

    const res = await run('u1');
    expect(res.status).toBe('succeeded');
    const data = res.result?.data as { opportunities: unknown[]; loansEvaluated: number };
    expect(data.loansEvaluated).toBe(1);
    expect(data.opportunities).toHaveLength(0);
    const row = dbState.actionsById.get(res.actionId);
    expect(row?.audit_log.some((s) => s.step === 'loan:no-snapshot')).toBe(true);
  });

  it('loans query errors → run throws, action escalates (failure path)', async () => {
    // Mirrors goal-funder/tests/agent.test.ts:112 — exercise the failure path so
    // a regression that swallows a Supabase error (loan-store.ts:17) is caught.
    dbState.loansError = { message: 'boom' };

    const res = await run('u1');
    expect(res.status).toBe('escalated');

    // The action row reached failed then escalated, with the error in the audit log.
    const row = dbState.actionsById.get(res.actionId);
    const steps = (row?.audit_log ?? []).map((s) => s.step);
    expect(steps).toContain('status:failed');
    expect(steps).toContain('status:escalated');
    expect(
      row?.audit_log.some(
        (s) => s.step === 'run:error' && String(s.detail?.error ?? '').includes('boom'),
      ),
    ).toBe(true);
  });
});
