import { describe, expect, it } from 'vitest';
import {
  allocatePaycheckToGoals,
  computeFunding,
  MAX_ACTIVE_GOALS,
  type GoalInput,
} from '../src/funding-calc';

const goal = (over: Partial<GoalInput> = {}): GoalInput => ({
  id: 'g1',
  name: 'Emergency Fund',
  targetCents: 1_000_000, // $10,000
  currentCents: 0,
  targetDate: '2026-12-01',
  ...over,
});

describe('computeFunding', () => {
  it('on-track: spreads remaining across months left', () => {
    // 183 days from 2026-06-01 to 2026-12-01 → ceil(183/30) = 7 months.
    // 1,000,000 / 7 = 142,858 (ceil).
    const plan = computeFunding(goal({ currentCents: 0 }), '2026-06-01');
    expect(plan.status).toBe('on_track');
    expect(plan.remainingCents).toBe(1_000_000);
    expect(plan.monthsLeft).toBe(7);
    expect(plan.monthlyFundingCents).toBe(142_858);
  });

  it('behind: a month or less of runway flags behind', () => {
    const plan = computeFunding(goal({ currentCents: 800_000 }), '2026-11-20');
    expect(plan.status).toBe('behind');
    expect(plan.monthsLeft).toBe(1);
    expect(plan.remainingCents).toBe(200_000);
    expect(plan.monthlyFundingCents).toBe(200_000);
  });

  it('goal met: current >= target → met, no funding required', () => {
    const plan = computeFunding(goal({ currentCents: 1_000_000 }), '2026-06-01');
    expect(plan.status).toBe('met');
    expect(plan.remainingCents).toBe(0);
    expect(plan.monthlyFundingCents).toBe(0);
  });

  it('past target_date: not met after deadline → past_due, full remaining due now', () => {
    const plan = computeFunding(goal({ currentCents: 400_000 }), '2027-01-15');
    expect(plan.status).toBe('past_due');
    expect(plan.remainingCents).toBe(600_000);
    expect(plan.monthlyFundingCents).toBe(600_000);
  });

  it('no deadline: open-ended goal funds best-effort (0 monthly required)', () => {
    const plan = computeFunding(goal({ targetDate: null, currentCents: 100_000 }), '2026-06-01');
    expect(plan.status).toBe('no_deadline');
    expect(plan.remainingCents).toBe(900_000);
    expect(plan.monthlyFundingCents).toBe(0);
  });

  it('throws on negative target or current', () => {
    expect(() => computeFunding(goal({ targetCents: -1 }), '2026-06-01')).toThrow();
    expect(() => computeFunding(goal({ currentCents: -1 }), '2026-06-01')).toThrow();
  });
});

describe('allocatePaycheckToGoals', () => {
  it('routes the budget across goals up to each monthly requirement', () => {
    const goals: GoalInput[] = [
      goal({ id: 'a', name: 'A', targetCents: 600_000, currentCents: 0, targetDate: '2026-12-01' }),
      goal({ id: 'b', name: 'B', targetCents: 600_000, currentCents: 0, targetDate: '2026-12-01' }),
    ];
    // 7 months left → each wants ceil(600,000/7)=85,715/mo. Budget 250,000
    // covers both monthly slices fully (85,715 * 2 = 171,430).
    const out = allocatePaycheckToGoals(goals, '2026-06-01', 250_000);
    expect(out).toHaveLength(2);
    expect(out[0]!.amountCents).toBe(85_715);
    expect(out[1]!.amountCents).toBe(85_715);
  });

  it('prioritizes the soonest deadline and stops when budget is exhausted', () => {
    const goals: GoalInput[] = [
      goal({ id: 'far', name: 'Far', targetCents: 600_000, currentCents: 0, targetDate: '2026-12-01' }),
      goal({ id: 'soon', name: 'Soon', targetCents: 600_000, currentCents: 0, targetDate: '2026-07-01' }),
    ];
    // Budget only big enough for the soonest goal's monthly slice.
    const out = allocatePaycheckToGoals(goals, '2026-06-01', 500_000);
    expect(out[0]!.goalId).toBe('soon');
    const total = out.reduce((s, c) => s + c.amountCents, 0);
    expect(total).toBeLessThanOrEqual(500_000);
  });

  it('never over-funds past a goal remaining balance', () => {
    // Deadline within a month → monthly requirement equals the full remaining
    // ($50). Even with an effectively unlimited budget we never route more
    // than the $50 remaining.
    const goals: GoalInput[] = [
      goal({ id: 'almost', name: 'Almost', targetCents: 100_000, currentCents: 95_000, targetDate: '2026-06-20' }),
    ];
    const out = allocatePaycheckToGoals(goals, '2026-06-01', 1_000_000);
    expect(out[0]!.amountCents).toBe(5_000);
  });

  it('skips met goals and caps at MAX_ACTIVE_GOALS', () => {
    const goals: GoalInput[] = Array.from({ length: 8 }, (_, i) =>
      goal({ id: `g${i}`, name: `G${i}`, targetCents: 100_000, currentCents: 0, targetDate: '2026-12-01' }),
    );
    goals.push(goal({ id: 'done', name: 'Done', targetCents: 100_000, currentCents: 100_000 }));
    const out = allocatePaycheckToGoals(goals, '2026-06-01', 10_000_000);
    expect(out.length).toBeLessThanOrEqual(MAX_ACTIVE_GOALS);
    expect(out.some((c) => c.goalId === 'done')).toBe(false);
  });

  it('throws on negative budget', () => {
    expect(() => allocatePaycheckToGoals([], '2026-06-01', -1)).toThrow();
  });
});
