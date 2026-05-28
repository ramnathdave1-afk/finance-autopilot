// End-to-end integration test for the agent lifecycle.
// Wires the REAL @fa/inngest runAgent through a fake @fa/db, and runs the
// REAL @fa/stripe refund logic against a fake DbPort + fake StripeAdapter.
//
// Exercises:
//   1. Happy path — pending → running → succeeded with ROI
//   2. Failure path — 4 attempts → escalated → onFailure toggles refund_eligible
//   3. Refund-on-failure — @fa/stripe issueFailureRefund consumes refund_eligible
//   4. Refund idempotency — second call returns already_processed
//   5. defineAgent idempotency — same key returns same actionId
//   6. requiresApproval gate — body never runs until approved

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { UserLite, AgentActionLite, DbPort } from '../../packages/integrations/stripe/src/db-port';
import type {
  StripeAdapter,
  StripeCheckoutSession,
  StripePortalSession,
  StripeRefund,
  StripeCancellation,
  StripeWebhookEvent,
} from '../../packages/integrations/stripe/src/adapter';

// ─── Shared fake DB state ───────────────────────────────────────────────────
const dbState = {
  actions: new Map<string, AgentActionLite & { audit_log: unknown[]; agent_id: string; idempotency_key: string | null; roi_amount: number | null }>(),
  users: new Map<string, UserLite>(),
  refundsIssued: new Map<string, { refundId: string; amount: number }>(),
  eventsProcessed: new Set<string>(),
};
let actionCounter = 0;

vi.mock('@fa/db', () => ({
  startAction: vi.fn(async (input: { userId: string; agentId: string; agentType: string; actionType: string; requiresApproval?: boolean; idempotencyKey?: string }) => {
    if (input.idempotencyKey) {
      for (const a of dbState.actions.values()) {
        if (a.agent_id === input.agentId && a.idempotency_key === input.idempotencyKey) return a;
      }
    }
    const id = `act-${++actionCounter}`;
    const row = {
      id,
      user_id: input.userId,
      agent_id: input.agentId,
      status: input.requiresApproval ? 'awaiting_approval' : 'pending',
      idempotency_key: input.idempotencyKey ?? null,
      audit_log: [] as unknown[],
      refund_eligible: false,
      roi_amount: null,
      stripe_charge_id: 'ch_test',
    };
    dbState.actions.set(id, row);
    return row;
  }),
  logStep: vi.fn(async (id: string, step: { step: string; ok: boolean; detail?: unknown }) => {
    const row = dbState.actions.get(id);
    if (row) row.audit_log.push({ ts: new Date().toISOString(), ...step });
  }),
  markRunning: vi.fn(async (id: string) => {
    const r = dbState.actions.get(id);
    if (r) r.status = 'running';
  }),
  markSucceeded: vi.fn(async (id: string, roi: number | null) => {
    const r = dbState.actions.get(id);
    if (r) {
      r.status = 'succeeded';
      r.roi_amount = roi;
    }
  }),
  markFailed: vi.fn(async (id: string) => {
    const r = dbState.actions.get(id);
    if (r) r.status = 'failed';
  }),
  markEscalated: vi.fn(async (id: string) => {
    const r = dbState.actions.get(id);
    if (r) r.status = 'escalated';
  }),
}));

// ─── Imports AFTER vi.mock ─────────────────────────────────────────────────
import { defineAgent, runAgent, _clearRegistry } from '../../packages/integrations/inngest/src/define-agent';
import { setAdapter, _resetAdapter } from '../../packages/integrations/stripe/src/adapter';
import { setDbPort, _resetDbPort } from '../../packages/integrations/stripe/src/db-port';
import { issueFailureRefund } from '../../packages/integrations/stripe/src/refund';

// ─── Fake StripeAdapter ────────────────────────────────────────────────────
const refundCalls: Array<{ chargeId: string; amountCents: number; idempotencyKey: string }> = [];

