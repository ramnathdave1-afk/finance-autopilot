// Unit tests for the pure catalog builder in create-stripe-prices.mjs.
// Runs via Node's built-in test runner: `node --test scripts/`.
// No Stripe SDK or network is touched — buildCatalogConfig() is side-effect-free.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCatalogConfig } from './create-stripe-prices.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Collect every env var the catalog builder emits (prices + coupon).
function catalogEnvVars() {
  const { prices, coupon } = buildCatalogConfig();
  return [...prices.map((p) => p.envVar), coupon.envVar];
}

// Parse the declared KEY names out of a dotenv-style file.
function declaredEnvKeys(filePath) {
  const keys = new Set();
  for (const raw of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    keys.add(line.slice(0, eq).trim());
  }
  return keys;
}

// Mirrors packages/integrations/stripe/src/products.ts (PRD §7).
const EXPECTED_PRICES = {
  STRIPE_PRICE_AUTOPILOT_MONTHLY: { amount: 1999, interval: 'month' },
  STRIPE_PRICE_AUTOPILOT_ANNUAL: { amount: 16900, interval: 'year' },
  STRIPE_PRICE_PRO_MONTHLY: { amount: 2999, interval: 'month' },
  STRIPE_PRICE_PRO_ANNUAL: { amount: 24900, interval: 'year' },
  STRIPE_PRICE_PREMIUM_MONTHLY: { amount: 4999, interval: 'month' },
  STRIPE_PRICE_PREMIUM_ANNUAL: { amount: 39900, interval: 'year' },
  STRIPE_PRICE_FOUNDER_999_LIFETIME: { amount: 999, interval: 'month' },
};

test('builds exactly the 7 expected prices with correct amounts/intervals', () => {
  const { prices } = buildCatalogConfig();
  assert.equal(prices.length, 7);
  const byEnv = Object.fromEntries(prices.map((p) => [p.envVar, p]));
  for (const [envVar, expected] of Object.entries(EXPECTED_PRICES)) {
    assert.ok(byEnv[envVar], `missing price for ${envVar}`);
    assert.equal(byEnv[envVar].amount, expected.amount, `amount for ${envVar}`);
    assert.equal(byEnv[envVar].interval, expected.interval, `interval for ${envVar}`);
    assert.equal(byEnv[envVar].currency, 'usd');
  }
});

test('every price has a unique, stable lookup_key for idempotency', () => {
  const { prices } = buildCatalogConfig();
  const keys = prices.map((p) => p.lookupKey);
  assert.equal(new Set(keys).size, keys.length, 'lookup_keys must be unique');
  for (const k of keys) assert.match(k, /^fa_/);
});

test('every price references a defined product', () => {
  const { prices, products } = buildCatalogConfig();
  const productKeys = new Set(products.map((p) => p.faKey));
  for (const p of prices) {
    assert.ok(productKeys.has(p.productKey), `price ${p.envVar} → unknown product ${p.productKey}`);
  }
});

test('products carry a stable fa_key for metadata-based idempotency', () => {
  const { products } = buildCatalogConfig();
  const keys = products.map((p) => p.faKey);
  assert.deepEqual(keys, ['autopilot', 'pro', 'premium', 'founder']);
  assert.equal(new Set(keys).size, keys.length);
});

test('founder coupon is 50% off, repeating for 12 months, deterministic id', () => {
  const { coupon } = buildCatalogConfig();
  assert.equal(coupon.envVar, 'STRIPE_COUPON_FOUNDER_YEAR1_50PCT');
  assert.equal(coupon.id, 'FOUNDER_YEAR1_50PCT');
  assert.equal(coupon.percentOff, 50);
  assert.equal(coupon.duration, 'repeating');
  assert.equal(coupon.durationInMonths, 12);
});

test('emits 8 unique env var names (7 prices + 1 coupon)', () => {
  const envVars = catalogEnvVars();
  assert.equal(envVars.length, 8);
  assert.equal(new Set(envVars).size, 8, 'env var names must be unique');
});

test('every catalog env var is declared in .env.example', () => {
  const declared = declaredEnvKeys(join(ROOT, '.env.example'));
  for (const envVar of catalogEnvVars()) {
    assert.ok(
      declared.has(envVar),
      `${envVar} is emitted by the catalog but NOT declared in .env.example`,
    );
  }
});

test('every catalog env var is consumed by @fa/stripe (no orphaned vars)', () => {
  // Guards the blocker: the provisioning script printing env vars that the app
  // never reads. Each env var must appear in packages/integrations/stripe/src.
  const productsSrc = readFileSync(
    join(ROOT, 'packages/integrations/stripe/src/products.ts'),
    'utf8',
  );
  for (const envVar of catalogEnvVars()) {
    assert.ok(
      productsSrc.includes(envVar),
      `${envVar} is provisioned but not consumed in stripe/src/products.ts`,
    );
  }
});
