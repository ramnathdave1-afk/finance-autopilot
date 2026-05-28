import { describe, it, expect, beforeEach, vi } from 'vitest';

// --- Mock @fa/db BEFORE importing the agent. -------------------------------
// We model agent_actions (status + audit log via the typed writers) and the
// transactions table (select with date range + user filter).

interface ActionRow {
  id: string;
  status: string;
  roi_amount: number | null;
  audit_log: Array<{ ts: string; step: string; ok: boolean; detail?: Record<string, unknown> }>;
}

interface TxRow {
  id: string;
  user_id: string;
  amount: number;
  merchant: string | null;
  raw_description: string | null;
  ai_category: string | null;
  category: string | null;
  date: string;
  pending: boolean;
}

const dbState = {
  actionsById: new Map<string, ActionRow>(),
  txns: [] as TxRow[],
};

const startActionMock = vi.fn(async (input: { requiresApproval?: boolean }) => {
  const id = `action-${dbState.actionsById.size + 1}`;
  const row: ActionRow = {
    id,
    status: input.requiresApproval ? 'awaiting_approval' : 'pending',
    roi_amount: null,
    audit_log: [],
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
    if (extra?.roi_amount !== undefined) row.roi_amount = extra.roi_amount as number | null;
    row.audit_log.push({ ts: new Date().toISOString(), step: `status:${status}`, ok: status !== 'failed', detail: extra ?? {} });
  }
};

vi.mock('@fa/db', () => ({
  startAction: (...args: unknown[]) => startActionMock(...(args as Parameters<typeof startActionMock>)),
  logStep: (...args: unknown[]) => logStepMock(...(args as Parameters<typeof logStepMock>)),
  markRunning: async (id: string) => transition(id, 'running'),
  markSucceeded: async (id: string, roi: number | null) => transition(id, 'succeeded', { roi_amount: roi }),
  markFailed: async (id: string, msg: string) => transition(id, 'failed', { error_message: msg }),
  markEscalated: async (id: string, reason: string) => transition(id, 'escalated', { reason }),
  createServiceClient: () => ({
    from(table: string) {
      if (table !== 'transactions') throw new Error(`unexpected table ${table}`);
      let userFilter = '';
      let gte = '';
      let lte = '';
      const chain = {
        select: () => chain,
        eq: (_c: string, v: string) => {
          userFilter = v;
          return chain;
        },
        gte: (_c: string, v: string) => {
          gte = v;
          return chain;
        },
        lte: (_c: string, v: string) => {
          lte = v;
          return chain;
        },
        order: () => ({
          then: (resolve: (v: { data: TxRow[]; error: null }) => unknown) =>
            resolve({
              data: dbState.txns.filter(
                (t) => t.user_id === userFilter && t.date >= gte && t.date <= lte,
              ),
              error: null,
            }),
        }),
      };
      return chain;
    },
  }),
}));

vi.mock('@fa/inngest', async () => {
  const actual = await vi.importActual<typeof import('@fa/inngest')>('@fa/inngest');
  return actual;
});

// --- Now import the agent + harness. ---------------------------------------

import { runAgent } from '@fa/inngest';
import { taxPrepAgent, type TaxPrepInput } from '../src/agent';
import {
  setTaxFilingPortFactory,
  resetTaxFilingPortFactory,
  createMockTaxFilingPort,
} from '../src/tax-filing-port';

function seedTxns() {
  dbState.txns = [
    { id: 't1', user_id: 'user-1', amount: -1000, merchant: 'Stripe', raw_description: null, ai_category: null, category: null, date: '2025-03-01', pending: false },
    { id: 't2', user_id: 'user-1', amount: 120, merchant: 'Figma', raw_description: null, ai_category: 'Software', category: null, date: '2025-04-01', pending: false },
    { id: 't3', user_id: 'user-1', amount: -50, merchant: 'Patreon', raw_description: null, ai_category: null, category: null, date: '2025-05-01', pending: false },
    { id: 't4', user_id: 'user-1', amount: -9999, merchant: 'Stripe', raw_description: null, ai_category: null, category: null, date: '2024-06-01', pending: false }, // prior year
  ];
}

// requiresApproval:true means a fresh runAgent stops at awaiting_approval. To
// exercise the run body we use existingActionId (the router/approved path) the
// same way apps/web's router runs an already-approved action.
const runApproved = (input: TaxPrepInput) => {
  const id = `pre-${dbState.actionsById.size + 1}`;
  dbState.actionsById.set(id, { id, status: 'approved', roi_amount: null, audit_log: [] });
  return runAgent(
    taxPrepAgent,
    { userId: 'user-1', agentId: 'agent-tax-1', input },
    { sleep: () => Promise.resolve(), existingActionId: id },
  );
};

describe('taxPrepAgent', () => {
  beforeEach(() => {
    dbState.actionsById.clear();
    dbState.txns = [];
    startActionMock.mockClear();
    logStepMock.mockClear();
    resetTaxFilingPortFactory();
  });

  it('requires approval: a fresh run halts at awaiting_approval (recommend-only gate)', async () => {
    seedTxns();
    const result = await runAgent(
      taxPrepAgent,
      { userId: 'user-1', agentId: 'agent-tax-1', input: { taxYear: 2025 } },
      { sleep: () => Promise.resolve() },
    );
    expect(result.status).toBe('awaiting_approval');
    // Body never ran -> no transaction scan logged.
    expect(result.result).toBeUndefined();
  });

  it('approved run: scans the year, builds the summary, writes it to the audit log, roi null', async () => {
    seedTxns();
    const result = await runApproved({ taxYear: 2025 });
    expect(result.status).toBe('succeeded');
    expect(result.result?.roi).toBeNull();

    const data = result.result?.data as {
      summary: { total1099Income: number; totalDeductions: number; netSelfEmploymentEstimate: number };
      handoff: unknown;
    };
    expect(data.summary.total1099Income).toBe(1050); // Stripe 1000 + Patreon 50; prior-year excluded
    expect(data.summary.totalDeductions).toBe(120);
    expect(data.summary.netSelfEmploymentEstimate).toBe(930);
    expect(data.handoff).toBeNull(); // no handoff requested -> recommend-only

    const row = dbState.actionsById.get(result.actionId)!;
    const steps = row.audit_log.map((s) => s.step);
    expect(steps).toContain('scan:done');
    expect(steps).toContain('summary:built');
    expect(steps).not.toContain('handoff:start');
  });

  it('edge: a year with no income still succeeds with a zeroed summary', async () => {
    dbState.txns = [
      { id: 'x', user_id: 'user-1', amount: 40, merchant: 'Safeway', raw_description: null, ai_category: 'Groceries', category: null, date: '2025-02-01', pending: false },
    ];
    const result = await runApproved({ taxYear: 2025 });
    expect(result.status).toBe('succeeded');
    const data = result.result?.data as { summary: { total1099Income: number; income1099: unknown[] } };
    expect(data.summary.total1099Income).toBe(0);
    expect(data.summary.income1099).toEqual([]);
  });

  it('handoff requested: routes through TaxFilingPort and records the result', async () => {
    seedTxns();
    setTaxFilingPortFactory(() => createMockTaxFilingPort({ referenceId: 'TT-XYZ', continueUrl: 'https://tt.test/XYZ' }));

    const result = await runApproved({ taxYear: 2025, handoff: { provider: 'turbotax' } });
    expect(result.status).toBe('succeeded');

    const data = result.result?.data as { handoff: { referenceId: string; continueUrl: string } | null };
    expect(data.handoff?.referenceId).toBe('TT-XYZ');

    const steps = dbState.actionsById.get(result.actionId)!.audit_log.map((s) => s.step);
    expect(steps).toContain('handoff:start');
    expect(steps).toContain('handoff:done');
  });

  it('handoff is computed for the EXACT tax year the user reviewed (not the calendar year)', async () => {
    seedTxns();
    let seen: { taxYear: number; total1099Income: number } | null = null;
    setTaxFilingPortFactory(() => ({
      async handoff(req) {
        seen = { taxYear: req.taxYear, total1099Income: req.summary.total1099Income };
        return { provider: req.provider, referenceId: 'TT-1', continueUrl: 'https://tt.test/1' };
      },
    }));

    const result = await runApproved({ taxYear: 2025, handoff: { provider: 'turbotax' } });
    expect(result.status).toBe('succeeded');
    // The summary handed off must be for 2025 (the reviewed year), with the
    // 2025-scoped income — proving the handoff is not recomputed for a default.
    expect(seen!.taxYear).toBe(2025);
    expect(seen!.total1099Income).toBe(1050);
  });

  it('honesty: an uncredentialed live filing port escalates (never fakes a handoff)', async () => {
    seedTxns();
    // Default factory reads env; with no creds it throws -> retries exhaust -> escalated.
    const result = await runApproved({ taxYear: 2025, handoff: { provider: 'hrblock' } });
    expect(result.status).toBe('escalated');
    const steps = dbState.actionsById.get(result.actionId)!.audit_log.map((s) => s.step);
    expect(steps).toContain('run:error');
  });
});
