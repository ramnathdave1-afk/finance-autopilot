// Founder pricing rules (PRD §7).
//
//   1. First 100 users with founder_pricing_locked=true on autopilot monthly →
//      $9.99/mo locked forever (a special stripePriceId).
//   2. Annual subscribers in the first 500 (count from users table) → 50% off
//      year 1 via Stripe coupon stub.
//   3. Standard pricing otherwise.

import {
  FOUNDER_ANNUAL_YEAR1_COHORT_SIZE,
  FOUNDER_LIFETIME_AMOUNT_CENTS,
  FOUNDER_LIFETIME_COHORT_SIZE,
  FOUNDER_LIFETIME_PRICE_ID,
  FOUNDER_YEAR1_50PCT_COUPON_ID,
  PRICE_TABLE,
  type BillingCycle,
  type PaidTier,
} from './products';
import { getDbPort, type UserLite } from './db-port';

export type FounderReason = 'standard' | 'founder_lifetime' | 'founder_annual_year1';

export interface FounderPriceQuote {
  stripePriceId: string;
  /** Final displayed amount in cents (after any coupon). */
  displayCents: number;
  /** Optional coupon to attach to the checkout session. */
  couponId?: string;
  reason: FounderReason;
}

export interface ComputeFounderPriceArgs {
  user: Pick<UserLite, 'id' | 'founder_pricing_locked'>;
  requestedTier: PaidTier;
  billingCycle: BillingCycle;
}

/**
 * Decide which Stripe price + coupon (if any) applies to this user.
 *
 *  - Autopilot monthly + founder_pricing_locked + cohort still open → lifetime $9.99
 *  - Any tier + annual + cohort still open → standard annual price w/ 50% coupon
 *  - Otherwise → standard sticker price
 */
export async function computeFounderPrice(
  args: ComputeFounderPriceArgs,
): Promise<FounderPriceQuote> {
  const { user, requestedTier, billingCycle } = args;
  const db = getDbPort();

  // Rule 1: founder lifetime $9.99/mo lock — autopilot monthly only.
  if (
    user.founder_pricing_locked &&
    requestedTier === 'autopilot' &&
    billingCycle === 'monthly'
  ) {
    const locked = await db.countFounderLifetimeLocked();
    if (locked <= FOUNDER_LIFETIME_COHORT_SIZE) {
      return {
        stripePriceId: FOUNDER_LIFETIME_PRICE_ID,
        displayCents: FOUNDER_LIFETIME_AMOUNT_CENTS,
        reason: 'founder_lifetime',
      };
    }
  }

  const standard = PRICE_TABLE[requestedTier][billingCycle];
  if (!standard) throw new Error(`No price for ${requestedTier}/${billingCycle}`);

  // Rule 2: annual year-1 50% off — any tier, annual, while cohort open.
  if (billingCycle === 'annual') {
    const annualCount = await db.countAnnualSubscribers();
    if (annualCount < FOUNDER_ANNUAL_YEAR1_COHORT_SIZE) {
      return {
        stripePriceId: standard.stripePriceId,
        displayCents: Math.round(standard.amount / 2),
        couponId: FOUNDER_YEAR1_50PCT_COUPON_ID,
        reason: 'founder_annual_year1',
      };
    }
  }

  // Rule 3: standard sticker price.
  return {
    stripePriceId: standard.stripePriceId,
    displayCents: standard.amount,
    reason: 'standard',
  };
}
