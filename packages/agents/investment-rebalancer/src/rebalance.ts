// Pure portfolio math for the Investment Rebalancer (PRD §8.4 Agent 14).
//
// Everything here is deterministic and side-effect-free so it can be unit
// tested in isolation. The agent layer (agent.ts) handles I/O — reading
// holdings, the audit log, notifications. Nothing in this file moves money,
// places a trade, or reaches the network.
//
// Three responsibilities:
//   1. classifyAllocation  — collapse raw holdings into asset-class weights.
//   2. computeDrift         — compare current weights vs a target allocation.
//   3. suggestRebalance     — emit RECOMMENDED buy/sell deltas to close drift.
//   4. findHarvestCandidates— flag tax-loss-harvesting opportunities in taxable
//                             accounts (holdings currently below cost basis).

/** One position the agent reasons about. A reduced view of InvestmentHoldingRow. */
export interface Position {
  /** Stable id (the holding row id) — echoed back in suggestions/candidates. */
  holdingId: string;
  /** Account this position sits in — needed for taxable-only harvest logic. */
  accountId: string;
  ticker: string | null;
  name: string | null;
  /** Asset class bucket. Falls back to 'other' when the source omits it. */
  assetClass: string;
  /** Current market value in dollars (>= 0). */
  currentValue: number;
  /** Total cost basis in dollars, if known. Needed for harvest detection. */
  costBasis: number | null;
  /** Whether this position's account is a taxable (non-retirement) account. */
  taxable: boolean;
}

/** User's desired allocation. Maps asset class -> target weight (0..1). */
export type TargetAllocation = Record<string, number>;

export interface AssetClassWeight {
  assetClass: string;
  value: number;
  /** Fraction of the whole portfolio, 0..1. */
  weight: number;
}

export interface DriftEntry {
  assetClass: string;
  currentWeight: number;
  targetWeight: number;
  /** currentWeight - targetWeight. Positive = overweight, negative = underweight. */
  driftFraction: number;
  /** Dollar amount to move to hit target: positive = sell, negative = buy. */
  driftValue: number;
}

export interface DriftReport {
  totalValue: number;
  weights: AssetClassWeight[];
  drift: DriftEntry[];
  /** Largest absolute drift fraction across classes (0 when balanced/empty). */
  maxAbsDrift: number;
}

export interface RebalanceTrade {
  assetClass: string;
  /** 'sell' trims an overweight class; 'buy' tops up an underweight one. */
  side: 'buy' | 'sell';
  /** Dollar amount of the recommended trade (always positive). */
  amount: number;
}

export interface HarvestCandidate {
  holdingId: string;
  accountId: string;
  ticker: string | null;
  name: string | null;
  costBasis: number;
  currentValue: number;
  /** Positive dollar amount of the unrealized loss (costBasis - currentValue). */
  unrealizedLoss: number;
}

const EPSILON = 1e-9;

/**
 * Collapse positions into per-asset-class weights. Empty portfolio -> [] with
 * totalValue 0 (no division by zero).
 */
export function classifyAllocation(positions: Position[]): {
  totalValue: number;
  weights: AssetClassWeight[];
} {
  const byClass = new Map<string, number>();
  let totalValue = 0;
  for (const p of positions) {
    const v = p.currentValue;
    if (!Number.isFinite(v) || v <= 0) continue;
    totalValue += v;
    byClass.set(p.assetClass, (byClass.get(p.assetClass) ?? 0) + v);
  }

  const weights: AssetClassWeight[] = [...byClass.entries()]
    .map(([assetClass, value]) => ({
      assetClass,
      value,
      weight: totalValue > 0 ? value / totalValue : 0,
    }))
    .sort((a, b) => b.value - a.value);

  return { totalValue, weights };
}

/**
 * Compare the portfolio's current allocation against the user's target.
 * The union of asset classes (held + targeted) is considered, so an entirely
 * missing-but-targeted class shows up as fully underweight, and an unexpected
 * held class shows up as fully overweight.
 *
 * Throws if the target weights don't sum to ~1 — a malformed target is a
 * programming/config error, never silently normalized.
 */
