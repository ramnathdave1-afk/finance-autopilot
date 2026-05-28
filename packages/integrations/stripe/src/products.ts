// PRICE_TABLE — single source of truth for sticker prices (PRD §7).
// All amounts are in CENTS to avoid floating-point money errors.
//
// The stripePriceId values are placeholders. When integrating real Stripe,
// swap them for the actual price ids created in the Stripe dashboard.
// TODO(integrate-stripe-sdk): replace 'price_*_stub' with real ids.

import type { PricingTier } from '@fa/types';

export type BillingCycle = 'monthly' | 'annual';

export interface PriceEntry {
  /** Amount in cents. */
  amount: number;
  stripePriceId: string;
}

export type PaidTier = Exclude<PricingTier, 'free'>;

export const PRICE_TABLE: Record<PaidTier, Record<BillingCycle, PriceEntry>> = {
  autopilot: {
    monthly: { amount: 1999, stripePriceId: 'price_autopilot_monthly_stub' },
    annual: { amount: 16900, stripePriceId: 'price_autopilot_annual_stub' },
  },
  pro: {
    monthly: { amount: 2999, stripePriceId: 'price_pro_monthly_stub' },
    annual: { amount: 24900, stripePriceId: 'price_pro_annual_stub' },
  },
  premium: {
    monthly: { amount: 4999, stripePriceId: 'price_premium_monthly_stub' },
    annual: { amount: 39900, stripePriceId: 'price_premium_annual_stub' },
  },
};

/** Founder-pricing specials (PRD §7 founder pricing). */
export const FOUNDER_LIFETIME_PRICE_ID = 'price_founder_999_lifetime';
export const FOUNDER_LIFETIME_AMOUNT_CENTS = 999;

export const FOUNDER_YEAR1_50PCT_COUPON_ID = 'coupon_founder_year1_50pct';

/** Caps on founder cohorts (PRD §7). */
export const FOUNDER_LIFETIME_COHORT_SIZE = 100;
export const FOUNDER_ANNUAL_YEAR1_COHORT_SIZE = 500;
