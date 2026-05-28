// Pure tax-classification helpers. No DB, no Claude, no network — every
// function here is a deterministic transform over TransactionRow[], so the
// deductible-detection and 1099-aggregation logic is trivially unit-testable.
//
// PRD §8.4 marks Tier-3 agents as RECOMMEND-ONLY. Nothing here files anything
// or moves money — it produces a running tax summary the user reviews. The
// summary is written to the agent_actions audit log by the agent; the actual
// filing handoff goes through TaxFilingPort and stays behind user approval.

import type { TransactionRow } from '@fa/db/types';

/** Sign convention: in `transactions`, debits (money out) are POSITIVE amounts
 *  and credits (money in / income) are NEGATIVE — same convention the Spending
 *  Coach analyzer relies on (it sums `amount > 0` as spend). We normalize here
 *  so callers never have to remember the sign. */
export function isOutflow(t: TransactionRow): boolean {
  return Number(t.amount) > 0;
}
export function isInflow(t: TransactionRow): boolean {
  return Number(t.amount) < 0;
}

/** Categories (matched against ai_category ?? category, lower-cased) that map
 *  to common Schedule-C / itemized deduction buckets. Conservative on purpose:
 *  we FLAG likely deductibles for the user to confirm, never auto-claim. */
export type DeductionBucket =
  | 'home_office'
  | 'software_subscriptions'
  | 'business_travel'
  | 'office_supplies'
  | 'professional_services'
  | 'education'
  | 'charitable'
  | 'health_insurance'
  | 'retirement_contribution';

const CATEGORY_TO_BUCKET: Array<{ match: RegExp; bucket: DeductionBucket }> = [
  { match: /home\s*office|utilities|internet|rent/, bucket: 'home_office' },
  { match: /software|saas|subscription|hosting|cloud/, bucket: 'software_subscriptions' },
  { match: /travel|airfare|airline|hotel|lodging|rideshare|taxi/, bucket: 'business_travel' },
  { match: /office\s*suppl|supplies|equipment|hardware/, bucket: 'office_supplies' },
  { match: /legal|accounting|consult|professional\s*serv/, bucket: 'professional_services' },
  { match: /education|course|training|tuition|book/, bucket: 'education' },
  { match: /charit|donation|nonprofit/, bucket: 'charitable' },
  { match: /health\s*insurance|medical\s*premium/, bucket: 'health_insurance' },
  { match: /401k|ira|retirement|sep/, bucket: 'retirement_contribution' },
];

export interface DeductibleFlag {
  transactionId: string;
  date: string;
  merchant: string | null;
  /** Always a positive dollar figure (the deductible amount). */
  amount: number;
  bucket: DeductionBucket;
  /** Which category string triggered the match (for audit transparency). */
  matchedCategory: string;
}

function categoryOf(t: TransactionRow): string | null {
  return t.ai_category ?? t.category ?? null;
}

function bucketFor(category: string): DeductionBucket | null {
  const c = category.toLowerCase();
  for (const { match, bucket } of CATEGORY_TO_BUCKET) {
    if (match.test(c)) return bucket;
  }
  return null;
}

/**
 * Flag transactions whose category looks like a likely business/itemized
 * deduction. Only outflows are considered (you can't deduct money you received).
 * Pending transactions are skipped — they aren't settled and could vanish.
 */
export function detectDeductibles(txns: TransactionRow[]): DeductibleFlag[] {
  const out: DeductibleFlag[] = [];
  for (const t of txns) {
    if (t.pending) continue;
    if (!isOutflow(t)) continue;
    const category = categoryOf(t);
    if (!category) continue;
    const bucket = bucketFor(category);
    if (!bucket) continue;
    out.push({
      transactionId: t.id,
      date: t.date,
      merchant: t.merchant,
      amount: round2(Math.abs(Number(t.amount))),
      bucket,
      matchedCategory: category,
    });
  }
  return out;
}

/** Total deductible dollars by bucket, sorted largest-first. */
export interface DeductionTotal {
  bucket: DeductionBucket;
  total: number;
  count: number;
}
export function totalDeductionsByBucket(flags: DeductibleFlag[]): DeductionTotal[] {
  const byBucket = new Map<DeductionBucket, { total: number; count: number }>();
  for (const f of flags) {
    const cur = byBucket.get(f.bucket) ?? { total: 0, count: 0 };
    cur.total += f.amount;
    cur.count += 1;
    byBucket.set(f.bucket, cur);
  }
  return [...byBucket.entries()]
    .map(([bucket, v]) => ({ bucket, total: round2(v.total), count: v.count }))
    .sort((a, b) => b.total - a.total);
}

