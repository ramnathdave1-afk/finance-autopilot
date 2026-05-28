import { describe, it, expect, beforeEach, vi } from 'vitest';

const dbState = {
  rows: new Map<string, any>(),
  logs: [] as { actionId: string; step: string }[],
  transitions: [] as { actionId: string; status: string }[],
  history: [] as any[],
};

vi.mock('@fa/db', () => ({
  getSnapshotHistory: vi.fn(async () => dbState.history),
  startAction: vi.fn(async (input: any) => {
    if (input.idempotencyKey) {
      const existing = [...dbState.rows.values()].find(
        (r) => r.idempotency_key === input.idempotencyKey,
      );
      if (existing) return existing;
    }
    const row = {
      id: `act-${dbState.rows.size + 1}`,
      user_id: input.userId,
      agent_id: input.agentId,
      agent_type: input.agentType,
      action_type: input.actionType,
      target: input.target ?? null,
      // Tier-3 requires approval — model the awaiting_approval gate that
      // startAction would apply for a requiresApproval action.
      status: input.requiresApproval ? 'awaiting_approval' : 'pending',
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

const claude = {
  text: JSON.stringify({
    headline: 'At your current pace you hit $250K well after 2030 — here is how to close the gap.',
    levers: [
      { title: 'Raise savings rate 5%', rationale: 'Closes most of the gap.', effort: 'medium' },
      { title: 'Max your Roth IRA', rationale: 'Tax-free compounding adds up.', effort: 'low' },
    ],
  }),
  calls: 0,
};

vi.mock('@fa/claude', () => ({
  DEFAULT_MODEL: 'sonnet',
  call: vi.fn(async () => {
    claude.calls += 1;
    return {
      text: claude.text,
      inputTokens: 100,
      outputTokens: 100,
      cacheReadTokens: 0,
      cacheCreateTokens: 0,
      model: 'sonnet',
      latencyMs: 5,
    };
  }),
}));

import { runNetWorthStrategy } from '../src/index';
import type { NetWorthStrategyData } from '../src/agent';

const snap = (date: string, net_worth: number) => ({
  id: date,
  user_id: 'u1',
  snapshot_date: date,
  total_assets: net_worth,
  total_liabilities: 0,
  net_worth,
  breakdown: {},
  created_at: '',
});

beforeEach(() => {
  dbState.rows.clear();
  dbState.logs.length = 0;
  dbState.transitions.length = 0;
  dbState.history = [snap('2025-01-01', 10_000), snap('2026-01-01', 100_000)];
  claude.calls = 0;
  claude.text = JSON.stringify({
    headline: 'h',
    levers: [{ title: 'Raise savings rate', rationale: 'r', effort: 'medium' }],
  });
});

describe('netWorthStrategyAgent', () => {
  it('gates on approval (Tier-3 recommend-only) before running', async () => {
    const res = await runNetWorthStrategy({
      userId: 'u1',
      agentId: 'strategy',
      input: { target: { amount: 250_000, date: '2030-01-01' } },
    });
    expect(res.status).toBe('awaiting_approval');
    // Did not call Claude or transition to running — approval gate held.
    expect(claude.calls).toBe(0);
    expect(dbState.transitions).toHaveLength(0);
  });

  it('projects, calls Claude, and returns recommend-only data when run past approval', async () => {
    // existingActionId bypasses the approval gate (simulates a user-approved run).
    const { runAgent } = await import('@fa/inngest');
    const { netWorthStrategyAgent } = await import('../src/agent');
    const res = await runAgent(
      netWorthStrategyAgent,
      {
        userId: 'u1',
        agentId: 'strategy',
        input: { target: { amount: 250_000, date: '2030-01-01' } },
      },
      { existingActionId: 'approved-1' },
    );

    expect(res.status).toBe('succeeded');
    const data = res.result?.data as unknown as NetWorthStrategyData;
    expect(data.insufficientHistory).toBe(false);
    expect(data.currentNetWorth).toBe(100_000);
    expect(data.asOf).toBe('2026-01-01');
    expect(data.dollarsPerDay).toBeGreaterThan(0);
    expect(data.recommendation.levers.length).toBeGreaterThan(0);
    expect(res.result?.roi).toBeNull();
    expect(claude.calls).toBe(1);

    const steps = dbState.logs.map((l) => l.step);
    expect(steps).toContain('history:pull');
    expect(steps).toContain('projection:done');
    expect(steps).toContain('strategy:done');
  });

  it('succeeds with insufficientHistory flag and no Claude call when < 2 snapshots', async () => {
    dbState.history = [snap('2026-01-01', 10_000)];
    const { runAgent } = await import('@fa/inngest');
    const { netWorthStrategyAgent } = await import('../src/agent');
    const res = await runAgent(
      netWorthStrategyAgent,
      {
        userId: 'u1',
        agentId: 'strategy',
        input: { target: { amount: 250_000, date: '2030-01-01' } },
      },
      { existingActionId: 'approved-2' },
    );

    expect(res.status).toBe('succeeded');
    const data = res.result?.data as unknown as NetWorthStrategyData;
    expect(data.insufficientHistory).toBe(true);
    expect(data.currentNetWorth).toBe(10_000);
    expect(data.recommendation.levers).toHaveLength(0);
    expect(claude.calls).toBe(0);
    expect(dbState.logs.map((l) => l.step)).toContain('projection:insufficient');
  });

  it('is idempotent per (target amount, date)', async () => {
    const a = await runNetWorthStrategy({
      userId: 'u1',
      agentId: 'strategy',
      input: { target: { amount: 250_000, date: '2030-01-01' } },
    });
    const b = await runNetWorthStrategy({
      userId: 'u1',
      agentId: 'strategy',
      input: { target: { amount: 250_000, date: '2030-01-01' } },
    });
    expect(a.actionId).toBe(b.actionId);
  });
});
