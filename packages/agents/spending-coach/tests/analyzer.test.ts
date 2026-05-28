import { describe, it, expect } from 'vitest';
import { categoryTotals, monthOverMonthDeltas } from '../src/analyzer';
import type { TransactionRow } from '@fa/db/types';

function tx(partial: Partial<TransactionRow>): TransactionRow {
  return {
    id: 't',
    user_id: 'u',
    account_id: 'a',
    provider: 'plaid',
    provider_transaction_id: 'p',
    amount: 10,
    iso_currency_code: 'USD',
    merchant: null,
    raw_description: null,
    category: null,
    ai_category: null,
    ai_category_confidence: null,
    ai_categorized_at: null,
    date: '2026-05-15',
    pending: false,
    is_subscription: false,
    subscription_id: null,
    created_at: '2026-05-15T00:00:00Z',
    ...partial,
  };
}

describe('categoryTotals', () => {
  it('sums by ai_category, falls back to category, then uncategorized', () => {
    const totals = categoryTotals([
      tx({ amount: 10, ai_category: 'dining' }),
      tx({ amount: 5, ai_category: 'dining' }),
      tx({ amount: 8, category: 'transport' }),
      tx({ amount: 2 }),
      tx({ amount: -50, ai_category: 'income' }), // negative = ignored (credit)
    ]);
    expect(totals.get('dining')).toBe(15);
    expect(totals.get('transport')).toBe(8);
    expect(totals.get('uncategorized')).toBe(2);
    expect(totals.get('income')).toBeUndefined();
  });
});

describe('monthOverMonthDeltas', () => {
  const now = new Date('2026-05-28T00:00:00Z');

  it('splits txns into current vs prior 30-day windows and ranks by abs delta', () => {
    const deltas = monthOverMonthDeltas(
      [
        // Current window (last 30d)
        tx({ amount: 100, ai_category: 'dining', date: '2026-05-15' }),
        tx({ amount: 50, ai_category: 'dining', date: '2026-05-20' }),
        tx({ amount: 20, ai_category: 'gas', date: '2026-05-10' }),
        // Prior window (30-60d before now)
        tx({ amount: 30, ai_category: 'dining', date: '2026-04-15' }),
        tx({ amount: 60, ai_category: 'gas', date: '2026-04-05' }),
      ],
      now,
    );

    const dining = deltas.find((d) => d.category === 'dining')!;
    expect(dining.current).toBe(150);
    expect(dining.prior).toBe(30);
    expect(dining.dollarDelta).toBe(120);
    expect(dining.pctChange).toBe(400);

    const gas = deltas.find((d) => d.category === 'gas')!;
    expect(gas.dollarDelta).toBe(-40);

    // Largest abs delta first.
    expect(deltas[0]!.category).toBe('dining');
  });

  it('handles zero-prior categories with pctChange null', () => {
    const deltas = monthOverMonthDeltas(
      [tx({ amount: 75, ai_category: 'new_thing', date: '2026-05-15' })],
      now,
    );
    expect(deltas[0]!.pctChange).toBeNull();
    expect(deltas[0]!.current).toBe(75);
    expect(deltas[0]!.prior).toBe(0);
  });
});
