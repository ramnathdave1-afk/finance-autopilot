// Pure goal-funding math (PRD §8.2 Agent 5).
//
// A goal has a target amount, an amount already saved, and an optional target
// date. We compute:
//   - monthly funding required = remaining / months_left
//   - on-track / behind / met status
//   - how to route a portion of a detected paycheck across active goals
//
// All amounts are in CENTS (integers) to avoid float drift, mirroring the
// auto-saver package. The agent converts to/from the dollar-denominated
// goals.* columns at its boundary.

export interface GoalInput {
  id: string;
  name: string;
  targetCents: number;
  currentCents: number;
  /** ISO yyyy-mm-dd. null = no deadline (open-ended goal). */
  targetDate: string | null;
}

export type FundingStatus = 'met' | 'on_track' | 'behind' | 'past_due' | 'no_deadline';

export interface FundingPlan {
  goalId: string;
  name: string;
  targetCents: number;
  currentCents: number;
  remainingCents: number;
  monthsLeft: number | null;
  /** Required monthly contribution to hit the goal by target_date. */
  monthlyFundingCents: number;
  status: FundingStatus;
}

export interface GoalContribution {
  goalId: string;
  name: string;
  amountCents: number;
}

/** Max active goals the agent will fund from a single paycheck (PRD §8.2 Agent 5). */
export const MAX_ACTIVE_GOALS = 5;

/**
 * Compute the funding plan for a single goal as of `asOf`.
 *
 * - met: current >= target (nothing left to fund)
 * - past_due: has a target_date in the past and not yet met
 * - no_deadline: no target_date — monthly funding is 0 (best-effort only)
 * - on_track / behind: informational; both produce a positive monthly figure
 *   (we surface "behind" when the deadline is this month or sooner).
 */
export function computeFunding(goal: GoalInput, asOf: string): FundingPlan {
  if (goal.targetCents < 0) throw new Error('target must be non-negative');
  if (goal.currentCents < 0) throw new Error('current must be non-negative');

  const remainingCents = Math.max(0, goal.targetCents - goal.currentCents);

  if (remainingCents === 0) {
    return base(goal, 0, null, 0, 'met');
  }

  if (goal.targetDate === null) {
    return base(goal, remainingCents, null, 0, 'no_deadline');
  }

  const monthsLeft = monthsBetween(asOf, goal.targetDate);

  if (monthsLeft <= 0) {
    // Deadline today or in the past and not met → past due. The full remaining
    // amount is "due now".
    return base(goal, remainingCents, monthsLeft, remainingCents, 'past_due');
  }

  const monthlyFundingCents = Math.ceil(remainingCents / monthsLeft);
  // "behind" when there's a month or less of runway left; otherwise on track.
  const status: FundingStatus = monthsLeft <= 1 ? 'behind' : 'on_track';
  return base(goal, remainingCents, monthsLeft, monthlyFundingCents, status);
}

/**
 * Route a portion of a single paycheck across active goals. We fund each goal
 * up to its required monthly amount, in priority order (soonest deadline first,
 * then largest remaining). We never over-fund a goal past its remaining balance
 * and never allocate more than the paycheck budget.
 *
 * `budgetCents` is the slice of the paycheck the user earmarked for goals.
 */
export function allocatePaycheckToGoals(
  goals: GoalInput[],
  asOf: string,
  budgetCents: number,
): GoalContribution[] {
  if (budgetCents < 0) throw new Error('budget must be non-negative');

  const plans = goals
    .map((g) => computeFunding(g, asOf))
    .filter((p) => p.remainingCents > 0)
    .sort(byPriority)
    .slice(0, MAX_ACTIVE_GOALS);

  const contributions: GoalContribution[] = [];
  let remainingBudget = budgetCents;

  for (const plan of plans) {
    if (remainingBudget <= 0) break;
    // Target this paycheck's share of the monthly requirement, capped at both
    // the goal's remaining balance and the leftover budget.
    const want = plan.monthlyFundingCents > 0 ? plan.monthlyFundingCents : plan.remainingCents;
    const give = Math.min(want, plan.remainingCents, remainingBudget);
    if (give <= 0) continue;
    contributions.push({ goalId: plan.goalId, name: plan.name, amountCents: give });
    remainingBudget -= give;
  }

  return contributions;
}

function base(
  goal: GoalInput,
  remainingCents: number,
  monthsLeft: number | null,
  monthlyFundingCents: number,
  status: FundingStatus,
): FundingPlan {
  return {
    goalId: goal.id,
    name: goal.name,
    targetCents: goal.targetCents,
    currentCents: goal.currentCents,
    remainingCents,
    monthsLeft,
    monthlyFundingCents,
    status,
  };
}

// Priority: goals with a deadline come before open-ended ones; among dated
// goals, the soonest deadline wins; ties broken by larger remaining balance.
function byPriority(a: FundingPlan, b: FundingPlan): number {
  const aHas = a.monthsLeft !== null;
  const bHas = b.monthsLeft !== null;
  if (aHas !== bHas) return aHas ? -1 : 1;
  if (aHas && bHas && a.monthsLeft !== b.monthsLeft) {
    return (a.monthsLeft as number) - (b.monthsLeft as number);
  }
  return b.remainingCents - a.remainingCents;
}

/**
 * Whole calendar months from `a` to `b` (rounded up so a partial month still
 * counts as a funding opportunity). Returns 0 when b is on/before a.
 */
function monthsBetween(a: string, b: string): number {
  const da = Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10));
  const db = Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10));
  if (db <= da) return 0;
  const days = (db - da) / 86_400_000;
  return Math.ceil(days / 30);
}
