// Stress test: fire dispatchAction 100x in parallel with the same
// idempotencyKey and assert only ONE agent_action row exists.
//
// We test the contract at the @fa/inngest level (defineAgent + runAgent) since
// idempotency is enforced by @fa/db.startAction's idempotencyKey lookup,
// which runAgent threads through.

import { describe, it, expect, beforeEach, vi } from 'vitest';

const dbState = {
  rows: new Map<string, { id: string; agent_id: string; idempotency_key: string | null; status: string }>(),
  inserts: 0,
};
let counter = 0;

vi.mock('@fa/db', () => ({
  startAction: vi.fn(async (input: { agentId: string; idempotencyKey?: string; requiresApproval?: boolean }) => {
    // Real semantics: lookup by (agent_id, idempotency_key) first, return on hit.
    if (input.idempotencyKey) {
      for (const r of dbState.rows.values()) {
        if (r.agent_id === input.agentId && r.idempotency_key === input.idempotencyKey) return r;
      }
    }
    dbState.inserts++;
    const id = `act-${++counter}`;
    const row = {
      id,
      agent_id: input.agentId,
      idempotency_key: input.idempotencyKey ?? null,
      status: input.requiresApproval ? 'awaiting_approval' : 'pending',
      audit_log: [],
    };
    dbState.rows.set(id, row);
    return row;
  }),
  logStep: vi.fn(async () => {}),
  markRunning: vi.fn(async (id: string) => {
    const r = dbState.rows.get(id);
    if (r) r.status = 'running';
  }),
  markSucceeded: vi.fn(async (id: string) => {
    const r = dbState.rows.get(id);
    if (r) r.status = 'succeeded';
  }),
  markFailed: vi.fn(async (id: string) => {
    const r = dbState.rows.get(id);
    if (r) r.status = 'failed';
  }),
  markEscalated: vi.fn(async (id: string) => {
    const r = dbState.rows.get(id);
    if (r) r.status = 'escalated';
  }),
}));

import { defineAgent, runAgent, _clearRegistry } from '../../packages/integrations/inngest/src/define-agent';

beforeEach(() => {
  dbState.rows.clear();
  dbState.inserts = 0;
  counter = 0;
  _clearRegistry();
});

describe('idempotency stress', () => {
  it('100 parallel dispatches with same idempotencyKey collapse to 1 row', async () => {
    const runMock = vi.fn(async () => ({ roi: 1 }));
    const agent = defineAgent<{ key: string }>({
      type: 'round_up_investor',
      actionType: 'sweep_proposal',
      requiresApproval: false,
      idempotencyKey: ({ key }) => `sweep:${key}`,
      run: runMock,
    });

    const N = 100;
    const results = await Promise.all(
      Array.from({ length: N }, () =>
        runAgent(
          agent,
          { userId: 'u1', agentId: 'ag-ru', input: { key: 'wk-22' } },
          { sleep: () => Promise.resolve() },
        ),
      ),
    );

    const distinctActionIds = new Set(results.map((r) => r.actionId));
    // Note: serial-pipeline guarantee — startAction is mock-serialized so
    // even under "parallel" Promise.all, only the first call inserts.
    expect(distinctActionIds.size).toBe(1);
    expect(dbState.rows.size).toBe(1);
    expect(dbState.inserts).toBe(1);

    // All resolved to a terminal status (succeeded or already-succeeded).
    for (const r of results) {
      expect(['succeeded']).toContain(r.status);
    }
  });

  it('100 dispatches WITHOUT idempotencyKey produce 100 distinct rows (control)', async () => {
    const agent = defineAgent<Record<string, unknown>>({
      type: 'spending_coach',
      actionType: 'insight',
      requiresApproval: false,
      // intentionally no idempotencyKey
      run: async () => ({ roi: 0 }),
    });

    const N = 100;
    const results = await Promise.all(
      Array.from({ length: N }, () =>
        runAgent(
          agent,
          { userId: 'u1', agentId: 'ag-sc', input: {} },
          { sleep: () => Promise.resolve() },
        ),
      ),
    );

    expect(new Set(results.map((r) => r.actionId)).size).toBe(N);
    expect(dbState.inserts).toBe(N);
  });
});
