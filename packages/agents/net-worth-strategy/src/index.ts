export {
  netWorthStrategyAgent,
  type NetWorthStrategyInput,
  type NetWorthStrategyData,
} from './agent';
export {
  buildProjection,
  normalizeSnapshots,
  projectValue,
  solveTargetDate,
  requiredDailyRate,
  InsufficientHistoryError,
  type SnapshotPoint,
  type GrowthModel,
  type Projection,
  type ProjectValueResult,
  type TargetSolve,
} from './projection';
export {
  generateStrategy,
  safeParseStrategy,
  type StrategyTarget,
  type StrategyContext,
  type StrategyLever,
  type StrategyRecommendation,
} from './strategy';

import { runAgent } from '@fa/inngest';
import { netWorthStrategyAgent, type NetWorthStrategyInput } from './agent';

/** Convenience runner for cron / dev. Production wires through Inngest. */
export async function runNetWorthStrategy(opts: {
  userId: string;
  agentId: string;
  input: NetWorthStrategyInput;
}) {
  return runAgent(netWorthStrategyAgent, {
    userId: opts.userId,
    agentId: opts.agentId,
    input: opts.input,
  });
}
