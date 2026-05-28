// Pure net-worth projection math (PRD §8.4 Agent 15).
//
// No I/O, no Claude, no DB — just deterministic arithmetic over a series of
// (date, netWorth) snapshots. Everything here is unit-tested. The agent reads
// snapshot history from @fa/db, runs it through these functions to get a hard
// trajectory + target-date solve, and only THEN hands the numbers to Claude for
// narrative strategy. Claude never produces the numbers; it only explains them.

export interface SnapshotPoint {
  /** ISO date (YYYY-MM-DD). */
  date: string;
  /** Net worth on that date, in dollars. */
  netWorth: number;
}

export type GrowthModel = 'linear' | 'cagr';

export interface Projection {
  /** Which model was used. */
  model: GrowthModel;
  /** First observed net worth in the window. */
  startNetWorth: number;
  /** Most recent observed net worth. */
  currentNetWorth: number;
  /** ISO date of the most recent observed snapshot — the projection origin. */
  currentDate: string;
  /** Days spanned by the observed window (>= 1 once we have >= 2 points). */
  observedDays: number;
  /**
   * Linear model: dollars/day. CAGR model: still exposed as the average
   * dollars/day over the window, for display parity. May be 0 or negative.
   */
  dollarsPerDay: number;
  /**
   * CAGR model only: annualized growth rate as a decimal (0.08 = 8%/yr).
   * null for the linear model or when it cannot be computed (e.g. non-positive
   * start value, where a multiplicative rate is undefined).
   */
  annualRate: number | null;
  /**
   * Whether growth is flat or negative — the caller (and Claude) must treat the
   * target as unreachable on the current path and recommend changes.
   */
  flatOrNegative: boolean;
}

const MS_PER_DAY = 86_400_000;
const DAYS_PER_YEAR = 365.25;

function daysBetween(a: string, b: string): number {
  const ms = Date.parse(b) - Date.parse(a);
  return ms / MS_PER_DAY;
}

