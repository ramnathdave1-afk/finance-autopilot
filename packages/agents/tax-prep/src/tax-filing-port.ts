// TaxFilingPort — the single seam between the Tax Prep agent and external
// filing software (TurboTax / H&R Block). PRD §8.4 keeps Tier-3 recommend-only:
// this port does NOT file a return. It performs the HANDOFF — pushing the
// computed tax summary to the provider so the user can finish filing there.
//
// HONESTY CONTRACT (mirrors @fa/agent-missing-money's UnclaimedPropertyPort and
// the @fa/browserbase adapter pattern):
//   - The agent logic ONLY talks to this interface.
//   - The real implementation (`createHttpTaxFilingPort`) reads credentials from
//     env and hits the provider. Missing env keys -> it THROWS loudly. A non-OK
//     response -> it THROWS. It never fabricates a "filed" / "handed off"
//     result, and never collapses an error into a fake success.
//   - Tests install a deterministic mock via `setTaxFilingPortFactory`. Tests
//     never touch the network.

import type { TaxSummary } from './classify';

/** Which filing provider to hand off to. */
export type TaxFilingProvider = 'turbotax' | 'hrblock';

/** Payload pushed to the provider: the running summary + identifying context. */
export interface TaxHandoffRequest {
  provider: TaxFilingProvider;
  taxYear: number;
  /** The summary the user reviewed and approved. */
  summary: TaxSummary;
}

/** What the provider hands back: a deep link the user opens to finish filing. */
export interface TaxHandoffResult {
  provider: TaxFilingProvider;
  /** Provider-side reference for the prepared/imported return. */
  referenceId: string;
  /** URL the user opens to review + file in the provider's UI. */
  continueUrl: string;
}

export interface TaxFilingPort {
  /**
   * Hand the summary off to the filing provider. Does NOT file — it prepares /
   * imports the data and returns a link for the user to finish. Throws on
   * provider error (never returns a fabricated success).
   */
  handoff(req: TaxHandoffRequest): Promise<TaxHandoffResult>;
}

export type TaxFilingPortFactory = () => TaxFilingPort | Promise<TaxFilingPort>;

// --- Real implementation -----------------------------------------------------

export interface HttpTaxFilingConfig {
  baseUrl: string;
  apiKey: string;
  timeoutMs?: number;
  /** Injectable fetch — defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

/**
 * Build the live HTTP-backed port from explicit config. Throws on a non-OK
 * response — it never pretends a handoff succeeded.
 */
export function createHttpTaxFilingPort(config: HttpTaxFilingConfig): TaxFilingPort {
  const doFetch = config.fetchImpl ?? globalThis.fetch;
  if (typeof doFetch !== 'function') {
    throw new Error('[tax-prep] no fetch implementation available for live filing port');
  }
  return {
    async handoff(req: TaxHandoffRequest): Promise<TaxHandoffResult> {
      const url = `${config.baseUrl.replace(/\/$/, '')}/v1/handoff`;
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
          body: JSON.stringify(req),
          signal: controller.signal,
        });
        if (!res.ok) {
          throw new Error(
            `[tax-prep] filing provider returned ${res.status} ${res.statusText}`,
          );
        }
        const json = (await res.json()) as Partial<TaxHandoffResult>;
        if (!json.referenceId || !json.continueUrl) {
          throw new Error('[tax-prep] filing provider response missing referenceId/continueUrl');
        }
        return {
          provider: req.provider,
          referenceId: json.referenceId,
          continueUrl: json.continueUrl,
        };
      } finally {
        if (timer) clearTimeout(timer);
      }
    },
  };
}

/**
 * Read config from env and build the live port. Throws loudly when keys are
 * absent so a missing credential can never be mistaken for a successful handoff.
 *
 * Env:
 *   TAX_FILING_BASE_URL    — provider base URL
 *   TAX_FILING_API_KEY     — provider API key
 *   TAX_FILING_TIMEOUT_MS  (optional)
 */
export function createHttpTaxFilingPortFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): TaxFilingPort {
  const baseUrl = env.TAX_FILING_BASE_URL;
  const apiKey = env.TAX_FILING_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new Error(
      '[tax-prep] live filing port not configured — set TAX_FILING_BASE_URL and TAX_FILING_API_KEY (TODO(integrate-tax-filing): provision TurboTax/H&R Block credentials)',
    );
  }
  const timeoutRaw = env.TAX_FILING_TIMEOUT_MS;
  return createHttpTaxFilingPort({
    baseUrl,
    apiKey,
    ...(timeoutRaw ? { timeoutMs: Number(timeoutRaw) } : {}),
  });
}

// --- Factory seam (mirrors setUnclaimedPropertyPortFactory) ------------------

const defaultFactory: TaxFilingPortFactory = () => createHttpTaxFilingPortFromEnv();

let _factory: TaxFilingPortFactory = defaultFactory;

/** Install a port factory. Tests pass a mock; production leaves the default. */
export function setTaxFilingPortFactory(factory: TaxFilingPortFactory): void {
  _factory = factory;
}

/** Reset to the live (env-driven) factory. */
export function resetTaxFilingPortFactory(): void {
  _factory = defaultFactory;
}

/** Resolve the current port (callers use this — never `new` a port). */
export async function getTaxFilingPort(): Promise<TaxFilingPort> {
  return _factory();
}

// --- Mock --------------------------------------------------------------------

/**
 * Deterministic in-memory port for tests + local dev. Echoes a synthetic
 * reference + URL. Never touches the network.
 */
export function createMockTaxFilingPort(
  over: Partial<TaxHandoffResult> = {},
): TaxFilingPort {
  return {
    async handoff(req: TaxHandoffRequest): Promise<TaxHandoffResult> {
      return {
        provider: req.provider,
        referenceId: over.referenceId ?? `mock-${req.provider}-${req.taxYear}`,
        continueUrl:
          over.continueUrl ?? `https://example.test/${req.provider}/continue/${req.taxYear}`,
      };
    },
  };
}
