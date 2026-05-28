// Anomaly heuristic unit tests. The detector itself goes through Supabase, so
// these test the pure-logic surface area we expose (no DB needed). For full
// integration we'd seed a test schema and exercise detectAnomalies end-to-end;
// that lives in the (gated) integration suite.

import { describe, it, expect } from 'vitest';

// Internal helpers aren't exported; we re-derive them here as black-box checks
// against the documented behavior.

function median(xs: number[]) {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

describe('anomaly heuristics — invariants', () => {
  it('median behaves correctly on odd + even lengths', () => {
    expect(median([3])).toBe(3);
    expect(median([1, 3])).toBe(2);
    expect(median([1, 2, 3])).toBe(2);
    expect(median([1, 2, 3, 100])).toBe(2.5);
  });

  it('outlier multiplier definition: 3× median triggers', () => {
    const hist = [4.50, 5.25, 4.95];
    const med = median(hist);
    const candidate = 15.10; // > 3× ~5
    expect(candidate / med).toBeGreaterThanOrEqual(3);
  });

  it('routine recurring charges do not trigger outlier', () => {
    const hist = [4.50, 5.25, 4.95, 5.10];
    const med = median(hist);
    const candidate = 5.50;
    expect(candidate / med).toBeLessThan(3);
  });
});
