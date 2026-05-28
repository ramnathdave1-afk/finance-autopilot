export {
  spendingCoachAgent,
  generateInsights,
  type SpendingCoachInput,
  type SpendingCoachData,
  type Insight,
  type SuggestedRule,
} from './agent';
export { createRule, type CreateRuleInput, type RuleTrigger, type RuleCondition, type RuleAction } from './create-rule';
export { categoryTotals, monthOverMonthDeltas, type MoMDelta, type CategoryTotals } from './analyzer';

import { spendingCoachAgent } from './agent';
import { runAgent } from '@fa/inngest';
import type { SpendingCoachInput } from './agent';

export async function runSpendingCoach(opts: {
  userId: string;
  agentId: string;
  input?: SpendingCoachInput;
}) {
  return runAgent(spendingCoachAgent, {
    userId: opts.userId,
    agentId: opts.agentId,
    input: opts.input ?? {},
  });
}
