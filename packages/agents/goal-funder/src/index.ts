export { goalFunderAgent, type GoalFunderInput, type GoalFunderData } from './agent';
export {
  computeFunding,
  allocatePaycheckToGoals,
  MAX_ACTIVE_GOALS,
  type GoalInput,
  type FundingPlan,
  type FundingStatus,
  type GoalContribution,
} from './funding-calc';

import { runAgent } from '@fa/inngest';
import { goalFunderAgent, type GoalFunderInput } from './agent';

/** Convenience runner for cron / dev. Production wires through Inngest. */
export async function runGoalFunder(opts: {
  userId: string;
  agentId: string;
  input: GoalFunderInput;
}) {
  return runAgent(goalFunderAgent, {
    userId: opts.userId,
    agentId: opts.agentId,
    input: opts.input,
  });
}
