export {
  investmentRebalancerAgent,
  type InvestmentRebalancerInput,
  type InvestmentRebalancerData,
} from './agent';
export {
  classifyAllocation,
  computeDrift,
  suggestRebalance,
  findHarvestCandidates,
  type Position,
  type TargetAllocation,
  type AssetClassWeight,
  type DriftEntry,
  type DriftReport,
  type RebalanceTrade,
  type HarvestCandidate,
} from './rebalance';
export {
  getLatestHoldings,
  rowToPosition,
} from './holdings-store';
export {
  type BrokeragePort,
  type BrokeragePortFactory,
  type Quote,
  type HttpQuotePortConfig,
  createHttpQuotePort,
  createHttpQuotePortFromEnv,
  createMockQuotePort,
  getBrokeragePort,
  setBrokeragePortFactory,
  resetBrokeragePortFactory,
} from './brokerage-port';

import { runAgent } from '@fa/inngest';
import { investmentRebalancerAgent, type InvestmentRebalancerInput } from './agent';

/** Convenience runner for quarterly cron / dev. Production wires through Inngest. */
export async function runInvestmentRebalancer(opts: {
  userId: string;
  agentId: string;
  input: InvestmentRebalancerInput;
}) {
  return runAgent(investmentRebalancerAgent, {
    userId: opts.userId,
    agentId: opts.agentId,
    input: opts.input,
  });
}
