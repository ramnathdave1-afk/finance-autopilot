// Claude-backed strategy generation (PRD §8.4 Agent 15 — recommend-only).
//
// Takes the HARD numbers produced by ./projection (current net worth, trajectory,
// target-date solve, the extra $/day needed to hit the user's goal) and asks
// Claude to turn them into ranked, recommend-only levers ("max your Roth",
// "+5% savings rate", "shift bond allocation"). Claude NEVER produces the
// numbers — it only narrates the ones we computed. No money moves; this is
// advice text rendered on the Strategy page behind requiresApproval.
//
// HONESTY: the Claude call goes through @fa/claude, whose getClaude() throws if
// ANTHROPIC_API_KEY is unset — an uncredentialed run fails loudly and escalates
// rather than emitting a fabricated plan. Tests mock @fa/claude.

import { call as claudeCall, DEFAULT_MODEL } from '@fa/claude';
import type { Projection, TargetSolve } from './projection';

export interface StrategyTarget {
  /** Target net worth in dollars (e.g. 250_000). */
  amount: number;
  /** ISO date the user wants to hit it by (e.g. "2030-01-01"). */
  date: string;
}

/** The computed facts handed to Claude. All numbers come from ./projection. */
export interface StrategyContext {
  projection: Projection;
  /** Where the current pace lands the user vs the target (null = unreachable). */
  targetSolve: TargetSolve | null;
  /** Extra $/day of growth needed to hit target by date (null = date passed). */
  requiredExtraPerDay: number | null;
  target: StrategyTarget;
}

export interface StrategyLever {
  /** Short imperative title, e.g. "Max your Roth IRA". */
  title: string;
  /** One-sentence rationale tied to the numbers. */
  rationale: string;
  /** Qualitative effort to adopt this lever. */
  effort: 'low' | 'medium' | 'high';
}

export interface StrategyRecommendation {
  /** Plain-language read on whether the target is on track. */
  headline: string;
  /** Ranked, recommend-only levers. Never an instruction to move money. */
  levers: StrategyLever[];
}

/**
 * Ask Claude for ranked levers. Recommend-only: the system prompt forbids any
 * autonomous-action language and forbids inventing numbers. Returns an empty
 * lever list (not a throw) on an unparseable response — the caller still has
 * the hard projection to show.
 */
export async function generateStrategy(
  c: StrategyContext,
): Promise<StrategyRecommendation> {
  const system =
    'You are a personal-finance net-worth strategist. You are given a user\'s ' +
    'computed net-worth trajectory and a target. Produce RECOMMENDATIONS ONLY — ' +
    'you never move money, place trades, or take any action; you only suggest ' +
    'levers the user could choose to adopt. Rank 2-4 levers by impact. ' +
    'Respond with ONLY a JSON object: ' +
    '{"headline": string, "levers": [{"title": string, "rationale": string, ' +
    '"effort": "low"|"medium"|"high"}]}. ' +
    'Never invent dollar figures, rates, or dates — reference only the numbers ' +
    'provided. Each rationale must be one sentence. If the target is already ' +
    'met or unreachable on the current path, say so plainly in the headline.';

  const user = JSON.stringify({
    currentNetWorth: c.projection.currentNetWorth,
    asOf: c.projection.currentDate,
    model: c.projection.model,
    dollarsPerDay: c.projection.dollarsPerDay,
    annualRatePct:
      c.projection.annualRate === null ? null : Number((c.projection.annualRate * 100).toFixed(2)),
    flatOrNegativeGrowth: c.projection.flatOrNegative,
    target: c.target,
    onCurrentPace: c.targetSolve
      ? c.targetSolve.alreadyMet
        ? { status: 'already_met' }
        : { status: 'reaches', date: c.targetSolve.date, daysAway: c.targetSolve.daysAway }
      : { status: 'unreachable_on_current_path' },
    extraDollarsPerDayNeeded: c.requiredExtraPerDay,
  });

  const res = await claudeCall({
    model: DEFAULT_MODEL,
    system,
    user,
    maxTokens: 900,
    temperature: 0.3,
    tag: 'net_worth_strategy',
  });

  return safeParseStrategy(res.text);
}

export function safeParseStrategy(text: string): StrategyRecommendation {
  try {
    const stripped = text.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
    const obj = JSON.parse(stripped) as { headline?: unknown; levers?: unknown };
    const headline = typeof obj.headline === 'string' ? obj.headline : '';
    const levers: StrategyLever[] = [];
    if (Array.isArray(obj.levers)) {
      for (const raw of obj.levers) {
        if (!raw || typeof raw !== 'object') continue;
        const r = raw as Record<string, unknown>;
        if (typeof r.title !== 'string' || typeof r.rationale !== 'string') continue;
        const effort =
          r.effort === 'low' || r.effort === 'medium' || r.effort === 'high'
            ? r.effort
            : 'medium';
        levers.push({ title: r.title, rationale: r.rationale, effort });
      }
    }
    return { headline, levers: levers.slice(0, 4) };
  } catch {
    return { headline: '', levers: [] };
  }
}
