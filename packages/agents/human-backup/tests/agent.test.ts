import { describe, it, expect, beforeEach, vi } from 'vitest';

// --- Mock @fa/db BEFORE importing the agent. -------------------------------
// We model just the agent_actions surface (status + audit log via the typed
// writers) plus upsertAgent for the human_backup agent row.

interface ActionRow {
  id: string;
  user_id: string;
  agent_id: string;
  agent_type: string;
  action_type: string;
  target: string | null;
  status: string;
  idempotency_key: string | null;
  requested_at: string;
  audit_log: Array<{ ts: string; step: string; ok: boolean; detail?: Record<string, unknown> }>;
  roi_amount: number | null;
  error_message: string | null;
}

const dbState = {
  actionsById: new Map<string, ActionRow>(),
  seq: 0,
};

function seedAction(over: Partial<ActionRow> = {}): ActionRow {
  const id = over.id ?? `src-${++dbState.seq}`;
  const row: ActionRow = {
    id,
    user_id: 'user-1',
    agent_id: 'agent-sub',
    agent_type: 'subscription_killer',
    action_type: 'cancel_subscription',
    target: 'Netflix',
    status: 'failed',
    idempotency_key: null,
    requested_at: '2026-05-28T00:00:00.000Z',
    audit_log: [],
    roi_amount: null,
    error_message: null,
    ...over,
  };
  dbState.actionsById.set(id, row);
  return row;
}

const startActionMock = vi.fn(async (input: {
  userId: string; agentId: string; agentType: string; actionType: string;
  target?: string | null; idempotencyKey?: string; requiresApproval?: boolean;
}) => {
  const existing = [...dbState.actionsById.values()].find(
    (a) => a.agent_id === input.agentId && a.idempotency_key === (input.idempotencyKey ?? null) && input.idempotencyKey,
  );
  if (existing) return existing;
  const id = `q-${++dbState.seq}`;
  const row: ActionRow = {
    id,
    user_id: input.userId,
    agent_id: input.agentId,
    agent_type: input.agentType,
    action_type: input.actionType,
    target: input.target ?? null,
    status: input.requiresApproval ? 'awaiting_approval' : 'pending',
    idempotency_key: input.idempotencyKey ?? null,
    requested_at: new Date().toISOString(),
    audit_log: [{ ts: new Date().toISOString(), step: 'created', ok: true }],
    roi_amount: null,
    error_message: null,
  };
  dbState.actionsById.set(id, row);
  return row;
});

const logStepMock = vi.fn(async (actionId: string, step: { step: string; ok: boolean; detail?: Record<string, unknown> }) => {
  const row = dbState.actionsById.get(actionId);
  if (row) row.audit_log.push({ ts: new Date().toISOString(), ...step });
});

const transition = (actionId: string, status: string, extra?: Record<string, unknown>) => {
  const row = dbState.actionsById.get(actionId);
  if (row) {
    row.status = status;
    if (extra?.roi_amount !== undefined) row.roi_amount = extra.roi_amount as number | null;
    if (extra?.error_message !== undefined) row.error_message = extra.error_message as string | null;
    row.audit_log.push({ ts: new Date().toISOString(), step: `status:${status}`, ok: status !== 'failed', detail: extra ?? {} });
  }
};

const upsertAgentMock = vi.fn(async (userId: string, agentType: string) => `${agentType}-agent-${userId}`);

// Minimal query-chain mock for agent_actions selects. Supports .eq / .in
// filters terminated by an awaited thenable.
function agentActionsChain() {
  const filters: Array<(r: ActionRow) => boolean> = [];
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: (col: string, val: unknown) => {
      filters.push((r) => (r as unknown as Record<string, unknown>)[col] === val);
      return chain;
    },
    in: (col: string, vals: unknown[]) => {
      filters.push((r) => vals.includes((r as unknown as Record<string, unknown>)[col]));
      return chain;
    },
    then: (resolve: (v: { data: ActionRow[]; error: null }) => unknown) => {
      const rows = [...dbState.actionsById.values()].filter((r) => filters.every((f) => f(r)));
      return resolve({ data: rows, error: null });
    },
  };
  return chain;
}

vi.mock('@fa/db', () => ({
  startAction: (...a: unknown[]) => startActionMock(...(a as Parameters<typeof startActionMock>)),
  logStep: (...a: unknown[]) => logStepMock(...(a as Parameters<typeof logStepMock>)),
  markRunning: async (id: string) => transition(id, 'running'),
  markSucceeded: async (id: string, roi: number | null) => transition(id, 'succeeded', { roi_amount: roi }),
  markFailed: async (id: string, msg: string) => transition(id, 'failed', { error_message: msg }),
  markEscalated: async (id: string, reason: string) => transition(id, 'escalated', { error_message: reason }),
  upsertAgent: (...a: unknown[]) => upsertAgentMock(...(a as Parameters<typeof upsertAgentMock>)),
  createServiceClient: () => ({
    from(table: string) {
      if (table !== 'agent_actions') throw new Error(`unexpected table ${table}`);
      return agentActionsChain();
    },
  }),
}));

