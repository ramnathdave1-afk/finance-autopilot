import { describe, it, expect, beforeEach, vi } from 'vitest';

const dbState = {
  rows: new Map<string, any>(),
  logs: [] as { actionId: string; step: string }[],
  transitions: [] as { actionId: string; status: string }[],
  txns: [] as any[],
  txnsErr: false,
};

vi.mock('@fa/db', () => ({
  createServiceClient: () => ({
    from: (_table: string) => {
      const chain: any = {
        select() { return chain; },
        eq() { return chain; },
        gte() { return chain; },
        order() { return chain; },
        then(resolve: (v: { data: unknown; error: unknown }) => unknown) {
          if (dbState.txnsErr) {
            return Promise.resolve(resolve({ data: null, error: { message: 'boom' } }));
          }
          return Promise.resolve(resolve({ data: dbState.txns, error: null }));
        },
      };
      return chain;
    },
  }),
  startAction: vi.fn(async (input: any) => {
    if (input.idempotencyKey) {
      const existing = [...dbState.rows.values()].find((r) => r.idempotency_key === input.idempotencyKey);
      if (existing) return existing;
    }
    const row = {
      id: `act-${dbState.rows.size + 1}`,
      user_id: input.userId,
      agent_id: input.agentId,
      agent_type: input.agentType,
      action_type: input.actionType,
      target: input.target ?? null,
      status: 'pending',
      idempotency_key: input.idempotencyKey ?? null,
      audit_log: [],
    };
    dbState.rows.set(row.id, row);
    return row;
  }),
  logStep: vi.fn(async (actionId: string, step: any) => {
    dbState.logs.push({ actionId, step: step.step });
  }),
  markRunning: vi.fn(async (id: string) => {
    dbState.transitions.push({ actionId: id, status: 'running' });
  }),
  markSucceeded: vi.fn(async (id: string) => {
    dbState.transitions.push({ actionId: id, status: 'succeeded' });
  }),
  markFailed: vi.fn(async (id: string) => {
    dbState.transitions.push({ actionId: id, status: 'failed' });
  }),
  markEscalated: vi.fn(async (id: string) => {
    dbState.transitions.push({ actionId: id, status: 'escalated' });
  }),
}));

const claudeText = {
  value: JSON.stringify({
    insights: [
      {
        title: 'Dining up 80%',
        body: 'You spent $150 on dining this month vs $30 last month.',
        impactDollars: 120,
        suggestedRule: {
          trigger: 'monthly_spend_threshold',
          condition: { field: 'monthly_spend_dining', op: 'gte', value: 200 },
          action: 'notify',
        },
      },
      {
        title: 'Gas down',
        body: 'Gas spend dropped $40 month over month.',
        impactDollars: 40,
      },
    ],
  }),
};

vi.mock('@fa/claude', () => ({
  FAST_MODEL: 'haiku',
  call: vi.fn(async () => ({
    text: claudeText.value,
    inputTokens: 100,
    outputTokens: 100,
    cacheReadTokens: 0,
    cacheCreateTokens: 0,
    model: 'haiku',
    latencyMs: 5,
  })),
}));

import { runSpendingCoach } from '../src/index';
import { generateInsights } from '../src/agent';

beforeEach(() => {
  dbState.rows.clear();
  dbState.logs.length = 0;
  dbState.transitions.length = 0;
  dbState.txns = [
    { id: '1', user_id: 'u1', amount: 100, ai_category: 'dining', date: '2026-05-15', category: null, account_id: 'a', provider: 'plaid', provider_transaction_id: 'p1', iso_currency_code: 'USD', merchant: null, raw_description: null, ai_category_confidence: null, ai_categorized_at: null, pending: false, is_subscription: false, subscription_id: null, created_at: '' },
    { id: '2', user_id: 'u1', amount: 30, ai_category: 'dining', date: '2026-04-15', category: null, account_id: 'a', provider: 'plaid', provider_transaction_id: 'p2', iso_currency_code: 'USD', merchant: null, raw_description: null, ai_category_confidence: null, ai_categorized_at: null, pending: false, is_subscription: false, subscription_id: null, created_at: '' },
  ];
  dbState.txnsErr = false;
  claudeText.value = JSON.stringify({
    insights: [
      { title: 'Dining up', body: '...', impactDollars: 120 },
      { title: 'Gas down', body: '...', impactDollars: 40 },
    ],
  });
});

describe('spendingCoachAgent', () => {
  it('pulls txns, calls Claude, persists one agent_action per insight', async () => {
    const res = await runSpendingCoach({
      userId: 'u1',
      agentId: 'a1',
      input: { now: '2026-05-28T00:00:00Z' },
    });

    expect(res.status).toBe('succeeded');
    const data = res.result?.data as { insightsCount: number; insightActionIds: string[] };
    expect(data.insightsCount).toBe(2);
    expect(data.insightActionIds).toHaveLength(2);

    // One outer agent_actions row + one per insight = 3 total.
    expect(dbState.rows.size).toBe(3);

    const steps = dbState.logs.map((l) => l.step);
    expect(steps).toContain('pull:start');
    expect(steps).toContain('claude:done');
    expect(steps).toContain('persist:done');
    expect(steps.filter((s) => s === 'insight:created')).toHaveLength(2);
  });

  it('caps insights at 3 even if model returns more', async () => {
    claudeText.value = JSON.stringify({
      insights: Array.from({ length: 7 }).map((_, i) => ({
        title: `Insight ${i}`,
        body: 'b',
        impactDollars: i,
      })),
    });
    const res = await runSpendingCoach({
      userId: 'u1',
      agentId: 'a1',
      input: { now: '2026-05-28T00:00:00Z' },
    });
    const data = res.result?.data as { insightsCount: number };
    expect(data.insightsCount).toBe(3);
  });

  it('is idempotent per day — same outer action_id on re-run', async () => {
    const a = await runSpendingCoach({ userId: 'u2', agentId: 'a1', input: { now: '2026-05-28T01:00:00Z' } });
    const b = await runSpendingCoach({ userId: 'u2', agentId: 'a1', input: { now: '2026-05-28T23:00:00Z' } });
    expect(a.actionId).toBe(b.actionId);
  });

  it('returns roi: null and zero insights on empty txn history', async () => {
    dbState.txns = [];
    const res = await runSpendingCoach({ userId: 'u3', agentId: 'a1', input: { now: '2026-05-28T00:00:00Z' } });
    expect(res.status).toBe('succeeded');
    const data = res.result?.data as { insightsCount: number };
    expect(data.insightsCount).toBe(0);
  });

  it('generateInsights tolerates fenced JSON from the model', async () => {
    claudeText.value = '```json\n' + JSON.stringify({
      insights: [{ title: 'x', body: 'y', impactDollars: 1 }],
    }) + '\n```';
    const insights = await generateInsights(dbState.txns as any, new Date('2026-05-28T00:00:00Z'));
    expect(insights).toHaveLength(1);
    expect(insights[0]!.title).toBe('x');
  });
});