export function computeDrift(
  positions: Position[],
  target: TargetAllocation,
): DriftReport {
  const targetSum = Object.values(target).reduce((s, w) => s + w, 0);
  // Empty target is only valid for an empty portfolio (nothing to rebalance to).
  if (Object.keys(target).length > 0 && Math.abs(targetSum - 1) > 1e-6) {
    throw new Error(
      `target allocation weights must sum to 1, got ${targetSum.toFixed(6)}`,
    );
  }

  const { totalValue, weights } = classifyAllocation(positions);
  const currentByClass = new Map(weights.map((w) => [w.assetClass, w.weight]));

  const classes = new Set<string>([
    ...currentByClass.keys(),
    ...Object.keys(target),
  ]);

  const drift: DriftEntry[] = [...classes]
    .map((assetClass) => {
      const currentWeight = currentByClass.get(assetClass) ?? 0;
      const targetWeight = target[assetClass] ?? 0;
      const driftFraction = currentWeight - targetWeight;
      return {
        assetClass,
        currentWeight,
        targetWeight,
        driftFraction,
        driftValue: driftFraction * totalValue,
      };
    })
    .sort((a, b) => Math.abs(b.driftFraction) - Math.abs(a.driftFraction));

  const maxAbsDrift = drift.reduce(
    (m, d) => Math.max(m, Math.abs(d.driftFraction)),
    0,
  );

  return { totalValue, weights, drift, maxAbsDrift };
}

/**
 * Turn a drift report into RECOMMENDED trades. Only classes whose absolute
 * drift exceeds `thresholdFraction` (a tolerance band, e.g. 0.05 = 5%) get a
 * trade — small drift is noise and churns fees/taxes for nothing.
 *
 * RECOMMENDATION ONLY. The returned trades are never executed by this system;
 * they are surfaced to the user, who acts (or not) at their brokerage.
 */
export function suggestRebalance(
  report: DriftReport,
  thresholdFraction = 0.05,
): RebalanceTrade[] {
  if (thresholdFraction < 0) {
    throw new Error('thresholdFraction must be non-negative');
  }
  const trades: RebalanceTrade[] = [];
  for (const d of report.drift) {
    if (Math.abs(d.driftFraction) < thresholdFraction - EPSILON) continue;
    if (Math.abs(d.driftValue) < EPSILON) continue;
    trades.push({
      assetClass: d.assetClass,
      side: d.driftValue > 0 ? 'sell' : 'buy',
      amount: Math.abs(d.driftValue),
    });
  }
  // Largest trades first — most impactful for the user to act on.
  return trades.sort((a, b) => b.amount - a.amount);
}

/**
 * Flag tax-loss-harvesting opportunities: positions in TAXABLE accounts whose
 * current value sits below cost basis by at least `minLoss` dollars. Harvesting
 * in a tax-advantaged account does nothing, so those are excluded by design.
 *
 * RECOMMENDATION ONLY — we surface candidates; we never sell.
 */
export function findHarvestCandidates(
  positions: Position[],
  minLoss = 0,
): HarvestCandidate[] {
  if (minLoss < 0) throw new Error('minLoss must be non-negative');
  const candidates: HarvestCandidate[] = [];
  for (const p of positions) {
    if (!p.taxable) continue;
    if (p.costBasis === null) continue;
    if (!Number.isFinite(p.costBasis) || !Number.isFinite(p.currentValue)) continue;
    const unrealizedLoss = p.costBasis - p.currentValue;
    if (unrealizedLoss < minLoss + EPSILON) continue;
    candidates.push({
      holdingId: p.holdingId,
      accountId: p.accountId,
      ticker: p.ticker,
      name: p.name,
      costBasis: p.costBasis,
      currentValue: p.currentValue,
      unrealizedLoss,
    });
  }
  // Biggest harvestable loss first.
  return candidates.sort((a, b) => b.unrealizedLoss - a.unrealizedLoss);
}
