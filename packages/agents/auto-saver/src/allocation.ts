// Pure allocation math. Given a paycheck amount + user's rules, produce a list
// of {bucketName, percent, dollarAmount} entries that always sum to 100% and
// to the original amount (the last bucket absorbs rounding).

export interface AllocationRule {
  bucketName: string;
  percent: number; // 0–100
}

export interface AllocationBucket {
  name: string;
  percent: number;
  dollarAmountCents: number;
}

/** Default split (PRD §8.2 Agent 2): 20% emergency / 10% debt / 5% invest / 65% spend. */
export const DEFAULT_RULES: AllocationRule[] = [
  { bucketName: 'emergency', percent: 20 },
  { bucketName: 'debt', percent: 10 },
  { bucketName: 'invest', percent: 5 },
  { bucketName: 'spend', percent: 65 },
];

export function computeAllocation(
  paycheckCents: number,
  rules: AllocationRule[] = DEFAULT_RULES,
): AllocationBucket[] {
  if (paycheckCents < 0) throw new Error('paycheck must be non-negative');
  if (rules.length === 0) throw new Error('at least one rule required');

  const total = rules.reduce((s, r) => s + r.percent, 0);
  if (Math.abs(total - 100) > 0.001) {
    throw new Error(`allocation rules must sum to 100, got ${total}`);
  }

  const buckets: AllocationBucket[] = rules.map((r) => ({
    name: r.bucketName,
    percent: r.percent,
    dollarAmountCents: Math.floor((paycheckCents * r.percent) / 100),
  }));

  // Reconcile rounding into the last bucket so the sum equals paycheckCents.
  const allocated = buckets.reduce((s, b) => s + b.dollarAmountCents, 0);
  const drift = paycheckCents - allocated;
  if (drift !== 0 && buckets.length > 0) {
    buckets[buckets.length - 1]!.dollarAmountCents += drift;
  }
  return buckets;
}
