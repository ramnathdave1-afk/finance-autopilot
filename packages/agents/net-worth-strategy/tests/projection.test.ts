import { describe, it, expect } from 'vitest';
import {
  buildProjection,
  normalizeSnapshots,
  projectValue,
  solveTargetDate,
  requiredDailyRate,
  InsufficientHistoryError,
  type SnapshotPoint,
} from '../src/projection';

const pts = (...rows: Array<[string, number]>): SnapshotPoint[] =>
  rows.map(([date, netWorth]) => ({ date, netWorth }));

describe('normalizeSnapshots', () => {
  it('sorts by date, dedupes per date (last wins), drops invalid', () => {
    const out = normalizeSnapshots([
      { date: '2026-03-01', netWorth: 100 },
      { date: '2026-01-01', netWorth: 50 },
      { date: '2026-01-01', netWorth: 55 }, // same date — last wins
      { date: 'not-a-date', netWorth: 999 },
      { date: '2026-02-01', netWorth: Number.NaN },
    ]);
    expect(out).toEqual([
      { date: '2026-01-01', netWorth: 55 },
      { date: '2026-03-01', netWorth: 100 },
    ]);
  });
});

describe('buildProjection — linear', () => {
  it('computes a positive dollars/day slope over the window', () => {
    // +$3650 over 365 days => $10/day.
    const p = buildProjection(pts(['2025-01-01', 10_000], ['2026-01-01', 13_650]), 'linear');
    expect(p.startNetWorth).toBe(10_000);
    expect(p.currentNetWorth).toBe(13_650);
    expect(p.currentDate).toBe('2026-01-01');
    expect(p.dollarsPerDay).toBeCloseTo(10, 1);
    expect(p.flatOrNegative).toBe(false);
    expect(p.annualRate).toBeNull(); // linear model never sets a rate
  });

  it('flags flat growth', () => {
    const p = buildProjection(pts(['2026-01-01', 5_000], ['2026-06-01', 5_000]));
    expect(p.dollarsPerDay).toBe(0);
    expect(p.flatOrNegative).toBe(true);
  });

  it('flags negative growth', () => {
    const p = buildProjection(pts(['2026-01-01', 5_000], ['2026-02-01', 4_000]));
    expect(p.dollarsPerDay).toBeLessThan(0);
    expect(p.flatOrNegative).toBe(true);
  });
});

describe('buildProjection — cagr', () => {
  it('computes an annualized rate when start and current are positive', () => {
    // Doubling over ~1 year => ~100% annual rate.
    const p = buildProjection(pts(['2025-01-01', 100_000], ['2026-01-01', 200_000]), 'cagr');
    expect(p.annualRate).not.toBeNull();
    expect(p.annualRate!).toBeCloseTo(1.0, 1);
  });

  it('returns null annualRate when the start net worth is non-positive', () => {
    const p = buildProjection(pts(['2025-01-01', -1_000], ['2026-01-01', 5_000]), 'cagr');
    expect(p.annualRate).toBeNull(); // multiplicative rate undefined; falls back to linear
    expect(p.dollarsPerDay).toBeGreaterThan(0);
  });
});

describe('buildProjection — insufficient history', () => {
  it('throws on zero points', () => {
    expect(() => buildProjection([])).toThrow(InsufficientHistoryError);
  });

  it('throws on a single point', () => {
    expect(() => buildProjection(pts(['2026-01-01', 100]))).toThrow(InsufficientHistoryError);
  });

  it('throws when two rows collapse to one distinct date', () => {
    expect(() => buildProjection(pts(['2026-01-01', 100], ['2026-01-01', 200]))).toThrow(
      InsufficientHistoryError,
    );
  });
});

describe('projectValue', () => {
  it('projects forward linearly from the current date', () => {
    const p = buildProjection(pts(['2025-01-01', 0], ['2026-01-01', 36_500])); // ~$100/day
    const r = projectValue(p, 365);
    expect(r.date).toBe('2027-01-01');
    expect(r.netWorth).toBeCloseTo(73_000, -2);
  });

  it('compounds under the cagr model', () => {
    const p = buildProjection(pts(['2025-01-01', 100_000], ['2026-01-01', 110_000]), 'cagr'); // ~10%/yr
    const r = projectValue(p, Math.round(365.25));
    expect(r.netWorth).toBeGreaterThan(120_000);
    expect(r.netWorth).toBeLessThan(122_000);
  });
});

describe('solveTargetDate', () => {
  it('solves a future date under positive linear growth', () => {
    // $10/day from $13,650 on 2026-01-01; target $100K is 86,350 away => 8635 days.
    const p = buildProjection(pts(['2025-01-01', 10_000], ['2026-01-01', 13_650]));
    const solve = solveTargetDate(p, 100_000);
    expect(solve).not.toBeNull();
    expect(solve!.alreadyMet).toBe(false);
    expect(solve!.daysAway).toBe(Math.ceil((100_000 - 13_650) / 10));
  });

  it('reports alreadyMet when the target is at or below current', () => {
    const p = buildProjection(pts(['2026-01-01', 50_000], ['2026-06-01', 60_000]));
    const solve = solveTargetDate(p, 55_000);
    expect(solve).toEqual({ date: '2026-06-01', daysAway: 0, alreadyMet: true });
  });

  it('returns null (unreachable) when growth is flat/negative and target is above', () => {
    const flat = buildProjection(pts(['2026-01-01', 5_000], ['2026-06-01', 5_000]));
    expect(solveTargetDate(flat, 10_000)).toBeNull();
    const neg = buildProjection(pts(['2026-01-01', 5_000], ['2026-02-01', 4_000]));
    expect(solveTargetDate(neg, 10_000)).toBeNull();
  });

  it('returns null under cagr when the rate is non-positive and target is above', () => {
    const p = buildProjection(pts(['2025-01-01', 10_000], ['2026-01-01', 9_000]), 'cagr');
    expect(solveTargetDate(p, 20_000)).toBeNull();
  });
});

describe('requiredDailyRate', () => {
  it('returns the extra $/day needed beyond the current pace', () => {
    // current $10/day; need ($100K-$13.65K)/365 ≈ $236.58/day => extra ≈ $226.58.
    const p = buildProjection(pts(['2025-01-01', 10_000], ['2026-01-01', 13_650]));
    const extra = requiredDailyRate(p, 100_000, '2027-01-01');
    expect(extra).not.toBeNull();
    expect(extra!).toBeGreaterThan(200);
  });

  it('is <= 0 when the current pace already gets there in time', () => {
    const p = buildProjection(pts(['2025-01-01', 0], ['2026-01-01', 36_500])); // $100/day
    const extra = requiredDailyRate(p, 40_000, '2027-01-01'); // easily reached
    expect(extra!).toBeLessThanOrEqual(0);
  });

  it('returns null when the target date is not in the future', () => {
    const p = buildProjection(pts(['2025-01-01', 0], ['2026-01-01', 36_500]));
    expect(requiredDailyRate(p, 100_000, '2025-06-01')).toBeNull();
  });
});
