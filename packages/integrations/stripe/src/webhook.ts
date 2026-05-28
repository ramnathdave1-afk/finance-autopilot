// Stripe webhook handler. Verifies signature, dedupes on event.id, dispatches
// to the right tier/status updater.
//
// Handled events (PRD §13):
//   - customer.subscription.created / .updated  → users.pricing_tier + status
//   - customer.subscription.deleted             → tier → 'free', status → 'cancelled'
//   - invoice.payment_succeeded                 → status → 'active'
//   - invoice.payment_failed                    → status → 'past_due'
//
// All updates are idempotent on event.id (see db-port — currently in-memory
// dedupe; TODO(integrate-t2-migration: add stripe_events table)).

import { z } from 'zod';
import type { PricingTier } from '@fa/types';
import { getAdapter, type StripeWebhookEvent } from './adapter';
import { getDbPort } from './db-port';
import { PRICE_TABLE, FOUNDER_LIFETIME_PRICE_ID } from './products';

export interface HandleWebhookResult {
  eventId: string;
  type: string;
  processed: boolean;
  reason?: string;
}

const SubscriptionObject = z.object({
  id: z.string(),
  customer: z.string(),
  status: z.string(),
  items: z
    .object({
      data: z
        .array(
          z.object({
            price: z.object({ id: z.string() }),
          }),
        )
        .min(1),
    })
    .optional(),
  // Some Stripe payloads put price directly on the subscription metadata.
  metadata: z.record(z.string()).optional(),
});

const InvoiceObject = z.object({
  id: z.string(),
  customer: z.string(),
  subscription: z.string().nullable().optional(),
});

export async function handleWebhook(
  rawBody: string,
  signature: string,
  webhookSecret: string,
): Promise<HandleWebhookResult> {
  let event: StripeWebhookEvent;
  try {
    event = getAdapter().constructWebhookEvent(rawBody, signature, webhookSecret);
  } catch (e) {
    throw new Error(
      `webhook signature verification failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  const db = getDbPort();

  // Idempotency on event.id (PRD §10 — agents idempotent; same discipline here).
  if (await db.hasProcessedEvent(event.id)) {
    return { eventId: event.id, type: event.type, processed: false, reason: 'duplicate' };
  }

  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const sub = SubscriptionObject.parse(event.data.object);
      const user = await db.getUserByCustomerId(sub.customer);
      if (!user) {
        await db.markEventProcessed(event.id, event.type);
        return {
          eventId: event.id,
          type: event.type,
          processed: false,
          reason: 'no_user_for_customer',
        };
      }
      const priceId = sub.items?.data[0]?.price.id ?? null;
      const tier = priceId ? tierFromPriceId(priceId) : user.pricing_tier;
      await db.updateUserSubscription(user.id, {
        pricing_tier: tier,
        subscription_status: mapStripeStatus(sub.status),
        stripe_customer_id: sub.customer,
        stripe_subscription_id: sub.id,
      });
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = SubscriptionObject.parse(event.data.object);
      const user = await db.getUserByCustomerId(sub.customer);
      if (user) {
        await db.updateUserSubscription(user.id, {
          pricing_tier: 'free',
          subscription_status: 'cancelled',
          stripe_subscription_id: null,
        });
      }
      break;
    }

    case 'invoice.payment_succeeded': {
      const inv = InvoiceObject.parse(event.data.object);
      const user = await db.getUserByCustomerId(inv.customer);
      if (user) {
        await db.updateUserSubscription(user.id, { subscription_status: 'active' });
      }
      break;
    }

    case 'invoice.payment_failed': {
      const inv = InvoiceObject.parse(event.data.object);
      const user = await db.getUserByCustomerId(inv.customer);
      if (user) {
        await db.updateUserSubscription(user.id, { subscription_status: 'past_due' });
      }
      break;
    }

    default:
      // Unhandled — still mark processed so we don't replay forever.
      break;
  }

  await db.markEventProcessed(event.id, event.type);
  return { eventId: event.id, type: event.type, processed: true };
}

/** Reverse-lookup tier from a Stripe price id. Falls back to 'autopilot'. */
function tierFromPriceId(priceId: string): PricingTier {
  if (priceId === FOUNDER_LIFETIME_PRICE_ID) return 'autopilot';
  for (const tier of Object.keys(PRICE_TABLE) as Array<keyof typeof PRICE_TABLE>) {
    const cycles = PRICE_TABLE[tier];
    if (cycles.monthly.stripePriceId === priceId || cycles.annual.stripePriceId === priceId) {
      return tier;
    }
  }
  return 'autopilot';
}

function mapStripeStatus(stripeStatus: string): string {
  // Stripe statuses: trialing | active | past_due | canceled | unpaid |
  // incomplete | incomplete_expired | paused.
  switch (stripeStatus) {
    case 'trialing':
    case 'active':
    case 'past_due':
      return stripeStatus;
    case 'canceled':
      return 'cancelled';
    case 'incomplete':
    case 'incomplete_expired':
      return 'incomplete';
    case 'unpaid':
      return 'past_due';
    default:
      return stripeStatus;
  }
}
