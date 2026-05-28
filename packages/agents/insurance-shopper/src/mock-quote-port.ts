// Mock QuotePort — UNIT TESTS ONLY. Never wired into production.
//
// Returns a deterministic, plausible spread of competitor quotes (>= 5 carriers
// per insurance kind) derived from the request's current premium. This lets the
// ranking logic be exercised against realistic price spreads without any
// network access. It is NOT a "fake success" inside the agent: the agent treats
// these exactly like live quotes, and the honesty contract is preserved because
// the mock is only ever injected by tests.

import type { CarrierQuote, QuotePort, QuoteRequest } from './quote-port';

/** Per-kind competitor rosters. >= 5 carriers each (PRD §8.3 requirement). */
const AUTO_CARRIERS = ['Geico', 'Progressive', 'State Farm', 'Allstate', 'Liberty Mutual', 'USAA'];
const RENTERS_CARRIERS = ['Lemonade', 'State Farm', 'Allstate', 'Toggle', 'Assurant', 'Geico'];
const HOME_CARRIERS = ['Travelers', 'State Farm', 'Allstate', 'Nationwide', 'Farmers', 'Chubb'];
const LIFE_CARRIERS = ['Haven Life', 'Bestow', 'Ladder', 'Banner Life', 'Ethos', 'Prudential'];
const HEALTH_CARRIERS = ['Oscar', 'Aetna', 'Cigna', 'Kaiser', 'UnitedHealthcare', 'Anthem'];

function rosterFor(kind: QuoteRequest['kind']): string[] {
  switch (kind) {
    case 'auto':
      return AUTO_CARRIERS;
    case 'renters':
      return RENTERS_CARRIERS;
    case 'home':
      return HOME_CARRIERS;
    case 'life':
      return LIFE_CARRIERS;
    case 'health':
      return HEALTH_CARRIERS;
    default:
      return AUTO_CARRIERS;
  }
}

/**
 * Deterministic multipliers applied to the current premium so the spread is
 * reproducible across runs. Index 0 is the cheapest. Multipliers intentionally
 * straddle 1.0 so tests cover both "cheaper than current" and "more expensive".
 */
const MULTIPLIERS = [0.78, 0.86, 0.93, 1.0, 1.07, 1.15];

export interface MockQuotePortOptions {
  /** Override the multiplier spread (e.g. to force a no-better-quote scenario). */
  multipliers?: number[];
  /** Exclude the incumbent carrier from the returned roster (default true). */
  excludeCurrent?: boolean;
}

export function mockQuotePort(opts: MockQuotePortOptions = {}): QuotePort {
  const multipliers = opts.multipliers ?? MULTIPLIERS;
  const excludeCurrent = opts.excludeCurrent ?? true;

  return {
    async fetchQuotes(req: QuoteRequest): Promise<CarrierQuote[]> {
      const roster = rosterFor(req.kind).filter(
        (c) => !(excludeCurrent && c.toLowerCase() === req.currentCarrier.toLowerCase()),
      );
      return roster.map((carrier, i) => {
        const mult = multipliers[i % multipliers.length] ?? 1.0;
        const monthly = Number((req.currentMonthlyPremium * mult).toFixed(2));
        return {
          carrier,
          monthlyPremium: monthly,
          annualPremium: Number((monthly * 12).toFixed(2)),
          coverageMatch: { matchesCurrent: true, basis: req.coverage },
          quoteUrl: `https://quotes.example/${req.kind}/${carrier.toLowerCase().replace(/\s+/g, '-')}`,
          expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
        } satisfies CarrierQuote;
      });
    },
  };
}
