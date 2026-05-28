import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---- Mock @fa/db ----
const dbState = {
  rows: new Map<string, any>(),
  logs: [] as { actionId: string; step: string; ok: boolean }[],
  transitions: [] as { actionId: string; status: string; roi?: number | null }[],
};

vi.mock('@fa/db', () => ({
  createServiceClient: () => ({}),
  startAction: vi.fn(async (input: any) => {
    if (input.idempotencyKey) {
      const existing = [...dbState.rows.values()].find((r) => r.idempotency_key === input.idempotencyKey);
      if (existing) return existing;
    }
    const row = {
      id: `act-${dbState.rows.size + 1}`,
      user_id: input.userId,
      agent_id: input.agentId,
      status: 'pending',
      idempotency_key: input.idempotencyKey ?? null,
      audit_log: [],
    };
    dbState.rows.set(row.id, row);
    return row;
  }),
  logStep: vi.fn(async (actionId: string, step: any) => {
    dbState.logs.push({ actionId, step: step.step, ok: step.ok });
  }),
  markRunning: vi.fn(async (id: string) => {
    dbState.transitions.push({ actionId: id, status: 'running' });
  }),
  markSucceeded: vi.fn(async (id: string, roi: number | null) => {
    dbState.transitions.push({ actionId: id, status: 'succeeded', roi });
  }),
  markFailed: vi.fn(async (id: string) => {
    dbState.transitions.push({ actionId: id, status: 'failed' });
  }),
  markEscalated: vi.fn(async (id: string) => {
    dbState.transitions.push({ actionId: id, status: 'escalated' });
  }),
}));

// ---- Mock the aggregator to avoid needing a fake supabase here. ----
vi.mock('../src/aggregator', async () => {
  const actual = await vi.importActual<typeof import('../src/aggregator')>('../src/aggregator');
  return {
    ...actual,
    aggregateDailyBrief: vi.fn(async () => ({
      yesterdaySpend: 42.5,
      upcomingBills: [{ merchant: 'Netflix', amount: 15.99, dueAt: '2026-05-29T12:00:00Z' }],
      completedActions: [{ agentType: 'subscription_killer', actionType: 'cancel', roi: 9.99, target: 'Spotify' }],
    })),
  };
});

// ---- Mock @fa/claude ----
vi.mock('@fa/claude', () => ({
  FAST_MODEL: 'haiku',
  call: vi.fn(async () => ({
    text: 'You spent $42.50 yesterday and have one bill coming up.',
    inputTokens: 10,
    outputTokens: 10,
    cacheReadTokens: 0,
    cacheCreateTokens: 0,
    model: 'haiku',
    latencyMs: 5,
  })),
}));

import { setNotificationDispatcher } from '@fa/inngest';
const pushes: { userId: string; title: string; body: string }[] = [];
setNotificationDispatcher({
  push: async (userId, msg) => {
    pushes.push({ userId, title: msg.title, body: msg.body });
  },
  voiceMemo: async () => {},
});

// Import the agent ONCE at module load — defineAgent registers via side-effect
// and the registry rejects duplicates. We reuse runDailyBrief across tests
// and just reset per-test state in beforeEach.
import { runDailyBrief } from '../src/index';
import { composeBrief } from '../src/agent';

beforeEach(() => {
  dbState.rows.clear();
  dbState.logs.length = 0;
  dbState.transitions.length = 0;
  pushes.length = 0;
});

describe('dailyBriefAgent', () => {
  it('aggregates, calls Claude, sends a push, and succeeds', async () => {
    const res = await runDailyBrief({
      userId: 'u1',
      agentId: 'a1',
      input: { window: 'morning', now: '2026-05-28T12:00:00Z' },
    });

    expect(res.status).toBe('succeeded');
    expect(pushes).toHaveLength(1);
    expect(pushes[0]!.title).toBe('Good morning');
    expect(pushes[0]!.body).toContain('$42.50');
    expect(dbState.transitions.map((t) => t.status)).toEqual(['running', 'succeeded']);
    const steps = dbState.logs.map((l) => l.step);
    expect(steps).toContain('aggregate:start');
    expect(steps).toContain('claude:done');
    expect(steps).toContain('push:sent');
  });

  it('returns roi: null (info-only agent)', async () => {
    const res = await runDailyBrief({
      userId: 'u2',
      agentId: 'a1',
      input: { now: '2026-05-27T12:00:00Z' },
    });
    expect(res.status).toBe('succeeded');
    const succeeded = dbState.transitions.find((t) => t.status === 'succeeded');
    expect(succeeded?.roi).toBeNull();
  });

  it('is idempotent for the same day+window — same action_id on re-run', async () => {
    const a = await runDailyBrief({
      userId: 'u3',
      agentId: 'a1',
      input: { window: 'morning', now: '2026-05-26T07:00:00Z' },
    });
    const b = await runDailyBrief({
      userId: 'u3',
      agentId: 'a1',
      input: { window: 'morning', now: '2026-05-26T08:00:00Z' },
    });
    expect(a.actionId).toBe(b.actionId);
  });

  it('composeBrief feeds aggregate into Claude and returns trimmed text', async () => {
    const brief = await composeBrief(
      { yesterdaySpend: 0, upcomingBills: [], completedActions: [] },
      'morning',
    );
    expect(typeof brief).toBe('string');
    expect(brief.length).toBeGreaterThan(0);
  });
});
