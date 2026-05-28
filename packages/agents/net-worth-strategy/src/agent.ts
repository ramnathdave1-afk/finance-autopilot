// PRD §8.4 Agent 15 — Net Worth Strategy (Premium / Tier-3).
//
// Reads the user's net_worth_snapshots history, projects the trajectory
// ("$100K by Mar 2028 at the current rate"), and asks Claude for ranked,
// recommend-only levers to hit a user-set target ("$250K by 2030").
//
// RECOMMEND-ONLY (PRD §8.4 marks Tier-3 as lighter, strategy-mode agents):
// this agent moves no money, places no trades, and takes no autonomous action.
// It produces advice text rendered on the Strategy page. Hence
// requiresApproval:true — surfacing a strategy plan to the user is a
// human-in-the-loop step, never an execution.
//
// HONESTY: the only external call is Claude, through @fa/claude (whose
// getClaude() throws on a missing ANTHROPIC_API_KEY). An uncredentialed run
// fails loudly and escalates via runAgent's retry/escalation path — it never
// emits a fabricated plan. All numbers come from the pure ./projection module;
// Claude only narrates them.

import { defineAgent, type AgentDefinition } from '@fa/inngest';
import { getSnapshotHistory } from '@fa/db';
import {
  buildProjection,
  solveTargetDate,
  requiredDailyRate,
  projectValue,
  InsufficientHistoryError,
  type GrowthModel,
  type Projection,
  type SnapshotPoint,
} from './projection';
import {
  generateStrategy,
  type StrategyRecommendation,
  type StrategyTarget,
} from './strategy';

export interface NetWorthStrategyInput {
  /** The net-worth target the user wants to hit. */
  target: StrategyTarget;
  /** Projection model. Defaults to 'linear' (most defensible from snapshots). */
  model?: GrowthModel;
  /** How many days of snapshot history to read. Defaults to 365. */
  historyDays?: number;
}

export interface NetWorthStrategyData {
  /** True when there were < 2 snapshots to project from. */
  insufficientHistory: boolean;
  currentNetWorth: number | null;
  asOf: string | null;
  model: GrowthModel;
  dollarsPerDay: number | null;
  annualRatePct: number | null;
  flatOrNegative: boolean | null;
  /** Where the current pace lands the user. */
  onCurrentPace:
    | { status: 'already_met' }
    | { status: 'reaches'; date: string; daysAway: number }
    | { status: 'unreachable_on_current_path' }
    | null;
  /** Extra $/day of growth needed to hit the target by its date. */
  extraDollarsPerDayNeeded: number | null;
  /** Net worth projected at the target date under the current pace. */
  projectedAtTargetDate: number | null;
  target: StrategyTarget;
  /** Claude-generated recommend-only levers. Empty when history is insufficient. */
  recommendation: StrategyRecommendation;
}

const EMPTY_RECOMMENDATION: StrategyRecommendation = { headline: '', levers: [] };

export const netWorthStrategyAgent: AgentDefinition<NetWorthStrategyInput> =
  defineAgent<NetWorthStrategyInput>({
    type: 'net_worth_strategy',
    actionType: 'strategy_recommendation',
    // Recommend-only: surfacing a plan is a human-in-the-loop step, not an
    // autonomous money move. Tier-3 agents require approval.
    requiresApproval: true,
    // One strategy run per (target amount, target date) — re-running with the
    // same goal is idempotent; changing the goal is a new action.
    idempotencyKey: (i) => `strategy:${i.target.amount}:${i.target.date}`,
    run: async (input, ctx) => {
      const model: GrowthModel = input.model ?? 'linear';
      const historyDays = input.historyDays ?? 365;

      await ctx.log('history:pull', true, { historyDays, model });
      const history = await getSnapshotHistory(ctx.userId, historyDays);
      const points: SnapshotPoint[] = history.map((h) => ({
        date: h.snapshot_date,
        netWorth: Number(h.net_worth),
      }));
      await ctx.log('history:done', true, { snapshots: points.length });

      let projection: Projection;
      try {
        projection = buildProjection(points, model);
      } catch (e) {
        if (e instanceof InsufficientHistoryError) {
          // Not a failure — there's simply nothing to project yet. Succeed with
          // a clearly-flagged empty result so the page can prompt the user to
          // keep tracking rather than escalate.
          await ctx.log('projection:insufficient', true, { snapshots: points.length });
          const data: NetWorthStrategyData = {
            insufficientHistory: true,
            currentNetWorth: points[points.length - 1]?.netWorth ?? null,
            asOf: points[points.length - 1]?.date ?? null,
            model,
            dollarsPerDay: null,
            annualRatePct: null,
            flatOrNegative: null,
            onCurrentPace: null,
            extraDollarsPerDayNeeded: null,
            projectedAtTargetDate: null,
            target: input.target,
            recommendation: EMPTY_RECOMMENDATION,
          };
          return { roi: null, data: data as unknown as Record<string, unknown> };
        }
        throw e;
      }

      const targetSolve = solveTargetDate(projection, input.target.amount);
      const requiredExtraPerDay = requiredDailyRate(
        projection,
        input.target.amount,
        input.target.date,
      );
      const daysToTarget = Math.max(
        0,
        Math.round(
          (Date.parse(input.target.date) - Date.parse(projection.currentDate)) / 86_400_000,
        ),
      );
      const projectedAtTargetDate = projectValue(projection, daysToTarget).netWorth;

      await ctx.log('projection:done', true, {
        currentNetWorth: projection.currentNetWorth,
        dollarsPerDay: projection.dollarsPerDay,
        flatOrNegative: projection.flatOrNegative,
        reaches: targetSolve?.alreadyMet
          ? 'already_met'
          : targetSolve
            ? targetSolve.date
            : 'unreachable',
      });

      const recommendation = await generateStrategy({
        projection,
        targetSolve,
        requiredExtraPerDay,
        target: input.target,
      });
      // Persist the FULL recommendation (headline + levers) into the terminal
      // audit step so the UI can render the actual levers — runAgent stores only
      // roi + audit_log, never the result.data payload, so the counts alone
      // would discard the core deliverable.
      await ctx.log('strategy:done', true, {
        leverCount: recommendation.levers.length,
        headline: recommendation.headline,
        levers: recommendation.levers,
      });

      const onCurrentPace: NetWorthStrategyData['onCurrentPace'] = targetSolve
        ? targetSolve.alreadyMet
          ? { status: 'already_met' }
          : { status: 'reaches', date: targetSolve.date, daysAway: targetSolve.daysAway }
        : { status: 'unreachable_on_current_path' };

      const data: NetWorthStrategyData = {
        insufficientHistory: false,
        currentNetWorth: projection.currentNetWorth,
        asOf: projection.currentDate,
        model: projection.model,
        dollarsPerDay: projection.dollarsPerDay,
        annualRatePct:
          projection.annualRate === null
            ? null
            : Number((projection.annualRate * 100).toFixed(2)),
        flatOrNegative: projection.flatOrNegative,
        onCurrentPace,
        extraDollarsPerDayNeeded: requiredExtraPerDay,
        projectedAtTargetDate,
        target: input.target,
        recommendation,
      };

      // roi is null: a strategy recommendation delivers no realized dollars —
      // nothing has moved. ROI accrues only if the user later acts on a lever.
      return { roi: null, data: data as unknown as Record<string, unknown> };
    },
  });
