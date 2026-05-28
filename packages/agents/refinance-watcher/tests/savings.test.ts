import { describe, it, expect } from 'vitest';
import {
  monthlyPayment,
  totalCost,
  computeRefinanceSavings,
  clearsThreshold,
  DEFAULT_SAVINGS_THRESHOLD_DOLLARS,
} from '../src/savings';

describe('monthlyPayment', () => {
  it('matches the textbook amortization formula', () => {
    // $200k, 6% APR, 360 months → ~$1199.10/mo.
    const pmt = monthlyPayment(200_000, 0.06, 360);
    expect(pmt).toBeCloseTo(1199.1, 1);
  });

  it('handles 0% APR as straight-line principal', () => {
    expect(monthlyPayment(12_000, 0, 12)).toBeCloseTo(1000, 6);
  });

  it('returns 0 for non-positive months or principal', () => {
    expect(monthlyPayment(10_000, 0.05, 0)).toBe(0);
    expect(monthlyPayment(0, 0.05, 60)).toBe(0);
  });
});

describe('totalCost', () => {
  it('is monthly payment times months', () => {
    const pmt = monthlyPayment(20_000, 0.05, 60);
    expect(totalCost(20_000, 0.05, 60)).toBeCloseTo(pmt * 60, 6);
  });
});

describe('computeRefinanceSavings', () => {
  it('reports positive lifetime savings when the new rate is lower', () => {
    const r = computeRefinanceSavings(
      { balance: 250_000, currentApr: 0.07, remainingMonths: 360 },
      { offeredApr: 0.055 },
    );
    expect(r.lifetimeSavings).toBeGreaterThan(0);
    expect(r.refinancedMonthlyPayment).toBeLessThan(r.currentMonthlyPayment);
    expect(r.currentTotalCost - r.refinancedTotalCost).toBeCloseTo(r.lifetimeSavings, 2);
    expect(r.refinancedTermMonths).toBe(360);
  });

  it('reports negative savings (cost) when the new rate is higher', () => {
    const r = computeRefinanceSavings(
      { balance: 100_000, currentApr: 0.04, remainingMonths: 240 },
      { offeredApr: 0.06 },
    );
    expect(r.lifetimeSavings).toBeLessThan(0);
  });

  it('honors an explicit refinance term', () => {
    const r = computeRefinanceSavings(
      { balance: 30_000, currentApr: 0.08, remainingMonths: 36 },
      { offeredApr: 0.05, termMonths: 60 },
    );
    expect(r.refinancedTermMonths).toBe(60);
  });
});

describe('clearsThreshold', () => {
  it('clears when savings >= threshold and offered rate is lower', () => {
    const { clears, savings } = clearsThreshold(
      { balance: 250_000, currentApr: 0.07, remainingMonths: 360 },
      { offeredApr: 0.055 },
    );
    expect(clears).toBe(true);
    expect(savings.lifetimeSavings).toBeGreaterThanOrEqual(DEFAULT_SAVINGS_THRESHOLD_DOLLARS);
  });

  it('does NOT clear when offered rate is equal or higher even if math rounds favorably', () => {
    const { clears } = clearsThreshold(
      { balance: 250_000, currentApr: 0.05, remainingMonths: 360 },
      { offeredApr: 0.05 },
    );
    expect(clears).toBe(false);
  });

  it('does NOT clear when savings fall below the threshold', () => {
    // Tiny balance + tiny rate delta → savings well under $1000.
    const { clears, savings } = clearsThreshold(
      { balance: 4_000, currentApr: 0.061, remainingMonths: 24 },
      { offeredApr: 0.06 },
    );
    expect(savings.lifetimeSavings).toBeLessThan(DEFAULT_SAVINGS_THRESHOLD_DOLLARS);
    expect(clears).toBe(false);
  });

  it('respects a custom threshold', () => {
    const loan = { balance: 20_000, currentApr: 0.09, remainingMonths: 60 };
    const cand = { offeredApr: 0.07 };
    const high = clearsThreshold(loan, cand, 1_000_000);
    const low = clearsThreshold(loan, cand, 1);
    expect(high.clears).toBe(false);
    expect(low.clears).toBe(true);
  });
});
