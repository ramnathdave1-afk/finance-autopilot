// RatePort — the single typed seam for ingesting public refinance rates.
//
// HONESTY CONTRACT (per build spec + PRD §16): the agent NEVER fabricates a
// rate. A live implementation (`HttpRatePort`) talks to a real rate source
// keyed by env vars; tests inject a `MockRatePort`. The agent logic only ever
// sees the `RatePort` interface, so swapping live↔mock changes nothing in the
// agent. Code is "live-ready, mock-tested" — we never pretend a live call
// happened.
//
// `refreshRates()` is what the daily cron calls: it fetches current rates per
// loan_type from the source and PERSISTS them to `rate_snapshots` (table
// already exists — packages/db/migrations/phase2_T2_tier2_tables.sql). The
// agent then reads the freshest snapshot back out of the DB.

import type { LoanType } from '@fa/db/types';

/** One day's published rate band for a single loan type, from a named source. */
export interface RateQuote {
  loanType: LoanType;
  source: string; // "freddie_mac" | "bankrate" | ...
  aprLow: number; // decimal, e.g. 0.0525
  aprAvg: number;
  aprHigh: number;
  /** ISO date (YYYY-MM-DD) the rate was published. */
  capturedOn: string;
}

export interface RatePort {
  /** Provider name (matches the `source` column we write to rate_snapshots). */
  readonly source: string;
  /** True iff the required env credentials/config are present. */
  isConfigured(): boolean;
  /** Fetch the current published rate band for each requested loan type. */
  fetchRates(loanTypes: readonly LoanType[]): Promise<RateQuote[]>;
}

/**
 * Live implementation. Reads its endpoint + key from env. We do NOT ship a
 * fake response here — if it isn't configured, callers must not use it (the
 * cron guards on isConfigured()). The actual fetch/parse is intentionally the
 * only network-touching code in the package.
 *
 * Env:
 *   REFI_RATE_API_URL  — base URL of the rate source
 *   REFI_RATE_API_KEY  — bearer key for that source
 *   REFI_RATE_SOURCE   — provider label written to rate_snapshots (default "bankrate")
 */
export class HttpRatePort implements RatePort {
  readonly source: string;
  private readonly baseUrl: string | undefined;
  private readonly apiKey: string | undefined;
  private readonly fetchImpl: typeof fetch;

  constructor(opts?: {
    baseUrl?: string | undefined;
    apiKey?: string | undefined;
    source?: string | undefined;
    fetchImpl?: typeof fetch | undefined;
  }) {
    this.baseUrl = opts?.baseUrl ?? process.env.REFI_RATE_API_URL;
    this.apiKey = opts?.apiKey ?? process.env.REFI_RATE_API_KEY;
    this.source = opts?.source ?? process.env.REFI_RATE_SOURCE ?? 'bankrate';
    this.fetchImpl = opts?.fetchImpl ?? fetch;
  }

  isConfigured(): boolean {
    return Boolean(this.baseUrl && this.apiKey);
  }

  async fetchRates(loanTypes: readonly LoanType[]): Promise<RateQuote[]> {
    if (!this.isConfigured()) {
      throw new Error('HttpRatePort not configured: set REFI_RATE_API_URL and REFI_RATE_API_KEY');
    }
    const capturedOn = new Date().toISOString().slice(0, 10);
    const results: RateQuote[] = [];
    for (const loanType of loanTypes) {
      const url = `${this.baseUrl!.replace(/\/$/, '')}/rates?product=${encodeURIComponent(loanType)}`;
      const res = await this.fetchImpl(url, {
        headers: { Authorization: `Bearer ${this.apiKey}`, Accept: 'application/json' },
      });
      if (!res.ok) {
        throw new Error(`rate source ${this.source} returned ${res.status} for ${loanType}`);
      }
      const body = (await res.json()) as { apr_low: number; apr_avg: number; apr_high: number };
      results.push({
        loanType,
        source: this.source,
        aprLow: body.apr_low,
        aprAvg: body.apr_avg,
        aprHigh: body.apr_high,
        capturedOn,
      });
    }
    return results;
  }
}

/**
 * Deterministic in-memory port for unit tests. Seeded by the test; returns
 * exactly what it was given. NEVER used in production code paths.
 */
export class MockRatePort implements RatePort {
  readonly source: string;
  private readonly byType: Map<LoanType, RateQuote>;
  configured = true;

  constructor(quotes: RateQuote[], source = 'mock') {
    this.source = source;
    this.byType = new Map(quotes.map((q) => [q.loanType, q]));
  }

  isConfigured(): boolean {
    return this.configured;
  }

  async fetchRates(loanTypes: readonly LoanType[]): Promise<RateQuote[]> {
    return loanTypes.map((t) => this.byType.get(t)).filter((q): q is RateQuote => Boolean(q));
  }
}
