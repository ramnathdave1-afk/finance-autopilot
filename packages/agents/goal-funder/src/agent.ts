// Agent 5 — Goal Funder (PRD §8.2).
//
// RECOMMEND MODE ONLY at launch (PRD §5 non-goal #2), mirroring Auto-Saver:
// when a paycheck is detected we propose how much of it to route toward each
// active goal so the user stays on pace to hit each goal's target_amount by its
// target_date. We do NOT move money — the proposal lands in agent_actions
// awaiting approval and the user one-taps to execute (T1 UI, later phase).
//
// Integrates with Auto-Saver: the same detected-paycheck signal (the
// DetectedPaycheck shape exported by @fa/agent-auto-saver) feeds this agent.

import { defineAgent, type AgentDefinition } from '@fa/inngest';
import type { DetectedPaycheck } from '@fa/agent-auto-saver';
import {
  allocatePaycheckToGoals,
  computeFunding,
  type FundingPlan,
  type GoalContribution,
  type GoalInput,
} from './funding-calc';

export interface GoalFunderInput {
  /** The detected paycheck this run is reacting to (Auto-Saver's signal). */
  paycheck: Pick<DetectedPaycheck, 'id' | 'amountCents' | 'date'>;
  /** The user's active goals (already filtered to status='active' by the caller). */
  goals: GoalInput[];
  /**
   * Fraction of the paycheck (0–1) the user earmarked for goal funding. The
   * agent never proposes routing more than this slice. Defaults to 10%.
   */
  fundingRate?: number;
}

export interface GoalFunderData {
  proposal: {
    paycheckTxnId: string;
    paycheckAmountCents: number;
    /** The slice of the paycheck we considered for goals. */
    budgetCents: number;
    /** Per-goal funding plan as of the paycheck date (informational). */
    plans: FundingPlan[];
    /** What we propose to route into each goal from THIS paycheck. */
    contributions: GoalContribution[];
    totalContributedCents: number;
    /** Marker: this agent NEVER moves money in Phase 1. */
    autonomousTransfer: false;
  };
}

const DEFAULT_FUNDING_RATE = 0.1; // 10% of each paycheck toward goals

export const goalFunderAgent: AgentDefinition<GoalFunderInput> = defineAgent<GoalFunderInput>({
  type: 'goal_funder',
  actionType: 'funding_proposal',
  requiresApproval: true,
  idempotencyKey: (i) => `funding:${i.paycheck.id}`,
  run: async (input, ctx) => {
    await ctx.log('compute:start', true, {
      paycheckTxnId: input.paycheck.id,
      goalCount: input.goals.length,
    });

    const rate = input.fundingRate ?? DEFAULT_FUNDING_RATE;
    if (rate < 0 || rate > 1) {
      throw new Error(`fundingRate must be between 0 and 1, got ${rate}`);
    }

    const asOf = input.paycheck.date;
    const budgetCents = Math.floor(input.paycheck.amountCents * rate);

    const plans = input.goals.map((g) => computeFunding(g, asOf));
    const contributions = allocatePaycheckToGoals(input.goals, asOf, budgetCents);
    const totalContributedCents = contributions.reduce((s, c) => s + c.amountCents, 0);

    await ctx.log('compute:done', true, {
      budgetCents,
      contributionCount: contributions.length,
      totalContributedCents,
    });

    // Recommend-only — no autonomous money movement (PRD §5 non-goal #2).
    // goals.current_amount is only updated once the user approves + executes.
    const data: GoalFunderData = {
      proposal: {
        paycheckTxnId: input.paycheck.id,
        paycheckAmountCents: input.paycheck.amountCents,
        budgetCents,
        plans,
        contributions,
        totalContributedCents,
        autonomousTransfer: false,
      },
    };
    await ctx.log('proposal:built', true, data as unknown as Record<string, unknown>);
    return { roi: null, data: data as unknown as Record<string, unknown> };
  },
});