// --- 1099 income aggregation -------------------------------------------------
//
// Self-employment income arrives as INFLOWS from platforms that issue (or whose
// payments aggregate toward) a 1099-NEC / 1099-K: Stripe, Patreon, YouTube/
// AdSense, Etsy, Upwork, Fiverr, etc. These are business-only rails, so every
// inflow from them is plausibly taxable income and we aggregate it directly.
//
// P2P apps (PayPal, Venmo, Cash App) are DIFFERENT: they carry huge volumes of
// non-taxable personal transfers (reimbursements, gifts, splitting rent). Summing
// every inflow from them as self-employment income would materially overstate
// taxable 1099 income — exactly the kind of bad tax guidance a recommend-only
// agent must avoid. So for P2P payers we only count an inflow as income when it
// is explicitly business-tagged (raw_description mentions "goods and services"/
// "business", or ai_category indicates income); all other P2P inflows are
// surfaced under a separate "needs review" list and EXCLUDED from total1099Income.

export interface PayerMatch {
  /** Canonical payer label we report under. */
  payer: string;
  match: RegExp;
  /**
   * True for peer-to-peer rails (PayPal/Venmo/Cash App) that mix personal
   * transfers with business payments. P2P inflows are only counted as income
   * when explicitly business-tagged; otherwise they're flagged needs-review.
   */
  p2p?: boolean;
}

export const DEFAULT_1099_PAYERS: PayerMatch[] = [
  { payer: 'Stripe', match: /stripe/i },
  { payer: 'Patreon', match: /patreon/i },
  { payer: 'YouTube', match: /youtube|google\s*adsense|adsense/i },
  { payer: 'Etsy', match: /etsy/i },
  { payer: 'Upwork', match: /upwork/i },
  { payer: 'Fiverr', match: /fiverr/i },
  // P2P rails — business inflows only; personal transfers go to needs-review.
  { payer: 'PayPal', match: /paypal/i, p2p: true },
  { payer: 'Venmo', match: /venmo/i, p2p: true },
  { payer: 'Cash App', match: /cash\s*app|cashapp|square\s*cash/i, p2p: true },
];

export interface PayerIncome {
  payer: string;
  /** Positive dollar total of inflows attributed to this payer. */
  total: number;
  count: number;
  /** True when total ≥ $600 — the common 1099-NEC reporting threshold. */
  crossesReportingThreshold: boolean;
  /**
   * True when this is an UNVERIFIED P2P total (personal-transfer-prone) that is
   * NOT counted in total1099Income. The user must confirm which portion is
   * business income. Never used to flag a fabricated reporting threshold.
   */
  needsReview: boolean;
}

/** The dollar floor at which most 1099-NEC reporting kicks in. */
export const REPORTING_THRESHOLD_USD = 600;

interface PayerHit {
  payer: string;
  p2p: boolean;
}

function payerFor(t: TransactionRow, payers: PayerMatch[]): PayerHit | null {
  const hay = `${t.merchant ?? ''} ${t.raw_description ?? ''}`;
  for (const p of payers) {
    if (p.match.test(hay)) return { payer: p.payer, p2p: !!p.p2p };
  }
  return null;
}

/**
 * Does a P2P inflow look like business income (vs a personal transfer)? We
 * require an explicit signal: PayPal/Venmo "goods and services" / "business" in
 * the raw description, or an ai_category that names income/self-employment.
 */
export function isBusinessTagged(t: TransactionRow): boolean {
  const desc = (t.raw_description ?? '').toLowerCase();
  if (/goods\s*(and|&)\s*services|business|invoice|merchant/.test(desc)) return true;
  const cat = (t.ai_category ?? t.category ?? '').toLowerCase();
  if (/income|self[-\s]*employ|1099|freelance|business/.test(cat)) return true;
  return false;
}

/**
 * Aggregate inflows by 1099-issuing payer. Only inflows count as income;
 * outflows (refunds out, fees paid) are ignored. Pending excluded.
 *
 * Business-only payers: every inflow is summed as income. P2P payers: only
 * business-tagged inflows are summed as income; non-business-tagged P2P inflows
 * are tracked under a needs-review total (needsReview:true) and are NOT income.
 */