function addDays(iso: string, days: number): string {
  const d = new Date(Date.parse(iso) + days * MS_PER_DAY);
  return d.toISOString().slice(0, 10);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export class InsufficientHistoryError extends Error {
  constructor(public readonly points: number) {
    super(`net-worth projection needs >= 2 snapshots, got ${points}`);
    this.name = 'InsufficientHistoryError';
  }
}

/**
 * Sort + de-duplicate snapshots by date (last write per date wins, matching the
 * one-row-per-(user,date) DB constraint) and drop anything unparseable.
 */
export function normalizeSnapshots(points: SnapshotPoint[]): SnapshotPoint[] {
  const byDate = new Map<string, SnapshotPoint>();
  for (const p of points) {
    if (!p || typeof p.netWorth !== 'number' || Number.isNaN(p.netWorth)) continue;
    if (Number.isNaN(Date.parse(p.date))) continue;
    byDate.set(p.date.slice(0, 10), { date: p.date.slice(0, 10), netWorth: p.netWorth });
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Build a projection from snapshot history.
 *
 * @throws InsufficientHistoryError when fewer than 2 distinct-date snapshots
 *   exist — there is no honest way to fit a trajectory through one point, and we
 *   refuse to fabricate one.
 *
 * Edge handling:
 *   - Flat (start == current): dollarsPerDay 0, flatOrNegative true.
 *   - Negative growth: dollarsPerDay < 0, flatOrNegative true.
 *   - CAGR with non-positive start net worth: annualRate is null (a
 *     multiplicative rate is undefined when you start at/below zero), and we
 *     fall back to the linear slope for dollarsPerDay.
 */
export function buildProjection(
  rawPoints: SnapshotPoint[],
  model: GrowthModel = 'linear',
): Projection {
  const points = normalizeSnapshots(rawPoints);
  if (points.length < 2) {
    throw new InsufficientHistoryError(points.length);
  }

  const first = points[0]!;
  const last = points[points.length - 1]!;
  const observedDays = Math.max(1, daysBetween(first.date, last.date));

  const startNetWorth = round2(first.netWorth);
  const currentNetWorth = round2(last.netWorth);

  const linearPerDay = (currentNetWorth - startNetWorth) / observedDays;

  let annualRate: number | null = null;
  if (model === 'cagr' && startNetWorth > 0 && currentNetWorth > 0) {
    const years = observedDays / DAYS_PER_YEAR;
    annualRate = Math.pow(currentNetWorth / startNetWorth, 1 / years) - 1;
  }

  const dollarsPerDay = round2(linearPerDay);
  const flatOrNegative = dollarsPerDay <= 0;

  return {
    model,
    startNetWorth,
    currentNetWorth,
    currentDate: last.date,
    observedDays: round2(observedDays),
    dollarsPerDay,
    annualRate: annualRate === null ? null : Number(annualRate.toFixed(6)),
    flatOrNegative,
  };
}

export interface ProjectValueResult {
  /** ISO date projected to. */
  date: string;
  /** Projected net worth on that date. */
  netWorth: number;
}

/**
 * Project net worth forward `daysAhead` days from the current snapshot under the
 * projection's model. Linear adds dollarsPerDay; CAGR compounds annualRate (and
 * falls back to linear when annualRate is null, e.g. non-positive start).
 */
export function projectValue(p: Projection, daysAhead: number): ProjectValueResult {
  const fromDate = p.currentDate;
  let value: number;
  if (p.model === 'cagr' && p.annualRate !== null) {
    const years = daysAhead / DAYS_PER_YEAR;
    value = p.currentNetWorth * Math.pow(1 + p.annualRate, years);
  } else {
    value = p.currentNetWorth + p.dollarsPerDay * daysAhead;
  }
  return { date: addDays(fromDate, daysAhead), netWorth: round2(value) };
}

/**
 * Solve for the date at which net worth first reaches `target` under the model.
 *
 * Returns null (target unreachable on the current path) when:
 *   - target <= current and we'd be solving for the past (already hit), OR
 *   - growth is flat/negative and target is above current, OR
 *   - CAGR rate is non-positive and target is above current.
 *
 * When target <= current, returns { date: today, alreadyMet: true }.
 */
export interface TargetSolve {
  /** ISO date the target is first reached. */
  date: string;
  /** Days from the current snapshot to that date. */
  daysAway: number;
  /** True when the target is already met as of the current snapshot. */
  alreadyMet: boolean;
}

export function solveTargetDate(p: Projection, target: number): TargetSolve | null {
  const fromDate = p.currentDate;
  if (target <= p.currentNetWorth) {
    return { date: fromDate, daysAway: 0, alreadyMet: true };
  }

  // Target is above current — need positive growth to ever reach it.
  let daysAway: number;
  if (p.model === 'cagr' && p.annualRate !== null) {
    if (p.annualRate <= 0) return null;
    const years = Math.log(target / p.currentNetWorth) / Math.log(1 + p.annualRate);
    daysAway = years * DAYS_PER_YEAR;
  } else {
    if (p.dollarsPerDay <= 0) return null;
    daysAway = (target - p.currentNetWorth) / p.dollarsPerDay;
  }

  if (!Number.isFinite(daysAway) || daysAway < 0) return null;
  const rounded = Math.ceil(daysAway);
  return { date: addDays(fromDate, rounded), daysAway: rounded, alreadyMet: false };
}

/**
 * Compute the extra dollars/day of net-worth growth required to hit `target` by
 * `targetDate` — the headline "what would it take" number Claude turns into
 * levers. Returns null when the date is in the past relative to the current
 * snapshot. A value <= 0 means the current pace already gets there in time.
 */
export function requiredDailyRate(
  p: Projection,
  target: number,
  targetDate: string,
): number | null {
  const days = daysBetween(p.currentDate, targetDate);
  if (days <= 0) return null;
  const needPerDay = (target - p.currentNetWorth) / days;
  return round2(needPerDay - p.dollarsPerDay);
}
