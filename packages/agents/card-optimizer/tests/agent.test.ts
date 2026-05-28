import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cardOptimizerAgent } from '../src/agent';
import type { CardRow } from '@fa/db/types';
import type { SpendingProfile } from '@fa/plaid';

// Mock @fa/db — supplies the agent-actions writers runAgent uses PLUS canAct.
vi.mock('@fa/db', () => {
  let nextId = 1;
  return {
    canAct: vi.fn(async () => ({ allowed: true, consent: 'approve_each' })),
    startAction: vi.fn(async (input) => ({
      id: `act_${nextId++}`,
      user_id: input.userId,
      agent_id: input.agentId,
      agent_type: input.agentType,
      action_type: input.actionType,
      target: input.target ?? null,
      status: input.requiresApproval ? 'awaiting_approval' : 'pending',
      idempotency_key: input.idempotencyKey ?? null,
      requested_at: new Date().toISOString(),
      approved_at: null,
      started_at: null,
      completed_at: null,
      roi_amount: null,
      audit_log: [],
      voice_recording_url: null,
      error_message: null,
      retry_count: 0,
    })),
    logStep: vi.fn(async () => {}),
    markRunning: vi.fn(async () => {}),
    markSucceeded: vi.fn(async () => {}),
    markFailed: vi.fn(async () => {}),
    markEscalated: vi.fn(async () => {}),
    markCancelled: vi.fn(async () => {}),
  };
});

// Mock the live data sources behind the agent so the body runs against fixtures
// (HONESTY: no real Plaid / DB calls; the engine math is exercised for real).
const PROFILE: SpendingProfile = {
  userId: 'u1',
  totalAnnualized: 16000,
  monthsObserved: 6,
  categorySpend: { Groceries: 10000, Restaurants: 6000 },
  topCategories: [
    { category: 'Groceries', annualSpend: 10000, share: 0.625 },
    { category: 'Restaurants', annualSpend: 6000, share: 0.375 },
  ],
};

const CATALOG: CardRow[] = [
  {
    id: 'c_groc',
    name: 'Grocery Hero',
    issuer: 'TestBank',
    network: 'visa',
    annual_fee: 0,
    signup_bonus: null,
    rewards: [
      { category: 'Groceries', multiplier: 6 },
      { category: 'Other', multiplier: 1 },
    ],
    benefits: [],
    application_url: 'https://example.com/apply',
    active: true,
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'c_flat',
    name: 'Flat Two',
    issuer: 'TestBank',
    network: 'visa',
    annual_fee: 0,
    signup_bonus: null,
    rewards: [{ category: 'Other', multiplier: 2 }],
    benefits: [],
    application_url: null,
    active: true,
    created_at: '2026-01-01T00:00:00Z',
  },
];

vi.mock('@fa/plaid', () => ({
  buildSpendingProfile: vi.fn(async () => PROFILE),
}));

vi.mock('../src/cards-catalog', () => ({
  fetchCardCatalog: vi.fn(async () => CATALOG),
  fetchHeldCardIds: vi.fn(async () => ['c_flat']),
}));

import { runAgent } from '@fa/inngest';
import { canAct } from '@fa/db';

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('cardOptimizerAgent', () => {
  it('is recommend-only: stops at awaiting_approval before running the body', async () => {
    const res = await runAgent(cardOptimizerAgent, {
      userId: 'u1',
      agentId: 'ag1',
      input: {},
    });
    expect(res.status).toBe('awaiting_approval');
  });

  it('builds a recommendation when invoked directly (post-approval path)', async () => {
    const calls: Array<{ step: string; ok: boolean }> = [];
    const result = await cardOptimizerAgent.run(
      {},
      {
        actionId: 'act_1',
        userId: 'u1',
        agentId: 'ag1',
        agentType: 'credit_card_optimizer',
        log: async (step, ok) => {
          calls.push({ step, ok });
        },
      },
    );

    const data = result.data as {
      result: {
        perCategory: Array<{ category: string; best: { cardId: string } | null }>;
        applyFor: Array<{ cardId: string; netAnnualValue: number }>;
      };
      autonomousApplication: false;
    };

    // Grocery Hero is the best card for the Groceries category.
    const groc = data.result.perCategory.find((c) => c.category === 'Groceries')!;
    expect(groc.best?.cardId).toBe('c_groc');
    // User holds only the flat 2x card, so Grocery Hero is recommended to apply for.
    expect(data.result.applyFor.map((a) => a.cardId)).toContain('c_groc');
    expect(data.autonomousApplication).toBe(false);
    // ROI = top apply-for net annual value (10000*6 - 10000*2 = 40000).
    expect(result.roi).toBe(40000);
    expect(calls.some((c) => c.step === 'proposal:built')).toBe(true);
  });

  it('throws when canAct denies (tier / paused / disabled)', async () => {
    vi.mocked(canAct).mockResolvedValueOnce({ allowed: false, reason: 'tier' });
    await expect(
      cardOptimizerAgent.run(
        {},
        {
          actionId: 'act_2',
          userId: 'u1',
          agentId: 'ag1',
          agentType: 'credit_card_optimizer',
          log: async () => {},
        },
      ),
    ).rejects.toThrow(/not permitted: tier/);
  });

  it('uses a stable idempotency key (one standing recommendation per user)', () => {
    expect(cardOptimizerAgent.idempotencyKey!({})).toBe('card_recommendation');
    expect(cardOptimizerAgent.idempotencyKey!({ windowMonths: 12 })).toBe('card_recommendation');
  });
});
