export { autoSaverAgent, type AutoSaverInput, type AutoSaverData } from './agent';
export {
  computeAllocation,
  DEFAULT_RULES,
  type AllocationBucket,
  type AllocationRule,
} from './allocation';
export {
  detectPaychecks,
  type PaycheckTxn,
  type DetectedPaycheck,
} from './paycheck-detector';

import { runAgent } from '@fa/inngest';
import { autoSaverAgent, type AutoSaverInput } from './agent';

/** Convenience runner for cron / dev. Production wires through Inngest. */
export async function runAutoSaver(opts: {
  userId: string;
  agentId: string;
  input: AutoSaverInput;
}) {
  return runAgent(autoSaverAgent, {
    userId: opts.userId,
    agentId: opts.agentId,
    input: opts.input,
  });
}
