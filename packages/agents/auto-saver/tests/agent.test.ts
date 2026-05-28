import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { autoSaverAgent } from '../src/agent';

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

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('autoSaverAgent', () => {
  it('stops at awaiting_approval (recommend-mode, no autonomous money movement)', async () => {
    const res = await runAgent(autoSaverAgent, {
      userId: 'u1',
      agentId: 'ag1',
      input: {
        paycheckTxnId: 'txn_1',
        amountCents: 300_000,
        depositedAt: '2026-05-15',
      },
    });
    // requiresApproval: true → defineAgent returns awaiting_approval and
    // never runs the body until the user approves.
    expect(res.status).toBe('awaiting_approval');
  });

  it('builds a proposal when invoked directly (post-approval path)', async () => {
    // Simulate the post-approval invocation by calling run() directly with a
    // minimal context — mirrors how the production Inngest function does it.
    const calls: Array<{ step: string; ok: boolean }> = [];
    const result = await autoSaverAgent.run(
      {
        paycheckTxnId: 'txn_42',
        amountCents: 500_000,
        depositedAt: '2026-05-15',
      },
      {
        actionId: 'act_42',
        userId: 'u1',
        agentId: 'ag1',
        agentType: 'auto_saver',
        log: async (step, ok) => {
          calls.push({ step, ok });
        },
      },
    );
    expect(result.roi).toBeNull();
    const data = result.data as { proposal: { buckets: unknown[]; autonomousTransfer: false } };
    expect(data.proposal.buckets.length).toBe(4);
    expect(data.proposal.autonomousTransfer).toBe(false);
    expect(calls.some((c) => c.step === 'proposal:built')).toBe(true);
  });

  it('uses a stable idempotency key per paycheck', () => {
    const k1 = autoSaverAgent.idempotencyKey!({
      paycheckTxnId: 'txn_1',
      amountCents: 100,
      depositedAt: '2026-01-01',
    });
    const k2 = autoSaverAgent.idempotencyKey!({
      paycheckTxnId: 'txn_1',
      amountCents: 999, // amount differs — key must still be stable
      depositedAt: '2026-01-02',
    });
    expect(k1).toBe(k2);
    expect(k1).toBe('allocation:txn_1');
  });
});
