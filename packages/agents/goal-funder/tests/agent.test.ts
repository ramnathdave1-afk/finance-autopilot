import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { goalFunderAgent } from '../src/agent';
import type { GoalInput } from '../src/funding-calc';

// Mock @fa/db before importing runAgent — runAgent imports from @fa/db.
vi.mock('@fa/db', () => {
  let nextId = 1;
  return {
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

import { runAgent } from '@fa/inngest';

const goals: GoalInput[] = [
  { id: 'g1', name: 'Emergency Fund', targetCents: 600_000, currentCents: 0, targetDate: '2026-12-01' },
  { id: 'g2', name: 'Vacation', targetCents: 300_000, currentCents: 0, targetDate: '2026-12-01' },
];

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('goalFunderAgent', () => {
  it('stops at awaiting_approval (recommend-mode, no autonomous money movement)', async () => {
    const res = await runAgent(goalFunderAgent, {
      userId: 'u1',
      agentId: 'ag1',
      input: {
        paycheck: { id: 'txn_1', amountCents: 500_000, date: '2026-06-01' },
        goals,
      },
    });
    expect(res.status).toBe('awaiting_approval');
  });

  it('builds a funding proposal when invoked directly (post-approval path)', async () => {
    const calls: Array<{ step: string; ok: boolean }> = [];
    const result = await goalFunderAgent.run(
      {
        paycheck: { id: 'txn_42', amountCents: 500_000, date: '2026-06-01' },
        goals,
        fundingRate: 0.5, // earmark $2,500 toward goals
      },
      {
        actionId: 'act_42',
        userId: 'u1',
        agentId: 'ag1',
        agentType: 'goal_funder',
        log: async (step, ok) => {
          calls.push({ step, ok });
        },
      },
    );
    expect(result.roi).toBeNull();
    const data = result.data as {
      proposal: {
        budgetCents: number;
        contributions: unknown[];
        totalContributedCents: number;
        autonomousTransfer: false;
      };
    };
    expect(data.proposal.budgetCents).toBe(250_000);
    expect(data.proposal.contributions.length).toBeGreaterThan(0);
    expect(data.proposal.totalContributedCents).toBeLessThanOrEqual(250_000);
    expect(data.proposal.autonomousTransfer).toBe(false);
    expect(calls.some((c) => c.step === 'proposal:built')).toBe(true);
  });

  it('uses a stable idempotency key per paycheck', () => {
    const k1 = goalFunderAgent.idempotencyKey!({
      paycheck: { id: 'txn_1', amountCents: 100, date: '2026-01-01' },
      goals: [],
    });
    const k2 = goalFunderAgent.idempotencyKey!({
      paycheck: { id: 'txn_1', amountCents: 999, date: '2026-02-01' },
      goals,
    });
    expect(k1).toBe(k2);
    expect(k1).toBe('funding:txn_1');
  });

  it('fails (and escalates) on an invalid fundingRate — failure path', async () => {
    const res = await runAgent(
      goalFunderAgent,
      {
        userId: 'u1',
        agentId: 'ag1',
        input: {
          paycheck: { id: 'txn_bad', amountCents: 500_000, date: '2026-06-01' },
          goals,
          fundingRate: 2, // out of range → run() throws
        },
      },
      // skip approval gate + real retry delays so we exercise the run body
      { existingActionId: 'act_bad', sleep: async () => {} },
    );
    expect(res.status).toBe('escalated');
  });
});
