export { dailyBriefAgent, composeBrief, type DailyBriefInput, type DailyBriefData } from './agent';
export {
  aggregateDailyBrief,
  nextDueAt,
  type DailyBriefAggregate,
  type UpcomingBill,
  type CompletedAction,
} from './aggregator';

import { dailyBriefAgent } from './agent';
import { runAgent } from '@fa/inngest';
import type { DailyBriefInput } from './agent';

/**
 * Convenience runner for cron / dev. Production wires through Inngest in
 * apps/web/api/inngest. The idempotency key on the agent keeps this safe to
 * re-fire for the same user on the same day.
 */
export async function runDailyBrief(opts: {
  userId: string;
  agentId: string;
  input?: DailyBriefInput;
}) {
  return runAgent(dailyBriefAgent, {
    userId: opts.userId,
    agentId: opts.agentId,
    input: opts.input ?? {},
  });
}
