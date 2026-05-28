import { describe, it, expect } from 'vitest';
import type { TransactionRow } from '@fa/db/types';
import {
  detectDeductibles,
  totalDeductionsByBucket,
  aggregate1099Income,
  buildTaxSummary,
  forTaxYear,
  defaultTaxYear,
  REPORTING_THRESHOLD_USD,
} from '../src/classify';

// Minimal TransactionRow factory. Sign convention: outflow (spend) positive,
// inflow (income) negative — matches the Spending Coach analyzer.
let seq = 0;
function txn(over: Partial<TransactionRow> = {}): TransactionRow {
  seq += 1;
  return {
    id: `t-${seq}`,
    user_id: 'user-1',
    account_id: 'acct-1',
    provider: 'plaid',
    provider_transaction_id: `ptx-${seq}`,
    amount: 0,
    iso_currency_code: 'USD',
    merchant: null,
    raw_description: null,
    category: null,
    ai_category: null,
    ai_category_confidence: null,
    ai_categorized_at: null,
    date: '2025-06-01',
    pending: false,
    is_subscription: false,
    subscription_id: null,
    created_at: '2025-06-01T00:00:00Z',
    ...over,
  };
}

describe('detectDeductibles', () => {
  it('flags outflows whose category maps to a deduction bucket', () => {
    const txns = [
      txn({ amount: 30, ai_category: 'Software & SaaS', merchant: 'Figma' }),
      txn({ amount: 250, ai_category: 'Business Travel', merchant: 'Delta' }),
      txn({ amount: 12, ai_category: 'Groceries', merchant: 'Safeway' }), // not deductible
    ];
    const flags = detectDeductibles(txns);
    expect(flags.map((f) => f.bucket).sort()).toEqual(['business_travel', 'software_subscriptions']);
    expect(flags.every((f) => f.amount > 0)).toBe(true);
  });

  it('falls back to `category` when ai_category is absent', () => {
    const flags = detectDeductibles([txn({ amount: 99, category: 'Legal & Professional' })]);
    expect(flags).toHaveLength(1);
    expect(flags[0]!.bucket).toBe('professional_services');
    expect(flags[0]!.matchedCategory).toBe('Legal & Professional');
  });

  it('ignores inflows (you cannot deduct money received) and pending txns', () => {
    const txns = [
      txn({ amount: -500, ai_category: 'Software & SaaS' }), // inflow
      txn({ amount: 40, ai_category: 'Software & SaaS', pending: true }), // pending
    ];
    expect(detectDeductibles(txns)).toHaveLength(0);
  });

  it('skips uncategorized transactions', () => {
    expect(detectDeductibles([txn({ amount: 75 })])).toHaveLength(0);
  });
});

describe('totalDeductionsByBucket', () => {
  it('sums by bucket and sorts largest-first', () => {
    const flags = detectDeductibles([
      txn({ amount: 30, ai_category: 'Software' }),
      txn({ amount: 20, ai_category: 'Software' }),
      txn({ amount: 250, ai_category: 'Airfare' }),
    ]);
    const totals = totalDeductionsByBucket(flags);
    expect(totals[0]).toEqual({ bucket: 'business_travel', total: 250, count: 1 });
    expect(totals[1]).toEqual({ bucket: 'software_subscriptions', total: 50, count: 2 });
  });
});

