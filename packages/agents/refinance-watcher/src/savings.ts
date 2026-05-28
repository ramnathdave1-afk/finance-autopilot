// Pure refinance-savings math (PRD §8.3 Agent 11). No I/O — fully unit-tested.
//
// Model: compare what the borrower will pay over the remaining life of their
// CURRENT loan vs. what they would pay if they refinanced the outstanding
// balance into a new loan, at the snapshot's average APR, for the same number
// of remaining months. "Lifetime savings" = (total cost now) − (total cost
// refinanced), expressed in dollars over the loan life.
//
// We deliberately use APR-average (apr_avg) from the snapshot rather than the
// teaser apr_low — the agent should only fire when the *typical* offer beats
// the current loan, so the proposal survives contact with an actual underwriter.

/** Default threshold: only surface refis that save at least this much over the loan's life. */
export const DEFAULT_SAVINGS_THRESHOLD_DOLLARS = 1000;

export interface LoanSnapshotInput {
  /** Outstanding balance to be refinanced, in dollars. */
  balance: number;
  /** Current annual percentage rate as a decimal (0.0625 = 6.25%). */
  currentApr: number;
  /** Months remaining on the current loan. */
  remainingMonths: number;
}

export interface RefinanceCandidate {
  /** Candidate annual percentage rate as a decimal (0.0525 = 5.25%). */
  offeredApr: number;
  /**
   * Term of the refinanced loan in months. Defaults to the loan's
   * `remainingMonths` so we compare like-for-like payoff horizons (not a
   * longer term that lowers the payment but increases total interest).
   */
  termMonths?: number;
}

export interface SavingsResult {
  /** Total dollars paid over the remaining life of the current loan. */
  currentTotalCost: number;
  /** Total dollars paid over the life of the refinanced loan. */
  refinancedTotalCost: number;
  /** currentTotalCost − refinancedTotalCost. Positive = refinance saves money. */
  lifetimeSavings: number;
  /** Current monthly payment in dollars. */
  currentMonthlyPayment: number;
  /** Refinanced monthly payment in dollars. */
  refinancedMonthlyPayment: number;
  /** Months used for the refinanced loan. */
  refinancedTermMonths: number;
}

/**
 * Standard fixed-rate amortized monthly payment.
 * `apr` is the annual rate as a decimal; `months` is the number of payments.
 * Handles the 0% edge case (straight-line principal).
 */
export function monthlyPayment(principal: number, apr: number, months: number): number {
  if (months <= 0) return 0;
  if (principal <= 0) return 0;
  const r = apr / 12;
  if (r === 0) return principal / months;
  const factor = Math.pow(1 + r, months);
  return (principal * r * factor) / (factor - 1);
}

/** Total dollars paid (principal + interest) over `months` payments. */
export function totalCost(principal: number, apr: number, months: number): number {
  return monthlyPayment(principal, apr, months) * Math.max(0, months);
}

/**
 * Compute lifetime refinance savings for one loan against one candidate rate.
 * Pure — caller supplies the numbers; we never touch the DB here.
 */
export function computeRefinanceSavings(
  loan: LoanSnapshotInput,
  candidate: RefinanceCandidate,
): SavingsResult {
  const termMonths = candidate.termMonths ?? loan.remainingMonths;

  const currentMonthlyPayment = monthlyPayment(
    loan.balance,
    loan.currentApr,
    loan.remainingMonths,
  );
  const refinancedMonthlyPayment = monthlyPayment(loan.balance, candidate.offeredApr, termMonths);

  const currentTotalCost = round2(currentMonthlyPayment * Math.max(0, loan.remainingMonths));
  const refinancedTotalCost = round2(refinancedMonthlyPayment * Math.max(0, termMonths));

  return {
    currentTotalCost,
    refinancedTotalCost,
    lifetimeSavings: round2(currentTotalCost - refinancedTotalCost),
    currentMonthlyPayment: round2(currentMonthlyPayment),
    refinancedMonthlyPayment: round2(refinancedMonthlyPayment),
    refinancedTermMonths: termMonths,
  };
}

/**
 * Does this candidate clear the savings threshold? A candidate only counts if
 * its offered APR is strictly lower than the current APR (no "refinance" into
 * an equal/worse rate) AND lifetime savings >= threshold.
 */
export function clearsThreshold(
  loan: LoanSnapshotInput,
  candidate: RefinanceCandidate,
  thresholdDollars: number = DEFAULT_SAVINGS_THRESHOLD_DOLLARS,
): { clears: boolean; savings: SavingsResult } {
  const savings = computeRefinanceSavings(loan, candidate);
  const clears = candidate.offeredApr < loan.currentApr && savings.lifetimeSavings >= thresholdDollars;
  return { clears, savings };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
