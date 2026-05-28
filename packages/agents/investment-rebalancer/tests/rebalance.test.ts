import { describe, it, expect } from 'vitest';
import {
  classifyAllocation,
  computeDrift,
  suggestRebalance,
  findHarvestCandidates,
  type Position,
} from '../src/rebalance';

const pos = (over: Partial<Position> = {}): Position => ({
  holdingId: 'h-1',
  accountId: 'acct-taxable',
  ticker: 'VTI',
  name: 'Vanguard Total Market',
  assetClass: 'equity',
  currentValue: 1000,
  costBasis: 800,
  taxable: true,
  ...over,
});

describe('classifyAllocation', () => {
  it('collapses positions into per-class weights summing to 1', () => {
    const { totalValue, weights } = classifyAllocation([
      pos({ holdingId: 'a', assetClass: 'equity', currentValue: 6000 }),
      pos({ holdingId: 'b', assetClass: 'fixed_income', currentValue: 4000 }),
    ]);
    expect(totalValue).toBe(10000);
    const eq = weights.find((w) => w.assetClass === 'equity')!;
    const fi = weights.find((w) => w.assetClass === 'fixed_income')!;
    expect(eq.weight).toBeCloseTo(0.6, 10);
    expect(fi.weight).toBeCloseTo(0.4, 10);
    expect(weights.reduce((s, w) => s + w.weight, 0)).toBeCloseTo(1, 10);
  });

  it('merges holdings of the same class and sorts by value desc', () => {
    const { weights } = classifyAllocation([
      pos({ holdingId: 'a', assetClass: 'equity', currentValue: 1000 }),
      pos({ holdingId: 'b', assetClass: 'equity', currentValue: 2000 }),
      pos({ holdingId: 'c', assetClass: 'cash', currentValue: 5000 }),
    ]);
    expect(weights[0]!.assetClass).toBe('cash');
    expect(weights.find((w) => w.assetClass === 'equity')!.value).toBe(3000);
  });

  it('empty portfolio: totalValue 0, no weights, no divide-by-zero', () => {
    const { totalValue, weights } = classifyAllocation([]);
    expect(totalValue).toBe(0);
    expect(weights).toEqual([]);
  });

  it('ignores zero / negative / non-finite values', () => {
    const { totalValue, weights } = classifyAllocation([
      pos({ holdingId: 'a', currentValue: 0 }),
      pos({ holdingId: 'b', currentValue: -50 }),
      pos({ holdingId: 'c', currentValue: Number.NaN }),
      pos({ holdingId: 'd', assetClass: 'equity', currentValue: 100 }),
    ]);
    expect(totalValue).toBe(100);
    expect(weights).toHaveLength(1);
  });
});

describe('computeDrift', () => {
  it('reports over/underweight drift vs target', () => {
    const report = computeDrift(
      [
        pos({ holdingId: 'a', assetClass: 'equity', currentValue: 8000 }),
        pos({ holdingId: 'b', assetClass: 'fixed_income', currentValue: 2000 }),
      ],
      { equity: 0.6, fixed_income: 0.4 },
    );
    expect(report.totalValue).toBe(10000);
    const eq = report.drift.find((d) => d.assetClass === 'equity')!;
    expect(eq.driftFraction).toBeCloseTo(0.2, 10); // 80% vs 60% -> overweight
    expect(eq.driftValue).toBeCloseTo(2000, 6); // sell $2000 of equity
    const fi = report.drift.find((d) => d.assetClass === 'fixed_income')!;
    expect(fi.driftFraction).toBeCloseTo(-0.2, 10);
    expect(report.maxAbsDrift).toBeCloseTo(0.2, 10);
  });

  it('already-balanced portfolio: zero drift', () => {
    const report = computeDrift(
      [
        pos({ holdingId: 'a', assetClass: 'equity', currentValue: 6000 }),
        pos({ holdingId: 'b', assetClass: 'fixed_income', currentValue: 4000 }),
      ],
      { equity: 0.6, fixed_income: 0.4 },
    );
    expect(report.maxAbsDrift).toBeCloseTo(0, 10);
    expect(suggestRebalance(report)).toEqual([]);
  });

  it('targeted-but-missing class shows fully underweight', () => {
    const report = computeDrift(
      [pos({ holdingId: 'a', assetClass: 'equity', currentValue: 10000 })],
      { equity: 0.5, fixed_income: 0.5 },
    );
    const fi = report.drift.find((d) => d.assetClass === 'fixed_income')!;
    expect(fi.currentWeight).toBe(0);
    expect(fi.driftFraction).toBeCloseTo(-0.5, 10);
    expect(fi.driftValue).toBeCloseTo(-5000, 6); // buy $5000
  });

  it('held-but-untargeted class shows fully overweight', () => {
    const report = computeDrift(
      [
        pos({ holdingId: 'a', assetClass: 'equity', currentValue: 9000 }),
        pos({ holdingId: 'b', assetClass: 'crypto', currentValue: 1000 }),
      ],
      { equity: 1 },
    );
    const crypto = report.drift.find((d) => d.assetClass === 'crypto')!;
    expect(crypto.targetWeight).toBe(0);
    expect(crypto.driftFraction).toBeCloseTo(0.1, 10);
  });

  it('empty portfolio + empty target: no drift, no throw', () => {
    const report = computeDrift([], {});
    expect(report.totalValue).toBe(0);
    expect(report.drift).toEqual([]);
    expect(report.maxAbsDrift).toBe(0);
  });

  it('throws on a target that does not sum to 1', () => {
    expect(() => computeDrift([pos()], { equity: 0.5, fixed_income: 0.3 })).toThrow(
      /sum to 1/,
    );
  });
});

