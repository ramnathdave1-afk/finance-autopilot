import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock @fa/db so we don't hit a real Supabase. The test verifies the
// orchestration contract — status transitions, retries, escalation, idempotency.
const dbState = {
  rows: new Map<string, any>(),
  logs: [] as { actionId: string; step: string; ok: boolean }[],
  transitions: [] as { actionId: string; status: string }[],
};

vi.mock('@fa/db', () => ({
  startAction: vi.fn(async (input: any) => {
    const id = input.idempotencyKey
      ? [...dbState.rows.values()].find((r) => r.idempotency_key === input.idempotencyKey)?.id
      : undefined;
    if (id) return dbState.rows.get(id);
    const row = {
      id: `act-${dbState.rows.size + 1}`,
      user_id: input.userId,
      agent_id: input.agentId,
      status: input.requiresApproval ? 'awaiting_approval' : 'pending',
      idempotency_key: input.idempotencyKey ?? null,
      audit_log: [],
    };
    dbState.rows.set(row.id, row);
    return row;
  }),
  logStep: vi.fn(async (actionId: string, step: any) => {
    dbState.logs.push({ actionId, step: step.step, ok: step.ok });
  }),
  markRunning: vi.fn(async (id: string) => dbState.transitions.push({ actionId: id, status: 'running' })),
  markSucceeded: vi.fn(async (id: string) => dbState.transitions.push({ actionId: id, status: 'succeeded' })),
  markFailed: vi.fn(async (id: string) => dbState.transitions.push({ actionId: id, status: 'failed' })),
  markEscalated: vi.fn(async (id: string) => dbState.transitions.push({ actionId: id, status: 'escalated' })),
}));

import { defineAgent, runAgent, _clearRegistry } from '../src/define-agent';

beforeEach(() => {
  dbState.rows.clear();
  dbState.logs.length = 0;
  dbState.transitions.length = 0;
  _clearRegistry();
});

describe('defineAgent + runAgent', () => {
  it('succeeds on first try and writes audit + status', async () => {
    const agent = defineAgent<{ x: number }>({
      type: 'spending_coach',
      actionType: 'insight',
      requiresApproval: false,
      run: async (input, ctx) => {
        await ctx.log('analyzing', true);
        return { roi: input.x * 10 };
      },
    });

    const res = await runAgent(agent, { userId: 'u1', agentId: 'a1', input: { x: 3 } });
    expect(res.status).toBe('succeeded');
    expect(res.result?.roi).toBe(30);
    expect(dbState.transitions.map((t) => t.status)).toEqual(['running', 'succeeded']);
    const steps = dbState.logs.map((l) => l.step);
    expect(steps).toContain('run:start');
    expect(steps).toContain('analyzing');
    expect(steps).toContain('run:succeeded');
  });

  it('retries 3x then escalates on persistent failure', async () => {
    let calls = 0;
    const agent = defineAgent<{}>({
      type: 'subscription_killer',
      actionType: 'cancel',
      requiresApproval: false,
      run: async () => {
        calls++;
        throw new Error('boom');
      },
    });

    const res = await runAgent(agent, { userId: 'u1', agentId: 'a1', input: {} }, { sleep: () => Promise.resolve() });
    expect(res.status).toBe('escalated');
    expect(calls).toBe(4); // initial + 3 retries
    const transitions = dbState.transitions.map((t) => t.status);
    expect(transitions).toContain('running');
    expect(transitions).toContain('failed');
    expect(transitions).toContain('escalated');
  });

  it('calls onFailure exactly once when retries exhaust', async () => {
    const onFailure = vi.fn(async () => {});
    const agent = defineAgent<{}>({
      type: 'subscription_killer',
      actionType: 'cancel',
      requiresApproval: false,
      run: async () => {
        throw new Error('persistent');
      },
      onFailure,
    });

    await runAgent(agent, { userId: 'u1', agentId: 'a1', input: {} }, { sleep: () => Promise.resolve() });
    expect(onFailure).toHaveBeenCalledTimes(1);
    const args = (onFailure.mock.calls[0] as unknown) as unknown[];
    expect(args[2]).toBeInstanceOf(Error);
  });

  it('returns awaiting_approval without running when requiresApproval=true', async () => {
    let ran = false;
    const agent = defineAgent<{}>({
      type: 'auto_saver',
      actionType: 'allocation_proposal',
      requiresApproval: true,
      run: async () => {
        ran = true;
        return {};
      },
    });

    const res = await runAgent(agent, { userId: 'u1', agentId: 'a1', input: {} });
    expect(res.status).toBe('awaiting_approval');
    expect(ran).toBe(false);
  });

  it('idempotency key returns same action_id on re-invoke', async () => {
    const agent = defineAgent<{ tag: string }>({
      type: 'round_up_investor',
      actionType: 'sweep',
      requiresApproval: false,
      idempotencyKey: (i) => `sweep:${i.tag}`,
      run: async () => ({ roi: 0 }),
    });

    const r1 = await runAgent(agent, { userId: 'u1', agentId: 'a1', input: { tag: 'week-22' } });
    const r2 = await runAgent(agent, { userId: 'u1', agentId: 'a1', input: { tag: 'week-22' } });
    expect(r1.actionId).toBe(r2.actionId);
  });

  it('refuses to register the same type+actionType twice', async () => {
    defineAgent({
      type: 'daily_brief',
      actionType: 'brief',
      requiresApproval: false,
      run: async () => ({}),
    });
    expect(() =>
      defineAgent({
        type: 'daily_brief',
        actionType: 'brief',
        requiresApproval: false,
        run: async () => ({}),
      }),
    ).toThrow(/already registered/);
  });
});