const fakeStripe: StripeAdapter = {
  async createCheckoutSession(): Promise<StripeCheckoutSession> {
    return { id: 'cs_test', url: 'https://stripe.example/checkout', customerId: null };
  },
  async createPortalSession(): Promise<StripePortalSession> {
    return { id: 'bps_test', url: 'https://stripe.example/portal' };
  },
  async cancelSubscriptionAtPeriodEnd(): Promise<StripeCancellation> {
    return { subscriptionId: 'sub_test', cancelAt: Math.floor(Date.now() / 1000) + 86400, status: 'canceled' };
  },
  async refund(input): Promise<StripeRefund> {
    refundCalls.push({ chargeId: input.chargeId, amountCents: input.amountCents, idempotencyKey: input.idempotencyKey });
    return { id: `re_${refundCalls.length}`, amountCents: input.amountCents, status: 'succeeded' };
  },
  constructWebhookEvent(): StripeWebhookEvent {
    throw new Error('not used in this test');
  },
};

// ─── Fake DbPort for @fa/stripe ────────────────────────────────────────────
const fakeDbPort: DbPort = {
  async getUserById(userId) {
    return dbState.users.get(userId) ?? null;
  },
  async getUserByCustomerId(customerId) {
    for (const u of dbState.users.values()) if (u.stripe_customer_id === customerId) return u;
    return null;
  },
  async updateUserSubscription() {},
  async countFounderLifetimeLocked() {
    return 0;
  },
  async countAnnualSubscribers() {
    return 0;
  },
  async countAgentActionsSince() {
    return 0;
  },
  async getAgentAction(actionId) {
    const a = dbState.actions.get(actionId);
    return a ? { id: a.id, user_id: a.user_id, status: a.status, stripe_charge_id: a.stripe_charge_id ?? null, refund_eligible: a.refund_eligible ?? null } : null;
  },
  async hasProcessedEvent(eventId) {
    return dbState.eventsProcessed.has(eventId);
  },
  async markEventProcessed(eventId) {
    dbState.eventsProcessed.add(eventId);
  },
  async hasProcessedRefund(actionId) {
    return dbState.refundsIssued.has(actionId);
  },
  async markRefundProcessed(actionId, refundId, amountCents) {
    dbState.refundsIssued.set(actionId, { refundId, amount: amountCents });
  },
};

beforeEach(() => {
  dbState.actions.clear();
  dbState.users.clear();
  dbState.refundsIssued.clear();
  dbState.eventsProcessed.clear();
  actionCounter = 0;
  refundCalls.length = 0;
  vi.clearAllMocks();
  _resetAdapter();
  _resetDbPort();
  setAdapter(fakeStripe);
  setDbPort(fakeDbPort);
  _clearRegistry();
});

