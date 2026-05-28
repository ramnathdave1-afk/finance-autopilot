// Pure analysis helpers. No DB, no Claude — easy to test, easy to reason about.

import type { TransactionRow } from '@fa/db/types';

export type CategoryTotals = Map<string, number>;

/** Sum positive (debit) amounts grouped by ai_category (or category fallback). */
export function categoryTotals(txns: TransactionRow[]): CategoryTotals {
  const out: CategoryTotals = new Map();
  for (const t of txns) {
    if (!(Number(t.amount) > 0)) continue;
    const key = t.ai_category ?? t.category ?? 'uncategorized';
    out.set(key, (out.get(key) ?? 0) + Number(t.amount));
  }
  return out;
}

export interface MoMDelta {
  category: string;
  current: number;
  prior: number;
  /** Percentage change, prior→current. null if prior is 0 (avoid /0). */
  pctChange: number | null;
  /** Absolute dollar delta. */
  dollarDelta: number;
}

/**
 * Month-over-month deltas. Splits txns by date into "current window" (last 30d
 * relative to `now`) and "prior window" (30–60d before `now`).
 */
export function monthOverMonthDeltas(
  txns: TransactionRow[],
  now: Date = new Date(),
): MoMDelta[] {
  const thirtyMs = 30 * 24 * 60 * 60 * 1000;
  const currentStart = now.getTime() - thirtyMs;
  const priorStart = now.getTime() - 2 * thirtyMs;

  const current: TransactionRow[] = [];
  const prior: TransactionRow[] = [];
  for (const t of txns) {
    const ts = new Date(t.date).getTime();
    if (Number.isNaN(ts)) continue;
    if (ts >= currentStart && ts <= now.getTime()) current.push(t);
    else if (ts >= priorStart && ts < currentStart) prior.push(t);
  }

  const c = categoryTotals(current);
  const p = categoryTotals(prior);
  const cats = new Set<string>([...c.keys(), ...p.keys()]);

  const out: MoMDelta[] = [];
  for (const cat of cats) {
    const cur = c.get(cat) ?? 0;
    const pr = p.get(cat) ?? 0;
    const pct = pr === 0 ? null : ((cur - pr) / pr) * 100;
    out.push({
      category: cat,
      current: round2(cur),
      prior: round2(pr),
      pctChange: pct == null ? null : Math.round(pct * 10) / 10,
      dollarDelta: round2(cur - pr),
    });
  }
  // Largest absolute delta first — those are the actionable ones.
  out.sort((a, b) => Math.abs(b.dollarDelta) - Math.abs(a.dollarDelta));
  return out;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