export function aggregate1099Income(
  txns: TransactionRow[],
  payers: PayerMatch[] = DEFAULT_1099_PAYERS,
): PayerIncome[] {
  // Two buckets per payer: confirmed income, and (P2P only) needs-review.
  const income = new Map<string, { total: number; count: number }>();
  const review = new Map<string, { total: number; count: number }>();

  for (const t of txns) {
    if (t.pending) continue;
    if (!isInflow(t)) continue;
    const hit = payerFor(t, payers);
    if (!hit) continue;
    const amount = Math.abs(Number(t.amount));
    const bucket = hit.p2p && !isBusinessTagged(t) ? review : income;
    const cur = bucket.get(hit.payer) ?? { total: 0, count: 0 };
    cur.total += amount;
    cur.count += 1;
    bucket.set(hit.payer, cur);
  }

  const out: PayerIncome[] = [];
  for (const [payer, v] of income.entries()) {
    out.push({
      payer,
      total: round2(v.total),
      count: v.count,
      crossesReportingThreshold: v.total >= REPORTING_THRESHOLD_USD,
      needsReview: false,
    });
  }
  for (const [payer, v] of review.entries()) {
    out.push({
      payer,
      total: round2(v.total),
      count: v.count,
      // A needs-review (unconfirmed personal-transfer) total must NOT raise a
      // reporting-threshold flag — that would be a fabricated tax signal.
      crossesReportingThreshold: false,
      needsReview: true,
    });
  }
  // Confirmed income first (largest-first), then needs-review (largest-first).
  return out.sort((a, b) => {
    if (a.needsReview !== b.needsReview) return a.needsReview ? 1 : -1;
    return b.total - a.total;
  });
}

// --- Running tax summary -----------------------------------------------------

export interface TaxSummary {
  taxYear: number;
  /** Sum of CONFIRMED 1099 inflows across payers. Excludes needs-review P2P
   *  totals (those are unconfirmed personal-transfer-prone amounts). */
  total1099Income: number;
  /** Confirmed business income per payer (needsReview:false). */
  income1099: PayerIncome[];
  /** P2P inflow totals that need user confirmation before counting as income
   *  (needsReview:true). NOT included in total1099Income. */
  needsReview1099: PayerIncome[];
  /** Sum of all flagged deductible outflows. */
  totalDeductions: number;
  deductionsByBucket: DeductionTotal[];
  deductibleFlags: DeductibleFlag[];
  /** Quick read: income minus deductions. Recommendation context only — NOT
   *  a tax-liability calculation. */
  netSelfEmploymentEstimate: number;
}

/**
 * The tax year a user is most likely working on right now.
 *
 * During filing season (Jan 1 – Apr 15, the federal filing deadline) the user
 * is preparing the PRIOR completed year, which is where essentially all the
 * relevant transactions live — not the brand-new current year. Default to
 * year-1 through April, and to the current year from May onward (when people
 * start tracking the in-progress year). Callers may always override.
 *
 * @param now Defaults to the current instant; injectable for tests.
 */
export function defaultTaxYear(now: Date = new Date()): number {
  const year = now.getUTCFullYear();
  // getUTCMonth(): 0 = Jan … 3 = Apr. Through April -> prior year.
  return now.getUTCMonth() <= 3 ? year - 1 : year;
}

/** Filter to a single tax (calendar) year by the transaction `date` field. */
export function forTaxYear(txns: TransactionRow[], taxYear: number): TransactionRow[] {
  const prefix = `${taxYear}-`;
  return txns.filter((t) => typeof t.date === 'string' && t.date.startsWith(prefix));
}

/** Build the full running summary for a tax year from raw transactions. */
export function buildTaxSummary(
  txns: TransactionRow[],
  taxYear: number,
  payers: PayerMatch[] = DEFAULT_1099_PAYERS,
): TaxSummary {
  const scoped = forTaxYear(txns, taxYear);
  const flags = detectDeductibles(scoped);
  const deductionsByBucket = totalDeductionsByBucket(flags);
  const allPayerIncome = aggregate1099Income(scoped, payers);
  const income1099 = allPayerIncome.filter((p) => !p.needsReview);
  const needsReview1099 = allPayerIncome.filter((p) => p.needsReview);

  // Only CONFIRMED business income counts toward the 1099 total; needs-review
  // P2P totals are surfaced separately and never inflate taxable income.
  const total1099Income = round2(income1099.reduce((s, p) => s + p.total, 0));
  const totalDeductions = round2(flags.reduce((s, f) => s + f.amount, 0));

  return {
    taxYear,
    total1099Income,
    income1099,
    needsReview1099,
    totalDeductions,
    deductionsByBucket,
    deductibleFlags: flags,
    netSelfEmploymentEstimate: round2(total1099Income - totalDeductions),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
