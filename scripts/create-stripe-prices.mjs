#!/usr/bin/env node
// Provision the Stripe product/price/coupon catalog the app expects (PRD §7).
// Usage:
//   node scripts/create-stripe-prices.mjs           # dry-run (prints plan only)
//   node scripts/create-stripe-prices.mjs --commit   # create/reuse in Stripe
//
// IDEMPOTENT: prices are matched by `lookup_key`, products by a stable
// `metadata.fa_key`, and the coupon by its deterministic id — existing objects
// are reused (never duplicated). On success it prints ready-to-paste KEY=value
// lines mapping to the .env.example var names.
//
// Reads STRIPE_SECRET_KEY from the environment. It is NEVER printed or logged.
// All amounts are in CENTS to mirror @fa/stripe's PRICE_TABLE (PRD §7).

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// --- pure catalog spec (unit-tested; no side effects, no SDK import) --------
// Each price carries the .env.example var name it maps to, a stable lookup_key
// used for idempotency, and the product it belongs to. Amounts are in cents.
//
// Keep these in lockstep with packages/integrations/stripe/src/products.ts.
export function buildCatalogConfig() {
  const currency = 'usd';

  /** @type {Array<{faKey: string, name: string, description: string}>} */
  const products = [
    { faKey: 'autopilot', name: 'Finance Autopilot — Autopilot', description: 'Autopilot tier (PRD §7).' },
    { faKey: 'pro', name: 'Finance Autopilot — Pro', description: 'Pro tier (PRD §7).' },
    { faKey: 'premium', name: 'Finance Autopilot — Premium', description: 'Premium tier (PRD §7).' },
    { faKey: 'founder', name: 'Finance Autopilot — Founder', description: 'Founder lifetime special (PRD §7).' },
  ];

  /**
   * @type {Array<{
   *   envVar: string, productKey: string, lookupKey: string,
   *   nickname: string, amount: number, currency: string,
   *   interval: 'month' | 'year'
   * }>}
   */
  const prices = [
    {
      envVar: 'STRIPE_PRICE_AUTOPILOT_MONTHLY',
      productKey: 'autopilot',
      lookupKey: 'fa_autopilot_monthly',
      nickname: 'Autopilot Monthly',
      amount: 1999,
      currency,
      interval: 'month',
    },
    {
      envVar: 'STRIPE_PRICE_AUTOPILOT_ANNUAL',
      productKey: 'autopilot',
      lookupKey: 'fa_autopilot_annual',
      nickname: 'Autopilot Annual',
      amount: 16900,
      currency,
      interval: 'year',
    },
    {
      envVar: 'STRIPE_PRICE_PRO_MONTHLY',
      productKey: 'pro',
      lookupKey: 'fa_pro_monthly',
      nickname: 'Pro Monthly',
      amount: 2999,
      currency,
      interval: 'month',
    },
    {
      envVar: 'STRIPE_PRICE_PRO_ANNUAL',
      productKey: 'pro',
      lookupKey: 'fa_pro_annual',
      nickname: 'Pro Annual',
      amount: 24900,
      currency,
      interval: 'year',
    },
    {
      envVar: 'STRIPE_PRICE_PREMIUM_MONTHLY',
      productKey: 'premium',
      lookupKey: 'fa_premium_monthly',
      nickname: 'Premium Monthly',
      amount: 4999,
      currency,
      interval: 'month',
    },
    {
      envVar: 'STRIPE_PRICE_PREMIUM_ANNUAL',
      productKey: 'premium',
      lookupKey: 'fa_premium_annual',
      nickname: 'Premium Annual',
      amount: 39900,
      currency,
      interval: 'year',
    },
    {
      envVar: 'STRIPE_PRICE_FOUNDER_999_LIFETIME',
      productKey: 'founder',
      lookupKey: 'fa_founder_999_lifetime',
      nickname: 'Founder $9.99/mo Lifetime',
      amount: 999,
      currency,
      interval: 'month',
    },
  ];

  /**
   * Deterministic coupon id keeps the run idempotent (Stripe lets us choose
   * the id, so we can look it up before creating).
   * @type {{ envVar: string, id: string, name: string, percentOff: number, duration: 'once' | 'repeating' | 'forever', durationInMonths?: number }}
   */
  const coupon = {
    envVar: 'STRIPE_COUPON_FOUNDER_YEAR1_50PCT',
    id: 'FOUNDER_YEAR1_50PCT',
    name: 'Founder Year 1 — 50% off',
    percentOff: 50,
    duration: 'repeating',
    durationInMonths: 12,
  };

  return { products, prices, coupon };
}

// --- stripe helpers (only reached on --commit) ------------------------------

