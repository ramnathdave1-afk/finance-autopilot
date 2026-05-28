export {
  taxPrepAgent,
  type TaxPrepInput,
  type TaxPrepData,
} from './agent';
export {
  // pure classification surface
  isOutflow,
  isInflow,
  detectDeductibles,
  totalDeductionsByBucket,
  aggregate1099Income,
  isBusinessTagged,
  buildTaxSummary,
  forTaxYear,
  defaultTaxYear,
  DEFAULT_1099_PAYERS,
  REPORTING_THRESHOLD_USD,
  type DeductionBucket,
  type DeductibleFlag,
  type DeductionTotal,
  type PayerMatch,
  type PayerIncome,
  type TaxSummary,
} from './classify';
export {
  type TaxFilingPort,
  type TaxFilingPortFactory,
  type TaxFilingProvider,
  type TaxHandoffRequest,
  type TaxHandoffResult,
  type HttpTaxFilingConfig,
  createHttpTaxFilingPort,
  createHttpTaxFilingPortFromEnv,
  createMockTaxFilingPort,
  getTaxFilingPort,
  setTaxFilingPortFactory,
  resetTaxFilingPortFactory,
} from './tax-filing-port';
export { getTransactionsForYear } from './transactions-store';

import { runAgent } from '@fa/inngest';
import { taxPrepAgent, type TaxPrepInput } from './agent';

/** Convenience runner for cron / dev. Production wires through Inngest. */
export async function runTaxPrep(opts: {
  userId: string;
  agentId: string;
  input: TaxPrepInput;
}) {
  return runAgent(taxPrepAgent, {
    userId: opts.userId,
    agentId: opts.agentId,
    input: opts.input,
  });
}
