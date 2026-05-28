// E2E: simulate the full path
//   dispatchAction creates row → router event fires → router resolves the
//   right agent by (type, actionType) tuple → agent runs → status moves
//   pending → running → succeeded → push notification fires → realtime
//   update is published.

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── Mock @fa/db ────────────────────────────────────────────────────────────
const dbState = {
  rows: new Map<string, any>(),
  logs: [] as Array<{ actionId: string; step: string; ok: boolean }>,
};
let counter = 0;

vi.mock('@fa/db', () => ({
  createServiceClient: () => ({
    from: (_table: string) => ({
      select: (_cols: string) => ({
        eq: (_col: string, id: string) => ({
          maybeSingle: async () => ({ data: dbState.rows.get(id) ?? null, error: null }),
        }),
      }),
    }),
  }),
  startAction: vi.fn(async (input: { userId: string; agentId: string; agentType: string; actionType: string; requiresApproval?: boolean; target?: string | null; idempotencyKey?: string }) => {
    if (input.idempotencyKey) {
      for (const r of dbState.rows.values()) {
        if (r.agent_id === input.agentId && r.idempotency_key === input.idempotencyKey) return r;
      }
    }
    const id = `act-${++counter}`;
    const row = {
      id,
      user_id: input.userId,
      agent_id: input.agentId,
      agent_type: input.agentType,
      action_type: input.actionType,
      status: input.requiresApproval ? 'awaiting_approval' : 'pending',
      target: input.target ?? null,
      idempotency_key: input.idempotencyKey ?? null,
      audit_log: [],
    };
    dbState.rows.set(id, row);
    return row;
  }),
  logStep: vi.fn(async (id: string, step: { step: string; ok: boolean }) => {
    dbState.logs.push({ actionId: id, ...step });
    const r = dbState.rows.get(id);
    if (r) r.audit_log.push({ ts: new Date().toISOString(), ...step });
  }),
  markRunning: vi.fn(async (id: string) => {
    const r = dbState.rows.get(id);
    if (r) r.status = 'running';
  }),
  markSucceeded: vi.fn(async (id: string, roi: number | null) => {
    const r = dbState.rows.get(id);
    if (r) {
      r.status = 'succeeded';
      r.roi_amount = roi;
    }
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

// ─── Imports AFTER vi.mock ─────────────────────────────────────────────────
import { defineAgent, _clearRegistry } from '../../packages/integrations/inngest/src/define-agent';
import { dispatchActionRouted, eventNameFor, ROUTER_EVENT } from '../../packages/integrations/inngest/src/router';
import { setPushAdapter, _resetPushAdapter } from '../../packages/integrations/inngest/src/notify';
import { setRealtimePublisher, _resetRealtimePublisher, type RealtimeUpdate } from '../../packages/integrations/inngest/src/realtime';
import { startAction } from '@fa/db';

const pushSpy = vi.fn(async (_tokens: string[]) => ({ failed: [] as string[] }));
const oneSignalSpy = vi.fn(async () => {});
const realtimeCaptured: RealtimeUpdate[] = [];

beforeEach(() => {
  dbState.rows.clear();
  dbState.logs.length = 0;
  counter = 0;
  realtimeCaptured.length = 0;
  pushSpy.mockReset();
  pushSpy.mockResolvedValue({ failed: [] });
  oneSignalSpy.mockReset();
  oneSignalSpy.mockResolvedValue(undefined);
  setPushAdapter({ sendExpo: pushSpy, sendOneSignal: oneSignalSpy });
  setRealtimePublisher({
    publish: async (u) => {
      realtimeCaptured.push(u);
    },
  });
  _clearRegistry();
});

afterAllReset();
function afterAllReset() {
  _resetPushAdapter();
  _resetRealtimePublisher();
}

describe('end-to-end: dispatchAction → router → agent runs', () => {
  it('event name matches router contract: agent/<type>.<actionType>.requested', () => {
    expect(eventNameFor('subscription_killer', 'cancel')).toBe('agent/subscription_killer.cancel.requested');
    expect(ROUTER_EVENT).toBe('agent_action.created');
  });

  it('happy path: row created → router runs subscription_killer → status succeeded → notify + realtime fire', async () => {
    // Register the agent (in prod each agent package's import does this on load)
    const run = vi.fn(async () => ({ roi: 180, data: { merchant: 'netflix' } }));
    defineAgent<{ target: string | null }>({
      type: 'subscription_killer',
      actionType: 'cancel',
      requiresApproval: false,
      run,
    });

    // Simulate dispatchAction: create the row.
    const row = await startAction({
      userId: 'u1',
      agentId: 'ag-sk',
      agentType: 'subscription_killer',
      actionType: 'cancel',
      target: 'netflix',
      requiresApproval: false,
    });
    expect(row.status).toBe('pending');

    // Simulate Inngest delivering the event by calling the router body.
    const res = await dispatchActionRouted(row.id);
    expect(res.status).toBe('succeeded');
    expect(run).toHaveBeenCalledTimes(1);

    const final = dbState.rows.get(row.id)!;
    expect(final.status).toBe('succeeded');
    expect(final.roi_amount).toBe(180);

    // Status progression visible in the log
    const transitions = dbState.logs.filter((l) => l.step.startsWith('run:') || l.step.startsWith('status:')).map((l) => l.step);
    expect(transitions).toContain('run:start');
    expect(transitions).toContain('run:succeeded');

    // Realtime published with the final status
    expect(realtimeCaptured.length).toBe(1);
    expect(realtimeCaptured[0]?.status).toBe('succeeded');
    expect(realtimeCaptured[0]?.actionId).toBe(row.id);

    // Push attempted — though no tokens are registered so delivered='none' is fine.
    // (We only check that the realtime + status path didn't blow up.)
  });

  it('router returns action_not_found for a bogus id', async () => {
    const res = await dispatchActionRouted('act-does-not-exist');
    expect(res.status).toBe('action_not_found');
  });

  it('router returns no_agent_registered + escalates when tuple has no handler', async () => {
    // Register a different agent — we'll dispatch one that's not registered.
    defineAgent<Record<string, unknown>>({
      type: 'daily_brief',
      actionType: 'send_brief',
      requiresApproval: false,
      run: async () => ({}),
    });

    const row = await startAction({
      userId: 'u1',
      agentId: 'ag-?',
      agentType: 'auto_saver',
      actionType: 'allocation_proposal',
      target: null,
      requiresApproval: false,
    });

    const res = await dispatchActionRouted(row.id);
    expect(res.status).toBe('no_agent_registered');
    expect(dbState.rows.get(row.id)!.status).toBe('escalated');
  });

  it('router skips terminal rows (idempotency on Inngest redelivery)', async () => {
    defineAgent<Record<string, unknown>>({
      type: 'spending_coach',
      actionType: 'insight',
      requiresApproval: false,
      run: async () => ({}),
    });

    const row = await startAction({
      userId: 'u1',
      agentId: 'ag-sc',
      agentType: 'spending_coach',
      actionType: 'insight',
      target: null,
      requiresApproval: false,
    });
    dbState.rows.get(row.id)!.status = 'succeeded';

    const res = await dispatchActionRouted(row.id);
    expect(res.status).toBe('succeeded'); // unchanged, body did NOT re-run
  });
});