describe('aggregate1099Income', () => {
  it('aggregates inflows per 1099 payer and flags the reporting threshold', () => {
    const txns = [
      txn({ amount: -400, merchant: 'STRIPE PAYOUT' }),
      txn({ amount: -300, merchant: 'Stripe transfer' }),
      txn({ amount: -50, raw_description: 'PATREON* CREATOR' }),
    ];
    const income = aggregate1099Income(txns);
    const stripe = income.find((p) => p.payer === 'Stripe')!;
    expect(stripe.total).toBe(700);
    expect(stripe.count).toBe(2);
    expect(stripe.crossesReportingThreshold).toBe(true); // 700 >= 600

    const patreon = income.find((p) => p.payer === 'Patreon')!;
    expect(patreon.total).toBe(50);
    expect(patreon.crossesReportingThreshold).toBe(false);
  });

  it('threshold is inclusive at exactly $600 for a business-only payer', () => {
    const income = aggregate1099Income([txn({ amount: -REPORTING_THRESHOLD_USD, merchant: 'Stripe' })]);
    expect(income[0]!.crossesReportingThreshold).toBe(true);
  });

  it('does NOT count an untagged personal Venmo inflow as 1099 income', () => {
    // A plain Venmo inflow (e.g. a friend repaying you) must not be summed as
    // self-employment income; it goes to needs-review instead.
    const income = aggregate1099Income([txn({ amount: -750, merchant: 'Venmo' })]);
    const venmo = income.find((p) => p.payer === 'Venmo')!;
    expect(venmo.needsReview).toBe(true);
    expect(venmo.crossesReportingThreshold).toBe(false);
    // And it must be excluded from the confirmed total.
    const summary = buildTaxSummary([txn({ amount: -750, merchant: 'Venmo', date: '2025-06-01' })], 2025);
    expect(summary.total1099Income).toBe(0);
    expect(summary.needsReview1099).toHaveLength(1);
    expect(summary.income1099).toHaveLength(0);
  });

  it('counts a business-tagged P2P inflow (goods and services) as income', () => {
    const income = aggregate1099Income([
      txn({ amount: -800, merchant: 'PayPal', raw_description: 'PAYPAL Goods and Services payment' }),
    ]);
    const paypal = income.find((p) => p.payer === 'PayPal')!;
    expect(paypal.needsReview).toBe(false);
    expect(paypal.total).toBe(800);
    expect(paypal.crossesReportingThreshold).toBe(true);
  });

  it('splits P2P inflows: business-tagged counts as income, personal goes to needs-review', () => {
    const income = aggregate1099Income([
      txn({ amount: -800, merchant: 'PayPal', raw_description: 'goods and services' }),
      txn({ amount: -200, merchant: 'PayPal', raw_description: 'lunch split' }),
    ]);
    const confirmed = income.filter((p) => !p.needsReview);
    const review = income.filter((p) => p.needsReview);
    expect(confirmed).toHaveLength(1);
    expect(confirmed[0]!.total).toBe(800);
    expect(review).toHaveLength(1);
    expect(review[0]!.total).toBe(200);
  });

  it('edge: no income at all returns an empty list', () => {
    const txns = [
      txn({ amount: 30, ai_category: 'Software', merchant: 'Figma' }), // outflow only
      txn({ amount: 12, ai_category: 'Groceries' }),
    ];
    expect(aggregate1099Income(txns)).toEqual([]);
  });

  it('ignores outflows to a 1099 payer (refunds/fees are not income)', () => {
    // A positive (outflow) amount to Stripe must NOT count as income.
    expect(aggregate1099Income([txn({ amount: 25, merchant: 'Stripe fee' })])).toEqual([]);
  });

  it('ignores inflows from unknown payers', () => {
    expect(aggregate1099Income([txn({ amount: -1000, merchant: 'Random LLC' })])).toEqual([]);
  });
});

describe('defaultTaxYear', () => {
  it('returns the prior year during filing season (Jan–Apr)', () => {
    expect(defaultTaxYear(new Date('2026-01-15T00:00:00Z'))).toBe(2025);
    expect(defaultTaxYear(new Date('2026-03-31T00:00:00Z'))).toBe(2025);
    expect(defaultTaxYear(new Date('2026-04-30T00:00:00Z'))).toBe(2025);
  });

  it('returns the current year from May onward', () => {
    expect(defaultTaxYear(new Date('2026-05-01T00:00:00Z'))).toBe(2026);
    expect(defaultTaxYear(new Date('2026-12-31T00:00:00Z'))).toBe(2026);
  });
});

describe('forTaxYear', () => {
  it('filters transactions to the given calendar year by date', () => {
    const txns = [
      txn({ date: '2024-12-31' }),
      txn({ date: '2025-01-01' }),
      txn({ date: '2025-12-31' }),
      txn({ date: '2026-01-01' }),
    ];
    expect(forTaxYear(txns, 2025)).toHaveLength(2);
  });
});

describe('buildTaxSummary', () => {
  it('produces a running summary over mixed income + deductions for the year', () => {
    const txns = [
      // income
      txn({ amount: -1000, merchant: 'Stripe', date: '2025-03-01' }),
      txn({ amount: -700, merchant: 'YouTube AdSense', date: '2025-04-01' }),
      // deductions
      txn({ amount: 120, ai_category: 'Software', date: '2025-02-01' }),
      txn({ amount: 80, ai_category: 'Office Supplies', date: '2025-05-01' }),
      // noise / other year
      txn({ amount: 50, ai_category: 'Groceries', date: '2025-06-01' }),
      txn({ amount: -9999, merchant: 'Stripe', date: '2024-06-01' }), // prior year, excluded
    ];
    const summary = buildTaxSummary(txns, 2025);

    expect(summary.taxYear).toBe(2025);
    expect(summary.total1099Income).toBe(1700);
    expect(summary.income1099.map((p) => p.payer).sort()).toEqual(['Stripe', 'YouTube']);
    expect(summary.totalDeductions).toBe(200);
    expect(summary.deductionsByBucket).toHaveLength(2);
    expect(summary.deductibleFlags).toHaveLength(2);
    expect(summary.netSelfEmploymentEstimate).toBe(1500); // 1700 - 200
  });

  it('edge: a year with no transactions yields a zeroed summary', () => {
    const summary = buildTaxSummary([], 2025);
    expect(summary.total1099Income).toBe(0);
    expect(summary.totalDeductions).toBe(0);
    expect(summary.income1099).toEqual([]);
    expect(summary.needsReview1099).toEqual([]);
    expect(summary.deductibleFlags).toEqual([]);
    expect(summary.netSelfEmploymentEstimate).toBe(0);
  });
});
