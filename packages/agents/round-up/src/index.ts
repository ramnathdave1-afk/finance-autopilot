export { roundUpAgent, type RoundUpInput, type RoundUpData } from './agent';
export {
  roundUpTotal,
  roundUpBreakdown,
  type RoundUpTxn,
} from './roundup-calc';
export {
  STRATEGY_REGISTRY,
  getStrategy,
  type StrategyId,
  type StrategyDefinition,
} from './strategies';

import { runAgent } from '@fa/inngest';
import { roundUpAgent, type RoundUpInput } from './agent';

/** Convenience runner for the weekly cron. */
export async function runRoundUp(opts: {
  userId: string;
  agentId: string;
  input: RoundUpInput;
}) {
  return runAgent(roundUpAgent, {
    userId: opts.userId,
    agentId: opts.agentId,
    input: opts.input,
  });
}
