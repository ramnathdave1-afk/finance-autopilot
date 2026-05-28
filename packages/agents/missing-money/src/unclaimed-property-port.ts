// UnclaimedPropertyPort — the single seam between the Missing Money agent and
// the outside world (NAUPA / missingmoney.com / state unclaimed-property DBs).
//
// HONESTY CONTRACT (matches the @fa/browserbase adapter pattern):
//   - The agent logic ONLY talks to this interface.
//   - The real implementation (`createHttpPort`) reads config from env and hits
//     the live sources. If the env keys are missing it throws loudly — it NEVER
//     fabricates a successful lookup.
//   - Tests install a deterministic mock via `setUnclaimedPropertyPortFactory`.
//     Tests must NEVER reach the network.
//
// A "search subject" is the user's identity fanned out across name + known
// aliases, prior addresses, and prior employers — exactly the fields the public
// unclaimed-property indexes match on.

export interface SearchSubject {
  /** Legal name as it would appear on a holder's books. */
  fullName: string;
  /** Maiden names, nicknames, prior legal names. */
  aliases?: string[];
  /** Prior addresses (street + city), used to disambiguate common names. */
  addresses?: Array<{ city?: string; state?: string; postalCode?: string }>;
  /** Prior employers — old 401(k)/payroll holders surface a lot of finds. */
  employers?: string[];
  /** State codes to restrict the search to (e.g. ['AZ','CA']). Empty = all. */
  states?: string[];
}

/** One raw hit from a source, BEFORE we map it onto an unclaimed_finds row. */
export interface UnclaimedHit {
  /** Which source produced this: "naupa" | "missingmoney" | state code | "401k_db". */
  source: string;
  /** Stable identifier from the source, used for dedupe. May be absent on some sources. */
  propertyId: string | null;
  /** US state the property is held in, if known. */
  state: string | null;
  /** Entity holding the funds (former employer, bank, utility, etc.). */
  holder: string | null;
  /** Often a band like "Under $50" / "Under $100" — kept as text per schema. */
  amountEstimate: string | null;
  /** Deep link to the source's claim flow, if available. */
  claimUrl: string | null;
  /** Arbitrary extra fields from the source (matched name, reported date, …). */
  details?: Record<string, unknown>;
}

export interface UnclaimedPropertyPort {
  /** Run the subject against this port's sources and return raw hits. */
  search(subject: SearchSubject): Promise<UnclaimedHit[]>;
}

export type UnclaimedPropertyPortFactory = () => UnclaimedPropertyPort | Promise<UnclaimedPropertyPort>;

// --- Real implementation -----------------------------------------------------

export interface HttpPortConfig {
  /** Base URL for the aggregator (missingmoney.com / NAUPA gateway). */
  baseUrl: string;
  /** API key for the aggregator. */
  apiKey: string;
  /** Optional per-request timeout (ms). */
  timeoutMs?: number;
  /** Injectable fetch — defaults to global fetch. Lets ops swap a proxy. */
  fetchImpl?: typeof fetch;
}

/**
 * Build the live HTTP-backed port from explicit config. Throws on a non-OK
 * response — it never pretends a lookup succeeded.
 */
export function createHttpPort(config: HttpPortConfig): UnclaimedPropertyPort {
  const doFetch = config.fetchImpl ?? globalThis.fetch;
  if (typeof doFetch !== 'function') {
    throw new Error('[missing-money] no fetch implementation available for live port');
  }
  return {
    async search(subject: SearchSubject): Promise<UnclaimedHit[]> {
      const url = `${config.baseUrl.replace(/\/$/, '')}/v1/search`;
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
          body: JSON.stringify(subject),
          signal: controller.signal,
        });
        if (!res.ok) {
          throw new Error(
            `[missing-money] unclaimed-property source returned ${res.status} ${res.statusText}`,
          );
        }
        const json = (await res.json()) as { hits?: UnclaimedHit[] };
        return Array.isArray(json.hits) ? json.hits : [];
      } finally {
        if (timer) clearTimeout(timer);
      }
    },
  };
}

/**
 * Read config from env and build the live port. Used by production wiring
 * (cron / Inngest). Throws loudly when the keys are absent so a missing
 * credential can never be mistaken for "no money found".
 *
 * Env:
 *   UNCLAIMED_PROPERTY_BASE_URL  — aggregator base URL
 *   UNCLAIMED_PROPERTY_API_KEY   — aggregator API key
 *   UNCLAIMED_PROPERTY_TIMEOUT_MS (optional)
 */
export function createHttpPortFromEnv(env: NodeJS.ProcessEnv = process.env): UnclaimedPropertyPort {
  const baseUrl = env.UNCLAIMED_PROPERTY_BASE_URL;
  const apiKey = env.UNCLAIMED_PROPERTY_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new Error(
      '[missing-money] live port not configured — set UNCLAIMED_PROPERTY_BASE_URL and UNCLAIMED_PROPERTY_API_KEY (TODO(integrate-unclaimed-property): provision aggregator credentials)',
    );
  }
  const timeoutRaw = env.UNCLAIMED_PROPERTY_TIMEOUT_MS;
  return createHttpPort({
    baseUrl,
    apiKey,
    ...(timeoutRaw ? { timeoutMs: Number(timeoutRaw) } : {}),
  });
}

// --- Factory seam (mirrors @fa/browserbase setBrowserAdapterFactory) ---------

const defaultFactory: UnclaimedPropertyPortFactory = () => createHttpPortFromEnv();

let _factory: UnclaimedPropertyPortFactory = defaultFactory;

/** Install a port factory. Tests pass a mock; production leaves the default. */
export function setUnclaimedPropertyPortFactory(factory: UnclaimedPropertyPortFactory): void {
  _factory = factory;
}

/** Reset to the live (env-driven) factory. */
export function resetUnclaimedPropertyPortFactory(): void {
  _factory = defaultFactory;
}

/** Resolve the current port (the agent calls this — never `new`s a port). */
export async function getUnclaimedPropertyPort(): Promise<UnclaimedPropertyPort> {
  return _factory();
}

// --- Mock --------------------------------------------------------------------

/**
 * Deterministic in-memory port for tests + local dev. Returns the canned hits
 * it was seeded with, regardless of subject. Never touches the network.
 */
export function createMockPort(hits: UnclaimedHit[] = []): UnclaimedPropertyPort {
  return {
    async search(): Promise<UnclaimedHit[]> {
      return hits.map((h) => ({ ...h }));
    },
  };
}
