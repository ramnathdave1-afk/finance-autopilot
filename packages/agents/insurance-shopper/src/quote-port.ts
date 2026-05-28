// QuotePort — the typed seam between the Insurance Shopper agent (PRD §8.3
// Agent 12) and the outside world. Carrier / aggregator quote APIs sit BEHIND
// this interface so the agent logic never embeds a network call directly.
//
// HONESTY CONTRACT (repo-wide rule):
//   - The real implementation (`httpQuotePort`) reads carrier/aggregator
//     credentials from env and makes genuine HTTP calls. It never fakes a
//     response: if a key is missing or the call fails it THROWS.
//   - The mock implementation (`mockQuotePort`) is used by unit tests only.
//   - The agent calls whichever port it is handed. It does not know or care
//     which one is live. Tests run against the mock; production wires the
//     real one. We never pretend a live call happened.

import type { InsuranceKind } from '@fa/db/types';

/** What we ask the market for: the user's current coverage to match against. */
export interface QuoteRequest {
  kind: InsuranceKind;
  /** Current carrier — so an aggregator can exclude / flag the incumbent. */
  currentCarrier: string;
  /** Current monthly premium in dollars (for context, not used to bias quotes). */
  currentMonthlyPremium: number;
  /**
   * Coverage spec to match (limits, deductibles, vehicle/renters details).
   * Opaque to the port — passed straight to the carrier API.
   */
  coverage: Record<string, unknown>;
  /** ZIP narrows the rating territory for most carriers. */
  zip?: string;
}

/** A single competitor quote as returned by a carrier / aggregator. */
export interface CarrierQuote {
  carrier: string;
  monthlyPremium: number;
  /** Some carriers return annual; we keep it if present, else derive later. */
  annualPremium?: number;
  /**
   * How the quoted coverage compares to the request. Opaque diff blob written
   * straight to insurance_quotes.coverage_match.
   */
  coverageMatch?: Record<string, unknown>;
  /** Deep link the user follows to bind the policy. */
  quoteUrl?: string;
  /** When the carrier says the quote stops being honored (ISO). */
  expiresAt?: string;
}

/** The seam. One method: hand it a request, get competitor quotes back. */
export interface QuotePort {
  fetchQuotes(req: QuoteRequest): Promise<CarrierQuote[]>;
}

// ---------------------------------------------------------------------------
// Real implementation — env-key-driven, live HTTP. Never used in unit tests.
// ---------------------------------------------------------------------------

export interface HttpQuotePortConfig {
  /** Aggregator base URL, e.g. an insurance quote aggregator endpoint. */
  baseUrl: string;
  /** API key read from env (INSURANCE_AGGREGATOR_API_KEY). */
  apiKey: string;
  /** Injected for testability of the transport itself; defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

/**
 * Build the live QuotePort from environment. Throws if the required env keys
 * are absent — we refuse to silently degrade to fake data.
 *
 * Env:
 *   INSURANCE_AGGREGATOR_URL      — aggregator base URL
 *   INSURANCE_AGGREGATOR_API_KEY  — aggregator API key
 */
export function httpQuotePortFromEnv(env: NodeJS.ProcessEnv = process.env): QuotePort {
  const baseUrl = env.INSURANCE_AGGREGATOR_URL;
  const apiKey = env.INSURANCE_AGGREGATOR_API_KEY;
  if (!baseUrl) throw new Error('INSURANCE_AGGREGATOR_URL is not set');
  if (!apiKey) throw new Error('INSURANCE_AGGREGATOR_API_KEY is not set');
  return httpQuotePort({ baseUrl, apiKey });
}

/** Live QuotePort. Makes a genuine HTTP call; throws on any non-OK response. */
export function httpQuotePort(config: HttpQuotePortConfig): QuotePort {
  const doFetch = config.fetchImpl ?? fetch;
  return {
    async fetchQuotes(req: QuoteRequest): Promise<CarrierQuote[]> {
      const res = await doFetch(`${config.baseUrl.replace(/\/$/, '')}/v1/quotes`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          kind: req.kind,
          current_carrier: req.currentCarrier,
          current_monthly_premium: req.currentMonthlyPremium,
          coverage: req.coverage,
          ...(req.zip ? { zip: req.zip } : {}),
        }),
      });
      if (!res.ok) {
        throw new Error(`insurance aggregator quote fetch failed: ${res.status} ${res.statusText}`);
      }
      const json = (await res.json()) as { quotes?: unknown };
      if (!Array.isArray(json.quotes)) {
        throw new Error('insurance aggregator returned no quotes array');
      }
      return json.quotes.map(normalizeQuote);
    },
  };
}

/** Map a raw aggregator payload row into a CarrierQuote. Throws on bad shape. */
function normalizeQuote(raw: unknown): CarrierQuote {
  const r = raw as Record<string, unknown>;
  const carrier = r.carrier;
  const monthly = r.monthly_premium ?? r.monthlyPremium;
  if (typeof carrier !== 'string' || typeof monthly !== 'number') {
    throw new Error('insurance aggregator quote missing carrier/monthly_premium');
  }
  const annual = r.annual_premium ?? r.annualPremium;
  const coverageMatch = r.coverage_match ?? r.coverageMatch;
  const quoteUrl = r.quote_url ?? r.quoteUrl;
  const expiresAt = r.expires_at ?? r.expiresAt;
  return {
    carrier,
    monthlyPremium: monthly,
    ...(typeof annual === 'number' ? { annualPremium: annual } : {}),
    ...(coverageMatch && typeof coverageMatch === 'object'
      ? { coverageMatch: coverageMatch as Record<string, unknown> }
      : {}),
    ...(typeof quoteUrl === 'string' ? { quoteUrl } : {}),
    ...(typeof expiresAt === 'string' ? { expiresAt } : {}),
  };
}
