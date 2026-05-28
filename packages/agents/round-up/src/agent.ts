// Agent 3 — Round-Up Investor (PRD §8.2).
//
// Weekly: sum round-ups for the last week, look up the user's chosen
// strategy, propose a transfer. No actual money movement in Phase 1
// (PRD §5 non-goal #2). T2's transactions surface is read; T1 displays.

import { defineAgent, type AgentDefinition } from '@fa/inngest';
import { roundUpTotal, type RoundUpTxn } from './roundup-calc';
import { getStrategy, type StrategyId, type StrategyDefinition } from './strategies';

export interface RoundUpInput {
  /** Transactions from the past week. */
  transactions: RoundUpTxn[];
  strategyId: StrategyId;
  /** ISO date marking the start of the week (YYYY-MM-DD). Used for idempotency. */
  weekStart: string;
}

export interface RoundUpData {
  totalCents: number;
  strategy: StrategyDefinition;
  suggestedTransfer: {
    amountCents: number;
    broker: StrategyDefinition['broker'];
    /** Marker: never auto-moved in Phase 1. */
    autonomousTransfer: false;
  };
}

// Agent type in @fa/db's enum is `round_up_investor`. The user-facing
// AgentType union in @fa/types calls it `round_up`. We match the DB enum so
// canAct() / TIER_AGENTS / agent_actions writes work.
export const roundUpAgent: AgentDefinition<RoundUpInput> = defineAgent<RoundUpInput>({
  type: 'round_up_investor' as never, // see note above
  actionType: 'sweep_proposal',
  requiresApproval: true,
  idempotencyKey: (i) => `sweep:${i.weekStart}`,
  run: async (input, ctx) => {
    await ctx.log('sweep:start', true, {
      weekStart: input.weekStart,
      txnCount: input.transactions.length,
    });
    const totalCents = roundUpTotal(input.transactions);
    const strategy = getStrategy(input.strategyId);

    const data: RoundUpData = {
      totalCents,
      strategy,
      suggestedTransfer: {
        amountCents: totalCents,
        broker: strategy.broker,
        autonomousTransfer: false,
      },
    };
    await ctx.log('sweep:proposed', true, {
      totalCents,
      strategyId: strategy.id,
    });
    return { roi: null, data: data as unknown as Record<string, unknown> };
  },
});
