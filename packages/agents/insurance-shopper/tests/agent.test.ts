import { describe, it, expect, beforeEach, vi } from 'vitest';

// --- Mocks must be declared BEFORE importing the agent. -------------------

interface PolicyRow {
  id: string;
  user_id: string;
  kind: string;
  carrier: string;
  monthly_premium: number;
  annual_premium: number | null;
  coverage: Record<string, unknown>;
}

const dbState = {
  actionsById: new Map<
    string,
    {
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
  >(),
  policies: new Map<string, PolicyRow>(),
  insertedQuotes: [] as Array<Record<string, unknown>>,
};

const startActionMock = vi.fn(
  async (input: {
    userId: string;
    agentId: string;
    agentType: string;
    actionType: string;
    target?: string | null;
    idempotencyKey?: string;
    requiresApproval?: boolean;
  }) => {
    const existing = [...dbState.actionsById.values()].find(
      (a) => a.agent_id === input.agentId && a.idempotency_key === (input.idempotencyKey ?? null),
    );
    if (existing && input.idempotencyKey) return existing;
    const id = `action-${dbState.actionsById.size + 1}`;
    const row = {
      id,
      user_id: input.userId,
      agent_id: input.agentId,
      agent_type: input.agentType,
      action_type: input.actionType,
      target: input.target ?? null,
      status: input.requiresApproval ? 'awaiting_approval' : 'pending',
      idempotency_key: input.idempotencyKey ?? null,
      audit_log: [] as Array<{ ts: string; step: string; ok: boolean; detail?: Record<string, unknown> }>,
      roi_amount: null as number | null,
    };
    dbState.actionsById.set(id, row);
    return row;
  },
);

const logStepMock = vi.fn(
  async (actionId: string, step: { step: string; ok: boolean; detail?: Record<string, unknown> }) => {
    const row = dbState.actionsById.get(actionId);
    if (row) row.audit_log.push({ ts: new Date().toISOString(), ...step });
  },
);

const transition = (actionId: string, status: string, extra?: Record<string, unknown>) => {
  const row = dbState.actionsById.get(actionId);
  if (row) {
    row.status = status;
    if (extra?.roi_amount !== undefined) row.roi_amount = extra.roi_amount as number | null;
    row.audit_log.push({
      ts: new Date().toISOString(),
      step: `status:${status}`,
      ok: status !== 'failed',
      detail: extra ?? {},
    });
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
      if (table === 'insurance_policies') {
        let capturedId = '';
        const chain = {
          select: () => chain,
          eq: (_col: string, val: string) => {
            capturedId = val;
            return chain;
          },
          maybeSingle: async () => ({ data: dbState.policies.get(capturedId) ?? null, error: null }),
        };
        return chain;
      }
      if (table === 'insurance_quotes') {
        return {
          insert: async (rows: Array<Record<string, unknown>>) => {
            dbState.insertedQuotes.push(...rows);
            return { error: null };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

vi.mock('@fa/inngest', async () => {
  const actual = await vi.importActual<typeof import('@fa/inngest')>('@fa/inngest');
  return actual;
});

// --- Now the agent + harness. --------------------------------------------

import { runAgent } from '@fa/inngest';
import { createInsuranceShopperAgent, type InsuranceShopperInput } from '../src/agent';
import { mockQuotePort } from '../src/mock-quote-port';

const seedPolicy = (p: PolicyRow) => dbState.policies.set(p.id, p);

const basePolicy = (overrides: Partial<PolicyRow> = {}): PolicyRow => ({
  id: 'pol-1',
  user_id: 'user-1',
  kind: 'auto',
  carrier: 'Nationwide',
  monthly_premium: 120,
  annual_premium: 1440,
  coverage: { bodily_injury: '100/300', zip: '85281' },
  ...overrides,
});

// defineAgent registers a single (type, actionType) tuple, so the agent is
// built ONCE. The active QuotePort is swapped per-test via this delegating
// port — exactly the seam the production code uses, just rebindable in tests.
let activePort: ReturnType<typeof mockQuotePort> = mockQuotePort();
const delegatingPort = {
  fetchQuotes: (req: Parameters<ReturnType<typeof mockQuotePort>['fetchQuotes']>[0]) =>
    activePort.fetchQuotes(req),
};
const agent = createInsuranceShopperAgent({ quotePort: delegatingPort });

const runWithPort = async (
  port: ReturnType<typeof mockQuotePort>,
  policyId = 'pol-1',
) => {
  activePort = port;
  const input: InsuranceShopperInput = { policyId };
  const start = await runAgent(
    agent,
    { userId: 'user-1', agentId: 'agent-row-1', input },
    { sleep: () => Promise.resolve() },
  );
  // Approval gate: flip to pending and re-run (same idempotency key → same row).
  if (start.status === 'awaiting_approval') {
    const row = dbState.actionsById.get(start.actionId);
    if (row) row.status = 'pending';
    return runAgent(
      agent,
      { userId: 'user-1', agentId: 'agent-row-1', input },
      { sleep: () => Promise.resolve() },
    );
  }
  return start;
};

describe('insuranceShopperAgent', () => {
  beforeEach(() => {
    dbState.actionsById.clear();
    dbState.policies.clear();
    dbState.insertedQuotes.length = 0;
    startActionMock.mockClear();
    logStepMock.mockClear();
  });

  it('re-quotes, ranks by price, writes all quotes, and returns annual savings as ROI', async () => {
    seedPolicy(basePolicy());
    const result = await runWithPort(mockQuotePort());

    expect(result.status).toBe('succeeded');
    // Mock returns >= 5 competitors (incumbent excluded — Nationwide not in roster).
    expect(dbState.insertedQuotes.length).toBeGreaterThanOrEqual(5);

    const data = result.result?.data as { best: { carrier: string }; hasBetterDeal: boolean };
    expect(data.hasBetterDeal).toBe(true);
    // Cheapest multiplier 0.78 * 120 = 93.60 → annual savings (120-93.6)*12 = 316.80
    expect(result.result?.roi).toBeCloseTo(316.8, 1);

    // First inserted quote is the best (ranked) deal.
    expect(dbState.insertedQuotes[0]!.monthly_premium).toBeCloseTo(93.6, 1);

    // Audit trail present.
    const row = dbState.actionsById.get(result.actionId);
    const steps = (row?.audit_log ?? []).map((s) => s.step);
    expect(steps).toContain('status:running');
    expect(steps).toContain('fetch-quotes:done');
    expect(steps).toContain('write-quotes:done');
  });

  it('renters policy is re-quoted against >= 5 renters carriers', async () => {
    seedPolicy(basePolicy({ id: 'pol-2', kind: 'renters', carrier: 'Lemonade', monthly_premium: 22 }));
    const result = await runWithPort(mockQuotePort(), 'pol-2');
    expect(result.status).toBe('succeeded');
    expect(dbState.insertedQuotes.length).toBeGreaterThanOrEqual(5);
    // Lemonade (incumbent) excluded from the written quotes.
    expect(dbState.insertedQuotes.some((q) => q.carrier === 'Lemonade')).toBe(false);
  });

  it('no-better-quote path: roi is null and hasBetterDeal=false', async () => {
    seedPolicy(basePolicy());
    // Force every competitor above current premium.
    const result = await runWithPort(mockQuotePort({ multipliers: [1.05, 1.1, 1.2, 1.3, 1.4, 1.5] }));
    expect(result.status).toBe('succeeded');
    expect(result.result?.roi).toBeNull();
    const data = result.result?.data as { hasBetterDeal: boolean };
    expect(data.hasBetterDeal).toBe(false);
    // Quotes are still persisted for the user to review.
    expect(dbState.insertedQuotes.length).toBeGreaterThanOrEqual(5);
  });

  it('throws (and escalates) when the policy does not exist', async () => {
    const result = await runWithPort(mockQuotePort(), 'missing-policy');
    expect(result.status).toBe('escalated');
    expect(dbState.insertedQuotes.length).toBe(0);
  });
});
