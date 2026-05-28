// Pure ranking logic for the Insurance Shopper. No I/O, no DB, no network —
// just deterministic functions over quotes so it can be unit-tested in
// isolation (PRD §8.3: "rank by best deal").

import type { CarrierQuote } from './quote-port';

export interface RankedQuote extends CarrierQuote {
  /** 1-based position after ranking (1 = best deal). */
  rank: number;
  /** monthlyPremium delta vs current. Negative = cheaper (savings). */
  monthlyDeltaVsCurrent: number;
  /** Annualized savings vs current. Positive = money saved per year. */
  annualSavingsVsCurrent: number;
  /** True when this quote beats the current premium. */
  beatsCurrent: boolean;
}

export interface RankingResult {
  ranked: RankedQuote[];
  /** The single best deal, or null when no quotes were available. */
  best: RankedQuote | null;
  /** True only when `best` strictly undercuts the current premium. */
  hasBetterDeal: boolean;
  /** Annual savings of the best deal vs current (0 when no better deal). */
  bestAnnualSavings: number;
}

/** Annual premium for a quote: prefer the carrier's stated annual, else monthly*12. */
export function annualPremiumOf(q: CarrierQuote): number {
  return q.annualPremium ?? Number((q.monthlyPremium * 12).toFixed(2));
}

/**
 * Rank competitor quotes by best deal (cheapest monthly premium first) and
 * annotate each with savings vs the user's current monthly premium.
 *
 * Pure: same inputs → same output. Ties broken by carrier name for stability.
 */
export function rankQuotes(quotes: CarrierQuote[], currentMonthlyPremium: number): RankingResult {
  if (currentMonthlyPremium < 0) {
    throw new Error('currentMonthlyPremium must be non-negative');
  }

  const sorted = [...quotes].sort((a, b) => {
    if (a.monthlyPremium !== b.monthlyPremium) return a.monthlyPremium - b.monthlyPremium;
    return a.carrier.localeCompare(b.carrier);
  });

  const ranked: RankedQuote[] = sorted.map((q, i) => {
    const monthlyDeltaVsCurrent = Number((q.monthlyPremium - currentMonthlyPremium).toFixed(2));
    const annualSavingsVsCurrent = Number((-monthlyDeltaVsCurrent * 12).toFixed(2));
    return {
      ...q,
      rank: i + 1,
      monthlyDeltaVsCurrent,
      annualSavingsVsCurrent,
      beatsCurrent: q.monthlyPremium < currentMonthlyPremium,
    };
  });

  const best = ranked[0] ?? null;
  const hasBetterDeal = best?.beatsCurrent ?? false;
  const bestAnnualSavings = hasBetterDeal && best ? best.annualSavingsVsCurrent : 0;

  return { ranked, best, hasBetterDeal, bestAnnualSavings };
}
