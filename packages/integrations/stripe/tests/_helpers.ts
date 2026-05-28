// Shared test helpers — MockAdapter + in-memory DbPort.

import { vi } from 'vitest';
import type {
  StripeAdapter,
  StripeCheckoutSession,
  StripeCheckoutSessionInput,
  StripePortalSession,
  StripeRefund,
  StripeRefundInput,
  StripeCancellation,
  StripeWebhookEvent,
} from '../src/adapter';
import type { DbPort, UserLite, AgentActionLite } from '../src/db-port';

export class MockAdapter implements StripeAdapter {
  createCheckoutSession = vi.fn(
    async (input: StripeCheckoutSessionInput): Promise<StripeCheckoutSession> => ({
      id: 'cs_test_mock',
      url: `https://checkout.stripe.test/${input.priceId}`,
      customerId: input.customerId,
    }),
  );
  createPortalSession = vi.fn(
    async (customerId: string): Promise<StripePortalSession> => ({
      id: 'bps_test_mock',
      url: `https://portal.stripe.test/${customerId}`,
    }),
  );
  cancelSubscriptionAtPeriodEnd = vi.fn(
    async (subscriptionId: string): Promise<StripeCancellation> => ({
      subscriptionId,
      cancelAt: 1_700_000_000,
      status: 'active',
    }),
  );
  refund = vi.fn(
    async (input: StripeRefundInput): Promise<StripeRefund> => ({
      id: `re_${input.idempotencyKey}`,
      amountCents: input.amountCents,
      status: 'succeeded',
    }),
  );
  constructWebhookEvent = vi.fn(
    (rawBody: string, _signature: string, _secret: string): StripeWebhookEvent => {
      return JSON.parse(rawBody) as StripeWebhookEvent;
    },
  );
}

export interface MockDbState {
  users: Map<string, UserLite>;
  actions: Map<string, AgentActionLite>;
  processedEvents: Set<string>;
  processedRefunds: Set<string>;
  founderLockedCount: number;
  annualCount: number;
  actionCounts: Map<string, number>;
}

export function makeMockDb(state?: Partial<MockDbState>): { db: DbPort; state: MockDbState } {
  const s: MockDbState = {
    users: state?.users ?? new Map(),
    actions: state?.actions ?? new Map(),
    processedEvents: state?.processedEvents ?? new Set(),
    processedRefunds: state?.processedRefunds ?? new Set(),
    founderLockedCount: state?.founderLockedCount ?? 0,
    annualCount: state?.annualCount ?? 0,
    actionCounts: state?.actionCounts ?? new Map(),
  };
  const db: DbPort = {
    getUserById: async (id) => s.users.get(id) ?? null,
    getUserByCustomerId: async (cid) => {
      for (const u of s.users.values()) if (u.stripe_customer_id === cid) return u;
      return null;
    },
    updateUserSubscription: async (id, patch) => {
      const u = s.users.get(id);
      if (!u) throw new Error('no user');
      s.users.set(id, { ...u, ...patch } as UserLite);
    },
    countFounderLifetimeLocked: async () => s.founderLockedCount,
    countAnnualSubscribers: async () => s.annualCount,
    countAgentActionsSince: async (userId) => s.actionCounts.get(userId) ?? 0,
    getAgentAction: async (id) => s.actions.get(id) ?? null,
    hasProcessedEvent: async (id) => s.processedEvents.has(id),
    markEventProcessed: async (id) => {
      s.processedEvents.add(id);
    },
    hasProcessedRefund: async (id) => s.processedRefunds.has(id),
    markRefundProcessed: async (id) => {
      s.processedRefunds.add(id);
    },
  };
  return { db, state: s };
}

export function makeUser(over: Partial<UserLite> = {}): UserLite {
  return {
    id: 'u_test',
    email: 'test@example.com',
    pricing_tier: 'free',
    founder_pricing_locked: false,
    subscription_status: 'inactive',
    stripe_customer_id: null,
    stripe_subscription_id: null,
    ...over,
  };
}
