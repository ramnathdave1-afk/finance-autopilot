export {
  createInsuranceShopperAgent,
  type InsuranceShopperInput,
  type InsuranceShopperData,
  type InsuranceShopperDeps,
} from './agent';
export {
  rankQuotes,
  annualPremiumOf,
  type RankedQuote,
  type RankingResult,
} from './ranking';
export {
  httpQuotePort,
  httpQuotePortFromEnv,
  type QuotePort,
  type QuoteRequest,
  type CarrierQuote,
  type HttpQuotePortConfig,
} from './quote-port';
export { mockQuotePort, type MockQuotePortOptions } from './mock-quote-port';
export {
  getPolicy,
  writeQuotes,
  type InsuranceQuoteInsert,
} from './insurance-store';

import { runAgent } from '@fa/inngest';
import { createInsuranceShopperAgent, type InsuranceShopperInput } from './agent';
import { httpQuotePortFromEnv } from './quote-port';
import type { QuotePort } from './quote-port';

/**
 * Convenience runner for cron / dev. Production wires through Inngest with the
 * live env-driven QuotePort by default; callers may inject an alternate port.
 * The agent definition is built once and reused (defineAgent registers a single
 * (type, actionType) tuple).
 */
let _agent: ReturnType<typeof createInsuranceShopperAgent> | null = null;

export function getInsuranceShopperAgent(port?: QuotePort) {
  if (!_agent) {
    _agent = createInsuranceShopperAgent({ quotePort: port ?? httpQuotePortFromEnv() });
  }
  return _agent;
}

export async function runInsuranceShopper(opts: {
  userId: string;
  agentId: string;
  input: InsuranceShopperInput;
  /** Inject a port (e.g. mock) for dev; defaults to the live env-driven port. */
  quotePort?: QuotePort;
}) {
  return runAgent(getInsuranceShopperAgent(opts.quotePort), {
    userId: opts.userId,
    agentId: opts.agentId,
    input: opts.input,
  });
}