// notifyUser lives in @fa/inngest — spy on it without breaking runAgent/defineAgent.
const notifyUserMock = vi.fn(async (_userId: string, _msg: unknown) => ({ delivered: 'expo' as const }));
vi.mock('@fa/inngest', async () => {
  const actual = await vi.importActual<typeof import('@fa/inngest')>('@fa/inngest');
  return { ...actual, notifyUser: (...a: unknown[]) => notifyUserMock(...(a as [string, never])) };
});

// --- Now import the agent + harness. ---------------------------------------
import { runAgent } from '@fa/inngest';
import { humanBackupAgent } from '../src/agent';

const NOW = '2026-05-29T12:00:00.000Z';

const run = (over: { nowIso?: string; slaHours?: number } = {}) =>
  runAgent(
    humanBackupAgent,
    { userId: 'user-1', agentId: 'agent-hb-1', input: { userId: 'user-1', nowIso: NOW, ...over } },
    { sleep: () => Promise.resolve() },
  );

describe('humanBackupAgent', () => {
  beforeEach(() => {
    dbState.actionsById.clear();
    dbState.seq = 0;
    startActionMock.mockClear();
    logStepMock.mockClear();
    upsertAgentMock.mockClear();
    notifyUserMock.mockClear();
  });

  it('enqueues a failed action onto the human queue with a 24h SLA + notifies', async () => {
    seedAction({ id: 'src-1', status: 'failed', target: 'Netflix' });

    const result = await run();
    expect(result.status).toBe('succeeded');

    const data = result.result?.data as {
      candidateCount: number; enqueued: Array<{ slaDeadline: string; reason: string; sourceActionId: string }>;
      alreadyQueuedCount: number; breachedCount: number;
    };
    expect(data.candidateCount).toBe(1);
    expect(data.enqueued).toHaveLength(1);
    expect(data.enqueued[0]!.reason).toBe('agent_failed');
    // NOW + 24h
    expect(data.enqueued[0]!.slaDeadline).toBe('2026-05-30T12:00:00.000Z');

    // A human_review queue row was parked in awaiting_approval.
    const queued = [...dbState.actionsById.values()].find((a) => a.action_type === 'human_review');
    expect(queued).toBeDefined();
    expect(queued!.status).toBe('awaiting_approval');
    expect(queued!.agent_type).toBe('human_backup');
    expect(queued!.idempotency_key).toBe('human-backup:src-1');

    // Notified once.
    expect(notifyUserMock).toHaveBeenCalledTimes(1);
  });

  it('escalated and reconnect_bank actions route with the right reason', async () => {
    seedAction({ id: 'esc-1', status: 'escalated', agent_type: 'bill_negotiation', action_type: 'negotiate_bill' });

    const result = await run();
    const data = result.result?.data as { enqueued: Array<{ reason: string }> };
    expect(data.enqueued).toHaveLength(1);
    expect(data.enqueued[0]!.reason).toBe('agent_escalated');
  });

  it('dedupes: an already-queued failure is not re-enqueued', async () => {
    seedAction({ id: 'src-1', status: 'failed' });
    // Pre-existing human_backup queue entry covering src-1.
    seedAction({
      id: 'q-existing',
      agent_type: 'human_backup',
      action_type: 'human_review',
      status: 'awaiting_approval',
      idempotency_key: 'human-backup:src-1',
    });

    const result = await run();
    const data = result.result?.data as { enqueued: unknown[]; alreadyQueuedCount: number };
    expect(data.enqueued).toHaveLength(0);
    expect(data.alreadyQueuedCount).toBe(1);
    // upsertAgent never called when nothing new to enqueue.
    expect(upsertAgentMock).not.toHaveBeenCalled();
    expect(notifyUserMock).not.toHaveBeenCalled();
  });

  it('detects an SLA breach on an open queue entry older than 24h', async () => {
    // Open queue entry created 25h before NOW → breached.
    seedAction({
      id: 'q-old',
      agent_type: 'human_backup',
      action_type: 'human_review',
      status: 'awaiting_approval',
      idempotency_key: 'human-backup:src-old',
      requested_at: '2026-05-28T11:00:00.000Z', // NOW - 25h
    });

    const result = await run();
    const data = result.result?.data as { breachedCount: number };
    expect(data.breachedCount).toBe(1);

    // The breached entry was escalated.
    expect(dbState.actionsById.get('q-old')!.status).toBe('escalated');
  });

  it('does not flag an open queue entry still within SLA', async () => {
    seedAction({
      id: 'q-fresh',
      agent_type: 'human_backup',
      action_type: 'human_review',
      status: 'awaiting_approval',
      idempotency_key: 'human-backup:src-fresh',
      requested_at: '2026-05-29T06:00:00.000Z', // NOW - 6h
    });

    const result = await run();
    const data = result.result?.data as { breachedCount: number };
    expect(data.breachedCount).toBe(0);
    expect(dbState.actionsById.get('q-fresh')!.status).toBe('awaiting_approval');
  });

  it('no failures + empty queue: clean no-op success', async () => {
    const result = await run();
    expect(result.status).toBe('succeeded');
    const data = result.result?.data as { candidateCount: number; enqueued: unknown[]; breachedCount: number };
    expect(data.candidateCount).toBe(0);
    expect(data.enqueued).toHaveLength(0);
    expect(data.breachedCount).toBe(0);
  });
});
