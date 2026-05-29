// PRICE_TABLE — single source of truth for sticker prices (PRD §7).
// All amounts are in CENTS to avoid floating-point money errors.
//
// Price/coupon IDs resolve from the environment at module load. The Stripe
// catalog is provisioned by `scripts/create-stripe-prices.mjs`, which prints
// the STRIPE_PRICE_* / STRIPE_COUPON_* lines to paste into .env.local; those
// same vars are read here (and declared in .env.example). In dev (or before
// provisioning) we fall back to the `*_stub` ids so the app still boots — but
// real checkouts require the env vars to be set (see LAUNCH_CHECKLIST §3).

import type { PricingTier } from '@fa/types';

export type BillingCycle = 'monthly' | 'annual';

export interface PriceEntry {
  /** Amount in cents. */
  amount: number;
  stripePriceId: string;
}

export type PaidTier = Exclude<PricingTier, 'free'>;

// Resolve a Stripe id from env, falling back to a dev stub when unset/blank.
function envId(name: string, stub: string): string {
  const v = process.env[name];
  return v && v.trim().length > 0 ? v.trim() : stub;
}

export const PRICE_TABLE: Record<PaidTier, Record<BillingCycle, PriceEntry>> = {
  autopilot: {
    monthly: {
      amount: 1999,
      stripePriceId: envId('STRIPE_PRICE_AUTOPILOT_MONTHLY', 'price_autopilot_monthly_stub'),
    },
    annual: {
      amount: 16900,
      stripePriceId: envId('STRIPE_PRICE_AUTOPILOT_ANNUAL', 'price_autopilot_annual_stub'),
    },
  },
  pro: {
    monthly: {
      amount: 2999,
      stripePriceId: envId('STRIPE_PRICE_PRO_MONTHLY', 'price_pro_monthly_stub'),
    },
    annual: {
      amount: 24900,
      stripePriceId: envId('STRIPE_PRICE_PRO_ANNUAL', 'price_pro_annual_stub'),
    },
  },
  premium: {
    monthly: {
      amount: 4999,
      stripePriceId: envId('STRIPE_PRICE_PREMIUM_MONTHLY', 'price_premium_monthly_stub'),
    },
    annual: {
      amount: 39900,
      stripePriceId: envId('STRIPE_PRICE_PREMIUM_ANNUAL', 'price_premium_annual_stub'),
    },
  },
};

/** Founder-pricing specials (PRD §7 founder pricing). */
export const FOUNDER_LIFETIME_PRICE_ID = envId(
  'STRIPE_PRICE_FOUNDER_999_LIFETIME',
  'price_founder_999_lifetime',
);
export const FOUNDER_LIFETIME_AMOUNT_CENTS = 999;

// Coupon id must match the one created by scripts/create-stripe-prices.mjs
// ('FOUNDER_YEAR1_50PCT'); the env var wins when provisioned.
export const FOUNDER_YEAR1_50PCT_COUPON_ID = envId(
  'STRIPE_COUPON_FOUNDER_YEAR1_50PCT',
  'FOUNDER_YEAR1_50PCT',
);

/** Caps on founder cohorts (PRD §7). */
export const FOUNDER_LIFETIME_COHORT_SIZE = 100;
export const FOUNDER_ANNUAL_YEAR1_COHORT_SIZE = 500;
