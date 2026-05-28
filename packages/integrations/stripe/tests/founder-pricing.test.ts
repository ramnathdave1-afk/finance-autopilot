import { afterEach, describe, expect, it } from 'vitest';
import { computeFounderPrice } from '../src/founder-pricing';
import {
  FOUNDER_LIFETIME_AMOUNT_CENTS,
  FOUNDER_LIFETIME_PRICE_ID,
  FOUNDER_YEAR1_50PCT_COUPON_ID,
  PRICE_TABLE,
} from '../src/products';
import { setDbPort, _resetDbPort } from '../src/db-port';
import { makeMockDb, makeUser } from './_helpers';

afterEach(() => _resetDbPort());

describe('computeFounderPrice', () => {
  it('returns founder_lifetime for autopilot monthly w/ locked + cohort open', async () => {
    const { db } = makeMockDb({ founderLockedCount: 42 });
    setDbPort(db);
    const quote = await computeFounderPrice({
      user: makeUser({ founder_pricing_locked: true }),
      requestedTier: 'autopilot',
      billingCycle: 'monthly',
    });
    expect(quote.reason).toBe('founder_lifetime');
    expect(quote.stripePriceId).toBe(FOUNDER_LIFETIME_PRICE_ID);
    expect(quote.displayCents).toBe(FOUNDER_LIFETIME_AMOUNT_CENTS);
    expect(quote.couponId).toBeUndefined();
  });

  it('falls back to standard when lifetime cohort is full', async () => {
    const { db } = makeMockDb({ founderLockedCount: 101 });
    setDbPort(db);
    const quote = await computeFounderPrice({
      user: makeUser({ founder_pricing_locked: true }),
      requestedTier: 'autopilot',
      billingCycle: 'monthly',
    });
    expect(quote.reason).toBe('standard');
    expect(quote.displayCents).toBe(PRICE_TABLE.autopilot.monthly.amount);
  });

  it('returns founder_annual_year1 for annual + cohort open', async () => {
    const { db } = makeMockDb({ annualCount: 250 });
    setDbPort(db);
    const quote = await computeFounderPrice({
      user: makeUser(),
      requestedTier: 'autopilot',
      billingCycle: 'annual',
    });
    expect(quote.reason).toBe('founder_annual_year1');
    expect(quote.couponId).toBe(FOUNDER_YEAR1_50PCT_COUPON_ID);
    expect(quote.displayCents).toBe(Math.round(PRICE_TABLE.autopilot.annual.amount / 2));
    expect(quote.stripePriceId).toBe(PRICE_TABLE.autopilot.annual.stripePriceId);
  });

  it('returns standard pricing when annual cohort is full', async () => {
    const { db } = makeMockDb({ annualCount: 500 });
    setDbPort(db);
    const quote = await computeFounderPrice({
      user: makeUser(),
      requestedTier: 'pro',
      billingCycle: 'annual',
    });
    expect(quote.reason).toBe('standard');
    expect(quote.displayCents).toBe(PRICE_TABLE.pro.annual.amount);
    expect(quote.couponId).toBeUndefined();
  });

  it('returns standard for monthly w/o founder lock', async () => {
    const { db } = makeMockDb();
    setDbPort(db);
    const quote = await computeFounderPrice({
      user: makeUser({ founder_pricing_locked: false }),
      requestedTier: 'pro',
      billingCycle: 'monthly',
    });
    expect(quote.reason).toBe('standard');
    expect(quote.displayCents).toBe(PRICE_TABLE.pro.monthly.amount);
  });
});
