export {
  refinanceWatcherAgent,
  type RefinanceWatcherInput,
  type RefinanceWatcherData,
  type RefinanceOpportunity,
} from './agent';
export {
  computeRefinanceSavings,
  clearsThreshold,
  monthlyPayment,
  totalCost,
  DEFAULT_SAVINGS_THRESHOLD_DOLLARS,
  type LoanSnapshotInput,
  type RefinanceCandidate,
  type SavingsResult,
} from './savings';
export {
  HttpRatePort,
  MockRatePort,
  type RatePort,
  type RateQuote,
} from './rate-port';
export {
  refreshRates,
  WATCHED_LOAN_TYPES,
  type RefreshRatesResult,
} from './refresh-rates';
export {
  getUserLoans,
  getLatestSnapshots,
  persistRateQuotes,
} from './loan-store';

import { runAgent } from '@fa/inngest';
import { refinanceWatcherAgent, type RefinanceWatcherInput } from './agent';

/** Convenience runner for the daily cron / dev. Production wires through Inngest. */
export async function runRefinanceWatcher(opts: {
  userId: string;
  agentId: string;
  input: RefinanceWatcherInput;
}) {
  return runAgent(refinanceWatcherAgent, {
    userId: opts.userId,
    agentId: opts.agentId,
    input: opts.input,
  });
}
