import { describe, expect, it } from 'vitest';
import { rankQuotes, annualPremiumOf } from '../src/ranking';
import type { CarrierQuote } from '../src/quote-port';

const q = (carrier: string, monthlyPremium: number, annualPremium?: number): CarrierQuote => ({
  carrier,
  monthlyPremium,
  ...(annualPremium !== undefined ? { annualPremium } : {}),
});

describe('rankQuotes — ranks by price', () => {
  it('orders cheapest monthly premium first and assigns 1-based rank', () => {
    const { ranked, best } = rankQuotes(
      [q('Allstate', 120), q('Geico', 90), q('Progressive', 105)],
      130,
    );
    expect(ranked.map((r) => r.carrier)).toEqual(['Geico', 'Progressive', 'Allstate']);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3]);
    expect(best?.carrier).toBe('Geico');
  });

  it('breaks ties on carrier name for stable ordering', () => {
    const { ranked } = rankQuotes([q('Zurich', 100), q('Acme', 100)], 110);
    expect(ranked.map((r) => r.carrier)).toEqual(['Acme', 'Zurich']);
  });
});

describe('rankQuotes — savings vs current', () => {
  it('computes monthly delta and annual savings vs current premium', () => {
    const { best, hasBetterDeal, bestAnnualSavings } = rankQuotes([q('Geico', 90)], 130);
    expect(best?.monthlyDeltaVsCurrent).toBe(-40);
    expect(best?.annualSavingsVsCurrent).toBe(480); // 40 * 12
    expect(best?.beatsCurrent).toBe(true);
    expect(hasBetterDeal).toBe(true);
    expect(bestAnnualSavings).toBe(480);
  });

  it('reports positive delta (no savings) for pricier quotes', () => {
    const { ranked } = rankQuotes([q('Allstate', 150)], 130);
    expect(ranked[0]!.monthlyDeltaVsCurrent).toBe(20);
    expect(ranked[0]!.annualSavingsVsCurrent).toBe(-240);
    expect(ranked[0]!.beatsCurrent).toBe(false);
  });
});

describe('rankQuotes — no better quote', () => {
  it('flags hasBetterDeal=false and zero savings when all quotes are >= current', () => {
    const { best, hasBetterDeal, bestAnnualSavings } = rankQuotes(
      [q('Allstate', 130), q('Progressive', 140), q('Geico', 135)],
      130,
    );
    expect(best?.carrier).toBe('Allstate'); // cheapest, but only equal to current
    expect(best?.beatsCurrent).toBe(false);
    expect(hasBetterDeal).toBe(false);
    expect(bestAnnualSavings).toBe(0);
  });

  it('returns null best and no better deal when there are no quotes', () => {
    const { best, hasBetterDeal, bestAnnualSavings, ranked } = rankQuotes([], 130);
    expect(ranked).toEqual([]);
    expect(best).toBeNull();
    expect(hasBetterDeal).toBe(false);
    expect(bestAnnualSavings).toBe(0);
  });

  it('throws on negative current premium', () => {
    expect(() => rankQuotes([], -1)).toThrow(/non-negative/);
  });
});

describe('annualPremiumOf', () => {
  it('prefers stated annual premium', () => {
    expect(annualPremiumOf(q('X', 100, 1100))).toBe(1100);
  });
  it('derives from monthly when annual absent', () => {
    expect(annualPremiumOf(q('X', 100))).toBe(1200);
  });
});
