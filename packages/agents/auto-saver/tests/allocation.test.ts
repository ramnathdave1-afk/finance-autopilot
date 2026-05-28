import { describe, expect, it } from 'vitest';
import { computeAllocation, DEFAULT_RULES } from '../src/allocation';

describe('computeAllocation', () => {
  it('splits an even paycheck into default buckets', () => {
    const buckets = computeAllocation(400_000);
    expect(buckets.map((b) => b.name)).toEqual(['emergency', 'debt', 'invest', 'spend']);
    const total = buckets.reduce((s, b) => s + b.dollarAmountCents, 0);
    expect(total).toBe(400_000);
    expect(buckets[0]!.dollarAmountCents).toBe(80_000);
    expect(buckets[1]!.dollarAmountCents).toBe(40_000);
    expect(buckets[2]!.dollarAmountCents).toBe(20_000);
    expect(buckets[3]!.dollarAmountCents).toBe(260_000);
  });

  it('absorbs rounding drift in the last bucket', () => {
    const buckets = computeAllocation(100); // 100 cents
    const total = buckets.reduce((s, b) => s + b.dollarAmountCents, 0);
    expect(total).toBe(100);
  });

  it('respects custom rules summing to 100', () => {
    const buckets = computeAllocation(100_000, [
      { bucketName: 'save', percent: 50 },
      { bucketName: 'spend', percent: 50 },
    ]);
    expect(buckets[0]!.dollarAmountCents).toBe(50_000);
    expect(buckets[1]!.dollarAmountCents).toBe(50_000);
  });

  it('throws when rules do not sum to 100', () => {
    expect(() =>
      computeAllocation(100_000, [{ bucketName: 'x', percent: 60 }]),
    ).toThrow(/must sum to 100/);
  });

  it('throws on negative paycheck', () => {
    expect(() => computeAllocation(-1, DEFAULT_RULES)).toThrow();
  });
});
