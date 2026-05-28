export {
  cardOptimizerAgent,
  type CardOptimizerInput,
  type CardOptimizerData,
} from './agent';
export {
  recommendCards,
  multiplierFor,
  type OptimizerResult,
  type CategoryRecommendation,
  type CategoryCardValue,
  type ApplyRecommendation,
  type RecommendOptions,
} from './recommend';
export { fetchCardCatalog, fetchHeldCardIds } from './cards-catalog';

import { runAgent } from '@fa/inngest';
import { cardOptimizerAgent, type CardOptimizerInput } from './agent';

/** Convenience runner for cron / dev. Production wires through Inngest. */
export async function runCardOptimizer(opts: {
  userId: string;
  agentId: string;
  input: CardOptimizerInput;
}) {
  return runAgent(cardOptimizerAgent, {
    userId: opts.userId,
    agentId: opts.agentId,
    input: opts.input,
  });
}