describe('agent lifecycle E2E (real inngest + real stripe refund logic)', () => {
  it('happy path: subscription_killer succeeds with ROI', async () => {
    const run = vi.fn(async () => ({ roi: 15 * 12, data: { merchant: 'netflix' } }));
    const agent = defineAgent<{ sub: string }>({
      type: 'subscription_killer',
      actionType: 'cancel',
      requiresApproval: false,
      idempotencyKey: ({ sub }) => `cancel:${sub}`,
      run,
    });

    const res = await runAgent(agent, { userId: 'u1', agentId: 'ag-sk', input: { sub: 'sub-netflix' } });

    expect(res.status).toBe('succeeded');
    expect(res.result?.roi).toBe(180);
    const row = dbState.actions.get(res.actionId)!;
    expect(row.status).toBe('succeeded');
    expect(row.roi_amount).toBe(180);
    const steps = (row.audit_log as Array<{ step: string }>).map((s) => s.step);
    expect(steps).toContain('run:start');
    expect(steps).toContain('run:succeeded');
  });

  it('failure path → escalated → onFailure sets refund_eligible → stripe refund issued', async () => {
    const failingRun = vi.fn(async () => {
      throw new Error('cancel page blocked');
    });
    const onFailure = vi.fn(async (_input: unknown, ctx: { actionId: string }) => {
      const row = dbState.actions.get(ctx.actionId)!;
      row.refund_eligible = true;
    });

    const agent = defineAgent<{ sub: string }>({
      type: 'subscription_killer',
      actionType: 'cancel',
      requiresApproval: false,
      idempotencyKey: ({ sub }) => `cancel:${sub}`,
      run: failingRun,
      onFailure,
    });

    const res = await runAgent(
      agent,
      { userId: 'u1', agentId: 'ag-sk', input: { sub: 'sub-pf' } },
      { sleep: () => Promise.resolve() },
    );

    expect(res.status).toBe('escalated');
    expect(failingRun).toHaveBeenCalledTimes(4);
    expect(onFailure).toHaveBeenCalledTimes(1);
    const row = dbState.actions.get(res.actionId)!;
    expect(row.status).toBe('escalated');
    expect(row.refund_eligible).toBe(true);

    // Seed paying user so refund path qualifies
    dbState.users.set('u1', {
      id: 'u1',
      email: 'u1@example.com',
      pricing_tier: 'autopilot',
      founder_pricing_locked: false,
      subscription_status: 'active',
      stripe_customer_id: 'cus_test',
      stripe_subscription_id: 'sub_test',
    });

    // @fa/stripe.issueFailureRefund matches status='failed' (not 'escalated').
    // In production, a separate cron/worker flips escalated→failed once the
    // human review queue confirms there's no recovery path. Simulate that here.
    dbState.actions.get(res.actionId)!.status = 'failed';

    const refundRes = await issueFailureRefund(res.actionId);
    expect(refundRes.reason).toBe('issued');
    expect(refundCalls.length).toBe(1);
    expect(refundCalls[0]!.chargeId).toBe('ch_test');
    expect(dbState.refundsIssued.has(res.actionId)).toBe(true);
  });

  it('refund is idempotent — second call returns already_processed without re-charging Stripe', async () => {
    dbState.actions.set('act-99', {
      id: 'act-99',
      user_id: 'u1',
      agent_id: 'ag-x',
      status: 'failed',
      refund_eligible: true,
      stripe_charge_id: 'ch_test',
      idempotency_key: null,
      audit_log: [],
      roi_amount: null,
    });
    dbState.users.set('u1', {
      id: 'u1',
      email: 'u1@example.com',
      pricing_tier: 'autopilot',
      founder_pricing_locked: false,
      subscription_status: 'active',
      stripe_customer_id: 'cus_test',
      stripe_subscription_id: 'sub_test',
    });

    const first = await issueFailureRefund('act-99');
    const second = await issueFailureRefund('act-99');

    expect(first.reason).toBe('issued');
    expect(second.reason).toBe('already_processed');
    expect(refundCalls.length).toBe(1);
  });

  it('idempotencyKey collapses duplicate runs to one row', async () => {
    const agent = defineAgent<{ tag: string }>({
      type: 'round_up_investor',
      actionType: 'sweep_proposal',
      requiresApproval: false,
      idempotencyKey: ({ tag }) => `sweep:${tag}`,
      run: async () => ({ roi: 0 }),
    });

    const r1 = await runAgent(agent, { userId: 'u1', agentId: 'ag-ru', input: { tag: 'wk-22' } });
    const r2 = await runAgent(agent, { userId: 'u1', agentId: 'ag-ru', input: { tag: 'wk-22' } });

    expect(r1.actionId).toBe(r2.actionId);
    expect(dbState.actions.size).toBe(1);
  });

  it('requiresApproval=true never executes the body', async () => {
    const run = vi.fn(async () => ({ roi: 100 }));
    const agent = defineAgent<Record<string, unknown>>({
      type: 'auto_saver',
      actionType: 'allocation_proposal',
      requiresApproval: true,
      run,
    });

    const res = await runAgent(agent, { userId: 'u1', agentId: 'ag-as', input: {} });
    expect(res.status).toBe('awaiting_approval');
    expect(run).not.toHaveBeenCalled();
    expect(dbState.actions.get(res.actionId)!.status).toBe('awaiting_approval');
  });
});
