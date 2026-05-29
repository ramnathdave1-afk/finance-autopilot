import { describe, it, expect, beforeEach, vi } from 'vitest';
import path from 'node:path';

// --- Mocks must be declared BEFORE importing the agent. -------------------

const dbState = {
  actionsById: new Map<string, {
    id: string;
    user_id: string;
    agent_id: string;
    agent_type: string;
    action_type: string;
    target: string | null;
    status: string;
    idempotency_key: string | null;
    audit_log: unknown[];
    refund_eligible: boolean;
    roi_amount: number | null;
  }>(),
  subscriptions: new Map<string, { id: string; merchant: string; amount: number; frequency: 'monthly' | 'annual' | 'weekly'; status: 'active' | 'cancelled'; cancellation_method: string | null }>(),
  refundUpdates: [] as string[],
  subscriptionCancelCalls: [] as Array<{ id: string; method: string }>,
  // Track if the refund_eligible column should simulate "missing" — false by default.
  simulateMissingRefundColumn: false,
};

const startActionMock = vi.fn(async (input: {
  userId: string; agentId: string; agentType: string; actionType: string;
  target?: string | null; idempotencyKey?: string; requiresApproval?: boolean;
}) => {
  const existing = [...dbState.actionsById.values()].find(
    (a) => a.agent_id === input.agentId && a.idempotency_key === (input.idempotencyKey ?? null),
  );
  if (existing && input.idempotencyKey) return existing;
  const id = `action-${dbState.actionsById.size + 1}`;
  const row = {
    id,
    user_id: input.userId,
    agent_id: input.agentId,
    agent_type: input.agentType,
    action_type: input.actionType,
    target: input.target ?? null,
    status: input.requiresApproval ? 'awaiting_approval' : 'pending',
    idempotency_key: input.idempotencyKey ?? null,
    audit_log: [],
    refund_eligible: false,
    roi_amount: null,
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
    row.audit_log.push({ ts: new Date().toISOString(), step: `status:${status}`, ok: status !== 'failed', detail: extra ?? {} });
  }
};

vi.mock('@fa/db', () => {
  return {
    startAction: (...args: unknown[]) => startActionMock(...(args as Parameters<typeof startActionMock>)),
    logStep: (...args: unknown[]) => logStepMock(...(args as Parameters<typeof logStepMock>)),
    markRunning: async (id: string) => transition(id, 'running'),
    markSucceeded: async (id: string, roi: number | null) => transition(id, 'succeeded', { roi_amount: roi }),
    markFailed: async (id: string, msg: string) => transition(id, 'failed', { error_message: msg }),
    markEscalated: async (id: string, reason: string) => transition(id, 'escalated', { reason }),
    createServiceClient: () => {
      return {
        from(table: string) {
          if (table === 'subscriptions') {
            let capturedId = '';
            const chain = {
              select: () => chain,
              eq: (_col: string, val: string) => {
                capturedId = val;
                return chain;
              },
              maybeSingle: async () => {
                const sub = dbState.subscriptions.get(capturedId);
                return { data: sub ?? null, error: null };
              },
              update: (patch: { status?: 'cancelled'; cancellation_method?: string | null }) => ({
                eq: async (_c: string, id: string) => {
                  const sub = dbState.subscriptions.get(id);
                  if (sub) {
                    if (patch.status) sub.status = patch.status;
                    sub.cancellation_method = patch.cancellation_method ?? sub.cancellation_method;
                  }
                  dbState.subscriptionCancelCalls.push({ id, method: patch.cancellation_method ?? 'web' });
                  return { error: null };
                },
              }),
            };
            return chain;
          }
          if (table === 'agent_actions') {
            return {
              update(patch: { refund_eligible?: boolean }) {
                return {
                  eq: async (_c: string, id: string) => {
                    if (dbState.simulateMissingRefundColumn) {
                      return { error: { code: '42703', message: 'column "refund_eligible" does not exist' } };
                    }
                    const row = dbState.actionsById.get(id);
                    if (row && patch.refund_eligible !== undefined) {
                      row.refund_eligible = patch.refund_eligible;
                      dbState.refundUpdates.push(id);
                    }
                    return { error: null };
                  },
                };
              },
            };
          }
          throw new Error(`unexpected table ${table}`);
        },
      };
    },
  };
});

// Mock @fa/claude — verdict path. Default high-confidence success.
const claudeCall = vi.fn(async (_opts: unknown) => ({
  text: JSON.stringify({ success: true, confidence: 0.95, reason: 'cancellation banner visible' }),
  inputTokens: 100,
  outputTokens: 20,
  cacheReadTokens: 0,
  cacheCreateTokens: 0,
  model: 'test',
  latencyMs: 1,
}));
vi.mock('@fa/claude', () => ({
  call: (...args: unknown[]) => claudeCall(...(args as [unknown])),
}));

// Mock @fa/inngest — re-export real defineAgent + runAgent, but they use the
// mocked @fa/db internally because vitest resolves @fa/db once.
vi.mock('@fa/inngest', async () => {
  const actual = await vi.importActual<typeof import('@fa/inngest')>('@fa/inngest');
  return actual;
});

// --- Now the agent + harness. --------------------------------------------

import { runAgent } from '@fa/inngest';
import {
  setBrowserAdapterFactory,
  resetBrowserAdapterFactory,
} from '@fa/browserbase';
import { replayFromHar } from '@fa/browserbase';
import { subscriptionKillerAgent } from '../src/agent';
import { registryList } from '../src/registry';

const HAR_PATH = path.join(__dirname, 'fixtures', 'merchants.har.json');

const WEB_MERCHANTS = registryList.filter((m) => m.cancelMethod === 'web');
// The registry has grown well past the seed set (PRD §8.2: top 50 services
// pre-mapped), so this harness pins a fixed sample of 9 web merchants →
// 9 success scenarios + 1 dedicated failure scenario (re-using the last
// sampled merchant w/ a separate subscriptionId) = 10 total, per the T4 spec.
const SCENARIO_WEB_MERCHANTS = WEB_MERCHANTS.slice(0, 9);
const SCENARIOS: Array<{ merchant: typeof WEB_MERCHANTS[number]; outcome: 'success' | 'failure'; subSuffix: string }> = [
  ...SCENARIO_WEB_MERCHANTS.map((m) => ({ merchant: m, outcome: 'success' as const, subSuffix: 'ok' })),
  { merchant: SCENARIO_WEB_MERCHANTS[SCENARIO_WEB_MERCHANTS.length - 1]!, outcome: 'failure' as const, subSuffix: 'fail' },
];

const seedSubscription = (
  subId: string,
  merchant: string,
  opts?: { amount?: number; frequency?: 'monthly' | 'annual' | 'weekly' },
) => {
  dbState.subscriptions.set(subId, {
    id: subId,
    merchant,
    amount: opts?.amount ?? 0,
    frequency: opts?.frequency ?? 'monthly',
    status: 'active',
    cancellation_method: null,
  });
};

const runOne = async (subId: string, merchantKey: string, scenarioName: string) => {
  setBrowserAdapterFactory(async () => replayFromHar(HAR_PATH, scenarioName));
  const startResult = await runAgent(
    subscriptionKillerAgent,
    {
      userId: 'user-1',
      agentId: 'agent-row-1',
      input: {
        subscriptionId: subId,
        merchantKey,
        credentials: { username: 'a@b.com', password: 'pw' },
      },
    },
    { sleep: () => Promise.resolve() },
  );

  if (startResult.status === 'awaiting_approval') {
    // PRD §10 approval gate — flip the row to "pending" + re-run to simulate
    // the user approving in the web app. The second run uses the same
    // idempotency key, so startAction returns the same row (now flipped to
    // pending) and the run loop proceeds.
    const row = dbState.actionsById.get(startResult.actionId);
    if (row) row.status = 'pending';
    return runAgent(
      subscriptionKillerAgent,
      {
        userId: 'user-1',
        agentId: 'agent-row-1',
        input: {
          subscriptionId: subId,
          merchantKey,
          credentials: { username: 'a@b.com', password: 'pw' },
        },
      },
      { sleep: () => Promise.resolve() },
    );
  }
  return startResult;
};

describe('subscriptionKillerAgent — 10 scenarios', () => {
  beforeEach(() => {
    dbState.actionsById.clear();
    dbState.subscriptions.clear();
    dbState.refundUpdates.length = 0;
    dbState.subscriptionCancelCalls.length = 0;
    dbState.simulateMissingRefundColumn = false;
    claudeCall.mockClear();
    resetBrowserAdapterFactory();
  });

  it('exactly 9 successes + 1 failure across 10 scenarios', async () => {
    expect(SCENARIOS.length).toBe(10);

    let successes = 0;
    let escalations = 0;
    let refundFlipped = 0;

    for (let i = 0; i < SCENARIOS.length; i++) {
      const { merchant, outcome, subSuffix } = SCENARIOS[i]!;
      const subId = `sub-${merchant.merchantKey}-${subSuffix}-${i}`;
      seedSubscription(subId, merchant.displayName);

      const scenarioName =
        outcome === 'success' ? 'generic-web-success' : 'web-failure-cancel-blocked';
      const result = await runOne(subId, merchant.merchantKey, scenarioName);

      if (outcome === 'success') {
        expect(result.status).toBe('succeeded');
        expect(result.result?.roi).toBeCloseTo(
          (merchant.monthlyAmountEstimate ?? 0) * 12,
          1,
        );
        successes += 1;
        // subscription row flipped
        expect(dbState.subscriptions.get(subId)?.status).toBe('cancelled');
      } else {
        expect(result.status).toBe('escalated');
        escalations += 1;
        // refund_eligible was toggled in onFailure
        const row = dbState.actionsById.get(result.actionId);
        expect(row?.refund_eligible).toBe(true);
        refundFlipped += 1;
        // subscription was NOT marked cancelled
        expect(dbState.subscriptions.get(subId)?.status).toBe('active');
      }

      // Status transition trail present in audit log either way.
      const row = dbState.actionsById.get(result.actionId);
      const steps = (row?.audit_log ?? []) as Array<{ step: string }>;
      const stepNames = steps.map((s) => s.step);
      expect(stepNames).toContain('status:running');
    }

    expect(successes).toBe(SCENARIOS.length - 1);
    expect(escalations).toBe(1);
    expect(refundFlipped).toBe(1);
  });

  it('voice merchants short-circuit with a TODO(integrate-twilio) audit step and roi:null', async () => {
    const voiceMerchant = registryList.find((m) => m.cancelMethod === 'voice');
    expect(voiceMerchant).toBeDefined();
    if (!voiceMerchant) return;

    const subId = `sub-${voiceMerchant.merchantKey}`;
    seedSubscription(subId, voiceMerchant.displayName);

    // No HAR needed — voice path never opens a session. But factory must be
    // installed in case the code path changes; use generic-web-success.
    setBrowserAdapterFactory(async () => replayFromHar(HAR_PATH, 'generic-web-success'));

    const result = await runOne(subId, voiceMerchant.merchantKey, 'generic-web-success');
    expect(result.status).toBe('succeeded');
    expect(result.result?.roi).toBeNull();

    const row = dbState.actionsById.get(result.actionId);
    const audit = (row?.audit_log ?? []) as Array<{ step: string; detail?: Record<string, unknown> }>;
    const voiceStub = audit.find((s) => s.step === 'voice-cancel:stub');
    expect(voiceStub).toBeDefined();
    expect(String(voiceStub?.detail?.note ?? '')).toMatch(/TODO\(integrate-twilio\)/);
  });

  it('already-cancelled subscription is a no-op (idempotent)', async () => {
    const m = WEB_MERCHANTS[0]!;
    const subId = `sub-${m.merchantKey}`;
    dbState.subscriptions.set(subId, {
      id: subId,
      merchant: m.displayName,
      amount: 0,
      frequency: 'monthly',
      status: 'cancelled',
      cancellation_method: 'web',
    });

    setBrowserAdapterFactory(async () => replayFromHar(HAR_PATH, 'generic-web-success'));
    const result = await runOne(subId, m.merchantKey, 'generic-web-success');
    expect(result.status).toBe('succeeded');
    expect(result.result?.data?.alreadyCancelled).toBe(true);
    // Did not call subscription.update again
    expect(dbState.subscriptionCancelCalls.length).toBe(0);
  });

  it('ROI is computed from the real subscription row amount + frequency, not the registry estimate', async () => {
    const m = WEB_MERCHANTS[0]!;
    const subId = `sub-roi-${m.merchantKey}`;
    // Row amount differs from the registry estimate so we can prove the source.
    seedSubscription(subId, m.displayName, { amount: 9.99, frequency: 'monthly' });

    setBrowserAdapterFactory(async () => replayFromHar(HAR_PATH, 'generic-web-success'));
    const result = await runOne(subId, m.merchantKey, 'generic-web-success');
    expect(result.status).toBe('succeeded');
    // 9.99 * 12 = 119.88 — driven by the row, NOT monthlyAmountEstimate*12.
    expect(result.result?.roi).toBeCloseTo(119.88, 2);
    expect(result.result?.roi).not.toBeCloseTo((m.monthlyAmountEstimate ?? 0) * 12, 2);
  });

  it('annual-frequency row ROI uses the annual multiplier (x1)', async () => {
    const m = WEB_MERCHANTS[0]!;
    const subId = `sub-roi-annual-${m.merchantKey}`;
    seedSubscription(subId, m.displayName, { amount: 120, frequency: 'annual' });
    setBrowserAdapterFactory(async () => replayFromHar(HAR_PATH, 'generic-web-success'));
    const result = await runOne(subId, m.merchantKey, 'generic-web-success');
    expect(result.status).toBe('succeeded');
    expect(result.result?.roi).toBeCloseTo(120, 2);
  });

  it('refuses to cancel when the subscription row merchant does not match the cancel target', async () => {
    const m = WEB_MERCHANTS[0]!;
    const subId = `sub-mismatch-${m.merchantKey}`;
    // Row is for a DIFFERENT merchant than the one we are asked to cancel.
    seedSubscription(subId, 'Some Other Service', { amount: 5, frequency: 'monthly' });
    setBrowserAdapterFactory(async () => replayFromHar(HAR_PATH, 'generic-web-success'));
    const result = await runOne(subId, m.merchantKey, 'generic-web-success');
    // Mismatch throws → agent escalates after retries; row stays active.
    expect(result.status).toBe('escalated');
    expect(dbState.subscriptions.get(subId)?.status).toBe('active');
    expect(dbState.subscriptionCancelCalls.length).toBe(0);
    const row = dbState.actionsById.get(result.actionId);
    const audit = (row?.audit_log ?? []) as Array<{ step: string }>;
    expect(audit.map((s) => s.step)).toContain('merchant-mismatch');
  });

  it('throws (then escalates) when the subscription row does not exist', async () => {
    const m = WEB_MERCHANTS[0]!;
    const subId = `sub-missing-row-${m.merchantKey}`;
    // No seedSubscription → getSubscription returns null.
    setBrowserAdapterFactory(async () => replayFromHar(HAR_PATH, 'generic-web-success'));
    const result = await runOne(subId, m.merchantKey, 'generic-web-success');
    expect(result.status).toBe('escalated');
    expect(dbState.subscriptionCancelCalls.length).toBe(0);
  });

  it('refund_eligible swallows missing-column error with TODO marker', async () => {
    dbState.simulateMissingRefundColumn = true;
    const m = WEB_MERCHANTS[WEB_MERCHANTS.length - 1]!;
    const subId = `sub-missing-${m.merchantKey}`;
    seedSubscription(subId, m.displayName);
    const result = await runOne(subId, m.merchantKey, 'web-failure-cancel-blocked');
    expect(result.status).toBe('escalated');
    const row = dbState.actionsById.get(result.actionId);
    const refundStep = (row?.audit_log ?? []).find(
      (s: any) => s.step === 'refund-eligible:set',
    ) as { ok: boolean; detail?: { reason?: string } } | undefined;
    expect(refundStep?.ok).toBe(false);
    expect(refundStep?.detail?.reason).toMatch(/TODO\(integrate-t2-migration\)/);
  });
});