async function ensureProduct(stripe, product) {
  // Idempotency: find by our stable metadata key, else create.
  const existing = await stripe.products.search({
    query: `metadata['fa_key']:'${product.faKey}'`,
  });
  if (existing.data.length > 0) {
    return { id: existing.data[0].id, reused: true };
  }
  const created = await stripe.products.create({
    name: product.name,
    description: product.description,
    metadata: { fa_key: product.faKey },
  });
  return { id: created.id, reused: false };
}

async function ensurePrice(stripe, price, productId) {
  // Idempotency: lookup_key is unique-ish per account; reuse if present.
  const existing = await stripe.prices.list({
    lookup_keys: [price.lookupKey],
    limit: 1,
  });
  if (existing.data.length > 0) {
    return { id: existing.data[0].id, reused: true };
  }
  const created = await stripe.prices.create({
    product: productId,
    nickname: price.nickname,
    currency: price.currency,
    unit_amount: price.amount,
    recurring: { interval: price.interval },
    lookup_key: price.lookupKey,
    metadata: { fa_lookup_key: price.lookupKey },
  });
  return { id: created.id, reused: false };
}

async function ensureCoupon(stripe, coupon) {
  // Idempotency: we choose the coupon id, so retrieve-before-create.
  try {
    const found = await stripe.coupons.retrieve(coupon.id);
    return { id: found.id, reused: true };
  } catch (err) {
    if (err?.statusCode !== 404 && err?.code !== 'resource_missing') throw err;
  }
  const created = await stripe.coupons.create({
    id: coupon.id,
    name: coupon.name,
    percent_off: coupon.percentOff,
    duration: coupon.duration,
    ...(coupon.duration === 'repeating'
      ? { duration_in_months: coupon.durationInMonths }
      : {}),
    metadata: { fa_key: 'founder_year1_50pct' },
  });
  return { id: created.id, reused: false };
}

// --- main -------------------------------------------------------------------

function dollars(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

async function main() {
  const commit = process.argv.includes('--commit');
  const { products, prices, coupon } = buildCatalogConfig();

  console.log(
    `create-stripe-prices — ${commit ? 'COMMIT (will create/reuse in Stripe)' : 'DRY-RUN (no changes)'}\n`,
  );

  // Show the planned catalog regardless of mode.
  console.log('── Planned catalog ──');
  for (const p of prices) {
    const interval = p.interval === 'month' ? '/mo' : '/yr';
    console.log(`  • ${p.nickname.padEnd(28)} ${dollars(p.amount)}${interval}  → ${p.envVar}`);
  }
  console.log(
    `  • ${coupon.name.padEnd(28)} ${coupon.percentOff}% off, ${coupon.duration}${coupon.durationInMonths ? ` (${coupon.durationInMonths}mo)` : ''}  → ${coupon.envVar}\n`,
  );

  if (!commit) {
    console.log('Dry-run only. Re-run with --commit to provision in Stripe.');
    console.log('Requires STRIPE_SECRET_KEY in the environment (never printed).');
    return;
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    console.error('✖ STRIPE_SECRET_KEY is not set in the environment.');
    console.error('  Export it (or source your env) before running with --commit.');
    process.exit(1);
  }

  // Lazy import so dry-run + unit tests never need the SDK loaded.
  const { default: Stripe } = await import('stripe');
  const stripe = new Stripe(secretKey);

  // 1. Products (keyed by faKey).
  const productIds = {};
  console.log('── Products ──');
  for (const product of products) {
    const { id, reused } = await ensureProduct(stripe, product);
    productIds[product.faKey] = id;
    console.log(`  ${reused ? '↺ reused' : '✓ created'} ${product.faKey.padEnd(10)} ${id}`);
  }
  console.log('');

  // 2. Prices.
  const envOut = [];
  console.log('── Prices ──');
  for (const price of prices) {
    const productId = productIds[price.productKey];
    const { id, reused } = await ensurePrice(stripe, price, productId);
    envOut.push([price.envVar, id]);
    console.log(`  ${reused ? '↺ reused' : '✓ created'} ${price.lookupKey.padEnd(26)} ${id}`);
  }
  console.log('');

  // 3. Coupon.
  console.log('── Coupon ──');
  {
    const { id, reused } = await ensureCoupon(stripe, coupon);
    envOut.push([coupon.envVar, id]);
    console.log(`  ${reused ? '↺ reused' : '✓ created'} ${coupon.id.padEnd(26)} ${id}`);
  }
  console.log('');

  // Ready-to-paste env lines (mapping to .env.example var names).
  console.log('── Paste into .env.local (maps to .env.example var names) ──');
  for (const [key, value] of envOut) {
    console.log(`${key}=${value}`);
  }

  console.log('\n✓ Stripe catalog provisioned.');
}

// Only run when executed directly (lets tests import buildCatalogConfig).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    // Never echo the secret; surface only the message.
    console.error(`\n✖ ${err?.message ?? err}`);
    process.exit(1);
  });
}

// Silence "ROOT unused in some paths" while keeping the convention available.
export { ROOT };
