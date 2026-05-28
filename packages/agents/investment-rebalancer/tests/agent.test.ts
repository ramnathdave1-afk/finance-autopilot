import { describe, it, expect, beforeEach, vi } from 'vitest';

// --- Mock @fa/db BEFORE importing the agent. -------------------------------
// We model two surfaces: agent_actions (status + audit log, via the typed
// writers) and investment_holdings (read-only select with ordering).

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
}

interface HoldingRow {
  id: string;
  user_id: string;
  account_id: string;
  security_id: string | null;
  ticker: string | null;
  name: string | null;
  type: string | null;
  quantity: number;
  cost_basis: number | null;
  current_price: number | null;
  current_value: number | null;
  iso_currency_code: string;
  as_of: string;
  created_at: string;
}

const dbState = {
  actionsById: new Map<string, ActionRow>(),
  holdings: [] as HoldingRow[],
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
      if (table !== 'investment_holdings') throw new Error(`unexpected table ${table}`);
      let userFilter = '';
      const chain = {
        select: () => chain,
        eq: (_col: string, val: string) => {
          userFilter = val;
          return chain;
        },
        // getLatestHoldings: select().eq().order() then await.
        order: () => chain,
        then: (resolve: (v: { data: HoldingRow[]; error: null }) => unknown) => {
          const rows = dbState.holdings
            .filter((h) => h.user_id === userFilter)
            .sort((a, b) => (a.as_of < b.as_of ? 1 : a.as_of > b.as_of ? -1 : 0));
          return resolve({ data: rows, error: null });
        },
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
import { investmentRebalancerAgent, type InvestmentRebalancerInput } from '../src/agent';
import type { InvestmentRebalancerData } from '../src/agent';
import {
  setBrokeragePortFactory,
  resetBrokeragePortFactory,
  createMockQuotePort,
} from '../src/brokerage-port';

let holdingCounter = 0;
const holding = (over: Partial<HoldingRow> = {}): HoldingRow => ({
  id: `h-${++holdingCounter}`,
  user_id: 'user-1',
  account_id: 'acct-taxable',
  security_id: null,
  ticker: 'VTI',
  name: 'Vanguard Total Market',
  type: 'equity',
  quantity: 10,
  cost_basis: 1000,
  current_price: 100,
  current_value: 1000,
  iso_currency_code: 'USD',
  as_of: '2026-03-31',
  created_at: new Date().toISOString(),
  ...over,
});

const run = (input: Partial<InvestmentRebalancerInput> = {}) =>
  runAgent(
    investmentRebalancerAgent,
    {
      userId: 'user-1',
      agentId: 'agent-rebal-1',
      input: {
        target: { equity: 0.6, fixed_income: 0.4 },
        taxableAccountIds: ['acct-taxable'],
        period: '2026-Q1',
        ...input,
      },
    },
    { sleep: () => Promise.resolve(), existingActionId: 'action-pre' },
  );

describe('investmentRebalancerAgent', () => {
  beforeEach(() => {
    dbState.actionsById.clear();
    dbState.holdings.length = 0;
    holdingCounter = 0;
    startActionMock.mockClear();
    logStepMock.mockClear();
    resetBrokeragePortFactory();
    // Pre-seed the action row the router would have created (existingActionId).
    dbState.actionsById.set('action-pre', {
      id: 'action-pre',
      user_id: 'user-1',
      agent_id: 'agent-rebal-1',
      agent_type: 'investment_rebalancer',
      action_type: 'rebalance_recommendation',
      target: null,
      status: 'pending',
      idempotency_key: null,
      audit_log: [],
      roi_amount: null,
    });
  });

  it('recommends trades + flags harvest on a drifted, loss-bearing portfolio', async () => {
    dbState.holdings.push(
      holding({ account_id: 'acct-taxable', type: 'equity', current_value: 8000, cost_basis: 9000 }),
      holding({ account_id: 'acct-taxable', type: 'fixed_income', current_value: 2000, cost_basis: 2000, ticker: 'BND' }),
    );

    const result = await run();
    expect(result.status).toBe('succeeded');
    expect(result.result?.roi).toBeNull();

    const data = result.result?.data as unknown as InvestmentRebalancerData;
    expect(data.totalValue).toBe(10000);
    expect(data.autonomousTrade).toBe(false);
    // 80/20 vs 60/40 target -> sell equity, buy fixed_income.
    const sell = data.recommendedTrades.find((t) => t.assetClass === 'equity')!;
    expect(sell.side).toBe('sell');
    expect(sell.amount).toBeCloseTo(2000, 6);
    // equity below cost basis in a taxable account -> harvest candidate.
    expect(data.harvestCandidates).toHaveLength(1);
    expect(data.harvestCandidates[0]!.unrealizedLoss).toBeCloseTo(1000, 6);

    const log = dbState.actionsById.get(result.actionId)!.audit_log;
    const steps = log.map((s) => s.step);
    expect(steps).toContain('status:running');
    expect(steps).toContain('holdings:load:done');
    expect(steps).toContain('analysis:done');

    // Regression (finding #6): the full recommendation must be PERSISTED in the
    // analysis:done audit step so the UI can render the actual lists — runAgent
    // never stores result.data, so logging counts alone would discard it.
    const done = log.find((s) => s.step === 'analysis:done')!.detail as {
      recommendedTrades: unknown[];
      harvestCandidates: unknown[];
    };
    expect(done.recommendedTrades).toHaveLength(data.recommendedTrades.length);
    expect(done.harvestCandidates).toHaveLength(1);
  });

  it('empty portfolio: succeeds with no trades and no harvest', async () => {
    const result = await run({ target: {} });
    expect(result.status).toBe('succeeded');
    const data = result.result?.data as unknown as InvestmentRebalancerData;
    expect(data.totalValue).toBe(0);
    expect(data.recommendedTrades).toEqual([]);
    expect(data.harvestCandidates).toEqual([]);
  });

  it('already-balanced portfolio: no trades recommended', async () => {
    dbState.holdings.push(
      holding({ type: 'equity', current_value: 6000, cost_basis: 5000 }),
      holding({ type: 'fixed_income', current_value: 4000, cost_basis: 4000, ticker: 'BND' }),
    );
    const result = await run();
    const data = result.result?.data as unknown as InvestmentRebalancerData;
    expect(data.recommendedTrades).toEqual([]);
    expect(data.maxAbsDrift).toBeCloseTo(0, 6);
  });

  it('only the latest snapshot is used (older as_of ignored)', async () => {
    dbState.holdings.push(
      holding({ as_of: '2025-12-31', type: 'equity', current_value: 999999 }),
      holding({ as_of: '2026-03-31', type: 'equity', current_value: 6000 }),
      holding({ as_of: '2026-03-31', type: 'fixed_income', current_value: 4000, ticker: 'BND' }),
    );
    const result = await run();
    const data = result.result?.data as unknown as InvestmentRebalancerData;
    expect(data.totalValue).toBe(10000);
  });

  it('refreshPrices uses the brokerage port to reprice before analysis', async () => {
    dbState.holdings.push(
      holding({ type: 'equity', ticker: 'VTI', quantity: 10, current_value: 5000 }),
      holding({ type: 'fixed_income', ticker: 'BND', quantity: 10, current_value: 5000, cost_basis: 5000 }),
    );
    // Live price pushes VTI to 10 shares * $1100 = $11000 -> heavily overweight.
    setBrokeragePortFactory(() => createMockQuotePort([{ ticker: 'VTI', price: 1100 }]));

    const result = await run({ refreshPrices: true });
    expect(result.status).toBe('succeeded');
    const data = result.result?.data as unknown as InvestmentRebalancerData;
    expect(data.totalValue).toBe(16000); // 11000 + 5000
    const steps = dbState.actionsById.get(result.actionId)!.audit_log.map((s) => s.step);
    expect(steps).toContain('prices:refreshed');
  });

  it('escalates (does not fabricate) when a live price refresh fails', async () => {
    dbState.holdings.push(holding({ type: 'equity', ticker: 'VTI' }));
    setBrokeragePortFactory(() => ({
      async refreshQuotes() {
        throw new Error('quote provider down');
      },
    }));

    const result = await run({ refreshPrices: true });
    expect(result.status).toBe('escalated');
  });
});
