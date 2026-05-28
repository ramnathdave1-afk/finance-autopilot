// Thin port over @fa/db — gives us a single seam to mock in tests instead of
// stubbing the whole Supabase client. Everything Stripe-side reaches DB
// through this module.

import { createServiceClient } from '@fa/db';
import type { PricingTier } from '@fa/types';

export interface UserLite {
  id: string;
  email: string;
  pricing_tier: PricingTier;
  founder_pricing_locked: boolean;
  subscription_status: string;
  stripe_customer_id: string | null;
  stripe_subscription_id?: string | null;
}

export interface AgentActionLite {
  id: string;
  user_id: string;
  status: string;
  /** Stripe charge / payment_intent id captured when the action was billed. */
  stripe_charge_id?: string | null;
  /** Whether refund-on-failure (PRD §16) applies to this action. */
  refund_eligible?: boolean | null;
}

export interface DbPort {
  getUserById(userId: string): Promise<UserLite | null>;
  getUserByCustomerId(customerId: string): Promise<UserLite | null>;
  updateUserSubscription(
    userId: string,
    patch: {
      pricing_tier?: PricingTier;
      subscription_status?: string;
      stripe_customer_id?: string | null;
      stripe_subscription_id?: string | null;
    },
  ): Promise<void>;
  countFounderLifetimeLocked(): Promise<number>;
  countAnnualSubscribers(): Promise<number>;
  /** Count agent_actions for a user since a given UTC date. */
  countAgentActionsSince(userId: string, since: Date): Promise<number>;
  getAgentAction(actionId: string): Promise<AgentActionLite | null>;
  /** Idempotency table for processed webhook event ids. */
  hasProcessedEvent(eventId: string): Promise<boolean>;
  markEventProcessed(eventId: string, type: string): Promise<void>;
  /** Idempotency table for processed refunds (PRD §16). */
  hasProcessedRefund(actionId: string): Promise<boolean>;
  markRefundProcessed(actionId: string, refundId: string, amountCents: number): Promise<void>;
}

/** Default implementation backed by Supabase via @fa/db. */
export const realDb: DbPort = {
  async getUserById(userId) {
    const s = createServiceClient();
    const { data } = await s.from('users').select('*').eq('id', userId).maybeSingle();
    return (data as UserLite | null) ?? null;
  },
  async getUserByCustomerId(customerId) {
    const s = createServiceClient();
    const { data } = await s
      .from('users')
      .select('*')
      .eq('stripe_customer_id', customerId)
      .maybeSingle();
    return (data as UserLite | null) ?? null;
  },
  async updateUserSubscription(userId, patch) {
    const s = createServiceClient();
    const { error } = await s.from('users').update(patch).eq('id', userId);
    if (error) throw new Error(`updateUserSubscription failed: ${error.message}`);
  },
  async countFounderLifetimeLocked() {
    const s = createServiceClient();
    const { count, error } = await s
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('founder_pricing_locked', true);
    if (error) throw new Error(error.message);
    return count ?? 0;
  },
  async countAnnualSubscribers() {
    // billing_cycle was added in phase1b_T5_billing.sql.
    const s = createServiceClient();
    const { count, error } = await s
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('subscription_status', 'active')
      .eq('billing_cycle', 'annual');
    if (error) throw new Error(error.message);
    return count ?? 0;
  },
  async countAgentActionsSince(userId, since) {
    const s = createServiceClient();
    const { count, error } = await s
      .from('agent_actions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('requested_at', since.toISOString());
    if (error) throw new Error(error.message);
    return count ?? 0;
  },
  async getAgentAction(actionId) {
    const s = createServiceClient();
    const { data } = await s
      .from('agent_actions')
      .select('id, user_id, status, stripe_charge_id, refund_eligible')
      .eq('id', actionId)
      .maybeSingle();
    return (data as AgentActionLite | null) ?? null;
  },
  async hasProcessedEvent(eventId) {
    // stripe_events table landed in phase1b_T5_billing.sql.
    const s = createServiceClient();
    const { data, error } = await s
      .from('stripe_events')
      .select('event_id')
      .eq('event_id', eventId)
      .maybeSingle();
    if (error && error.code !== 'PGRST116') {
      // Surface real errors. PGRST116 = no rows found (Supabase quirk on maybeSingle).
      throw new Error(`hasProcessedEvent failed: ${error.message}`);
    }
    return data !== null;
  },
  async markEventProcessed(eventId, type) {
    const s = createServiceClient();
    const { error } = await s
      .from('stripe_events')
      .insert({ event_id: eventId, event_type: type });
    // 23505 = unique_violation. Concurrent retries from Stripe can race here;
    // the second writer is a no-op, not an error.
    if (error && error.code !== '23505') {
      throw new Error(`markEventProcessed failed: ${error.message}`);
    }
  },
  async hasProcessedRefund(actionId) {
    const s = createServiceClient();
    const { data, error } = await s
      .from('stripe_refunds')
      .select('action_id')
      .eq('action_id', actionId)
      .maybeSingle();
    if (error && error.code !== 'PGRST116') {
      throw new Error(`hasProcessedRefund failed: ${error.message}`);
    }
    return data !== null;
  },
  async markRefundProcessed(actionId, refundId, amountCents) {
    const s = createServiceClient();
    const { error } = await s
      .from('stripe_refunds')
      .insert({ action_id: actionId, stripe_refund_id: refundId, amount_cents: amountCents });
    if (error && error.code !== '23505') {
      throw new Error(`markRefundProcessed failed: ${error.message}`);
    }
  },
};

let _db: DbPort = realDb;
export function setDbPort(db: DbPort): void {
  _db = db;
}
export function getDbPort(): DbPort {
  return _db;
}
export function _resetDbPort(): void {
  _db = realDb;
}
