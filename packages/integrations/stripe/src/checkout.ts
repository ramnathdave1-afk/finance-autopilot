// createCheckoutSession — wraps the Stripe adapter and applies founder pricing.
// All Stripe SDK calls go through the adapter (see adapter.ts).

import { getAdapter } from './adapter';
import { computeFounderPrice } from './founder-pricing';
import type { BillingCycle, PaidTier } from './products';
import { getDbPort, type UserLite } from './db-port';

export interface CreateCheckoutSessionInput {
  userId: string;
  requestedTier: PaidTier;
  billingCycle: BillingCycle;
  successUrl: string;
  cancelUrl: string;
}

export interface CreateCheckoutSessionResult {
  sessionId: string;
  url: string;
  stripePriceId: string;
  displayCents: number;
  reason: 'standard' | 'founder_lifetime' | 'founder_annual_year1';
}

export async function createCheckoutSession(
  input: CreateCheckoutSessionInput,
): Promise<CreateCheckoutSessionResult> {
  const db = getDbPort();
  const user = await db.getUserById(input.userId);
  if (!user) throw new Error(`user not found: ${input.userId}`);

  const quote = await computeFounderPrice({
    user,
    requestedTier: input.requestedTier,
    billingCycle: input.billingCycle,
  });

  const adapter = getAdapter();
  const session = await adapter.createCheckoutSession({
    customerId: user.stripe_customer_id,
    customerEmail: user.stripe_customer_id ? undefined : user.email,
    priceId: quote.stripePriceId,
    couponId: quote.couponId,
    successUrl: input.successUrl,
    cancelUrl: input.cancelUrl,
    metadata: {
      user_id: user.id,
      requested_tier: input.requestedTier,
      billing_cycle: input.billingCycle,
      founder_reason: quote.reason,
    },
  });

  return {
    sessionId: session.id,
    url: session.url,
    stripePriceId: quote.stripePriceId,
    displayCents: quote.displayCents,
    reason: quote.reason,
  };
}

export type { UserLite };
