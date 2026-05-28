// BrokeragePort — the single seam between the Investment Rebalancer and any
// brokerage / market-data provider.
//
// HONESTY CONTRACT (mirrors missing-money's UnclaimedPropertyPort and the
// @fa/browserbase adapter pattern):
//   - The agent logic ONLY talks to this interface.
//   - The real implementation (`createHttpQuotePort`) reads config from env and
//     hits the live quote endpoint. If the env keys are missing it throws
//     LOUDLY — it NEVER fabricates a price.
//   - Tests install a deterministic mock via `setBrokeragePortFactory`. Tests
//     must NEVER reach the network.
//
// CRITICAL — RECOMMENDATION-MODE AGENT (PRD §8.4): this port deliberately has
// NO trade/execute method. The Investment Rebalancer reads holdings, computes
// drift, and RECOMMENDS trades for the user to place themselves. There is no
// code path in this package that places an order or moves money. Adding an
// execution method here would violate the Tier-3 recommend-only contract.

/** A refreshed quote for a single security. Prices are dollars per share. */
export interface Quote {
  ticker: string;
  price: number;
}

export interface BrokeragePort {
  /**
   * Refresh latest prices for the given tickers. Read-only. Returns one Quote
   * per ticker the provider knows; unknown tickers are simply omitted.
   */
  refreshQuotes(tickers: string[]): Promise<Quote[]>;
}

export type BrokeragePortFactory = () => BrokeragePort | Promise<BrokeragePort>;

// --- Real implementation -----------------------------------------------------

export interface HttpQuotePortConfig {
  /** Base URL for the brokerage / market-data provider. */
  baseUrl: string;
  /** API key for the provider. */
  apiKey: string;
  /** Optional per-request timeout (ms). */
  timeoutMs?: number;
  /** Injectable fetch — defaults to global fetch. Lets ops swap a proxy. */
  fetchImpl?: typeof fetch;
}

/**
 * Build the live HTTP-backed quote port from explicit config. Throws on a
 * non-OK response — it never pretends a quote succeeded.
 */
export function createHttpQuotePort(config: HttpQuotePortConfig): BrokeragePort {
  const doFetch = config.fetchImpl ?? globalThis.fetch;
  if (typeof doFetch !== 'function') {
    throw new Error('[investment-rebalancer] no fetch implementation available for live port');
  }
  return {
    async refreshQuotes(tickers: string[]): Promise<Quote[]> {
      if (tickers.length === 0) return [];
      const url = `${config.baseUrl.replace(/\/$/, '')}/v1/quotes`;
      const controller = new AbortController();
      const timer = config.timeoutMs
        ? setTimeout(() => controller.abort(), config.timeoutMs)
        : null;
      try {
        const res = await doFetch(url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify({ tickers }),
          signal: controller.signal,
        });
        if (!res.ok) {
          throw new Error(
            `[investment-rebalancer] brokerage quote source returned ${res.status} ${res.statusText}`,
          );
        }
        const json = (await res.json()) as { quotes?: Quote[] };
        return Array.isArray(json.quotes) ? json.quotes : [];
      } finally {
        if (timer) clearTimeout(timer);
      }
    },
  };
}

/**
 * Read config from env and build the live quote port. Used by production wiring
 * (quarterly cron / Inngest). Throws LOUDLY when keys are absent so a missing
 * credential can never be mistaken for "no price data".
 *
 * Env:
 *   BROKERAGE_QUOTE_BASE_URL   — provider base URL
 *   BROKERAGE_QUOTE_API_KEY    — provider API key
 *   BROKERAGE_QUOTE_TIMEOUT_MS (optional)
 */
export function createHttpQuotePortFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): BrokeragePort {
  const baseUrl = env.BROKERAGE_QUOTE_BASE_URL;
  const apiKey = env.BROKERAGE_QUOTE_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new Error(
      '[investment-rebalancer] live quote port not configured — set BROKERAGE_QUOTE_BASE_URL and BROKERAGE_QUOTE_API_KEY (TODO(integrate-brokerage): provision market-data credentials)',
    );
  }
  const timeoutRaw = env.BROKERAGE_QUOTE_TIMEOUT_MS;
  return createHttpQuotePort({
    baseUrl,
    apiKey,
    ...(timeoutRaw ? { timeoutMs: Number(timeoutRaw) } : {}),
  });
}

// --- Factory seam (mirrors missing-money / @fa/browserbase) ------------------

const defaultFactory: BrokeragePortFactory = () => createHttpQuotePortFromEnv();

let _factory: BrokeragePortFactory = defaultFactory;

/** Install a port factory. Tests pass a mock; production leaves the default. */
export function setBrokeragePortFactory(factory: BrokeragePortFactory): void {
  _factory = factory;
}

/** Reset to the live (env-driven) factory. */
export function resetBrokeragePortFactory(): void {
  _factory = defaultFactory;
}

/** Resolve the current port (the agent calls this — never `new`s a port). */
export async function getBrokeragePort(): Promise<BrokeragePort> {
  return _factory();
}

// --- Mock --------------------------------------------------------------------

/**
 * Deterministic in-memory quote port for tests + local dev. Returns the canned
 * quotes it was seeded with for any requested ticker it knows. Never touches
 * the network.
 */
export function createMockQuotePort(quotes: Quote[] = []): BrokeragePort {
  const byTicker = new Map(quotes.map((q) => [q.ticker, q]));
  return {
    async refreshQuotes(tickers: string[]): Promise<Quote[]> {
      return tickers
        .map((t) => byTicker.get(t))
        .filter((q): q is Quote => q !== undefined)
        .map((q) => ({ ...q }));
    },
  };
}