describe('suggestRebalance', () => {
  it('emits sell for overweight, buy for underweight, sorted by size', () => {
    const report = computeDrift(
      [
        pos({ holdingId: 'a', assetClass: 'equity', currentValue: 8000 }),
        pos({ holdingId: 'b', assetClass: 'fixed_income', currentValue: 2000 }),
      ],
      { equity: 0.6, fixed_income: 0.4 },
    );
    const trades = suggestRebalance(report, 0.05);
    expect(trades).toHaveLength(2);
    expect(trades[0]!.amount).toBeGreaterThanOrEqual(trades[1]!.amount);
    const eq = trades.find((t) => t.assetClass === 'equity')!;
    expect(eq.side).toBe('sell');
    expect(eq.amount).toBeCloseTo(2000, 6);
    const fi = trades.find((t) => t.assetClass === 'fixed_income')!;
    expect(fi.side).toBe('buy');
  });

  it('suppresses trades inside the tolerance band', () => {
    const report = computeDrift(
      [
        pos({ holdingId: 'a', assetClass: 'equity', currentValue: 6200 }),
        pos({ holdingId: 'b', assetClass: 'fixed_income', currentValue: 3800 }),
      ],
      { equity: 0.6, fixed_income: 0.4 },
    );
    // drift is 2% per class, below a 5% band -> no trades
    expect(suggestRebalance(report, 0.05)).toEqual([]);
    // but a 1% band surfaces both
    expect(suggestRebalance(report, 0.01)).toHaveLength(2);
  });

  it('throws on a negative threshold', () => {
    const report = computeDrift([pos()], { equity: 1 });
    expect(() => suggestRebalance(report, -0.1)).toThrow(/non-negative/);
  });
});

describe('findHarvestCandidates', () => {
  it('flags taxable positions trading below cost basis', () => {
    const candidates = findHarvestCandidates([
      pos({ holdingId: 'loss', taxable: true, costBasis: 1000, currentValue: 700 }),
      pos({ holdingId: 'gain', taxable: true, costBasis: 800, currentValue: 1200 }),
    ]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.holdingId).toBe('loss');
    expect(candidates[0]!.unrealizedLoss).toBeCloseTo(300, 6);
  });

  it('excludes losses in tax-advantaged (non-taxable) accounts', () => {
    const candidates = findHarvestCandidates([
      pos({ holdingId: 'ira', taxable: false, costBasis: 1000, currentValue: 500 }),
    ]);
    expect(candidates).toEqual([]);
  });

  it('skips positions without a known cost basis', () => {
    const candidates = findHarvestCandidates([
      pos({ holdingId: 'unknown', taxable: true, costBasis: null, currentValue: 500 }),
    ]);
    expect(candidates).toEqual([]);
  });

  it('honors minLoss and sorts biggest loss first', () => {
    const candidates = findHarvestCandidates(
      [
        pos({ holdingId: 'small', taxable: true, costBasis: 1000, currentValue: 950 }),
        pos({ holdingId: 'big', taxable: true, costBasis: 1000, currentValue: 400 }),
        pos({ holdingId: 'mid', taxable: true, costBasis: 1000, currentValue: 800 }),
      ],
      100,
    );
    expect(candidates.map((c) => c.holdingId)).toEqual(['big', 'mid']);
  });

  it('empty portfolio: no candidates', () => {
    expect(findHarvestCandidates([])).toEqual([]);
  });

  it('throws on negative minLoss', () => {
    expect(() => findHarvestCandidates([pos()], -1)).toThrow(/non-negative/);
  });
});
