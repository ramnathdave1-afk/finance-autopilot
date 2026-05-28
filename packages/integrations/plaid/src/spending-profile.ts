// Spending profile builder — used by T4's Credit Card Optimizer Agent
// (PRD §8.3 Agent 9) to recommend the optimal card mix for the user.
//
// Produces a stable shape: { categorySpend: Record<canonical_category, $/yr>,
// total, months_observed }. The optimizer then joins against the `cards`
// catalog and picks the cards that maximize rewards on the user's spend.

import { createServiceClient } from '@fa/db';

export interface SpendingProfile {
  userId: string;
  totalAnnualized: number;
  monthsObserved: number;
  categorySpend: Record<string, number>;     // annualized $ per category
  topCategories: Array<{ category: string; annualSpend: number; share: number }>;
}

/**
 * Build a spending profile from the last `windowMonths` of transactions,
 * annualized. We use ai_category if present, falling back to category.
 */
export async function buildSpendingProfile(
  userId: string,
  windowMonths = 6,
): Promise<SpendingProfile> {
  const supabase = createServiceClient();
  const since = new Date(Date.now() - windowMonths * 30 * 86400_000).toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('transactions')
    .select('amount, ai_category, category, date')
    .eq('user_id', userId)
    .gte('date', since)
    .gt('amount', 0); // outflows
  if (error) throw new Error(error.message);

  const txns = (data ?? []) as Array<{ amount: number; ai_category: string | null; category: string | null; date: string }>;

  if (txns.length === 0) {
    return {
      userId,
      totalAnnualized: 0,
      monthsObserved: 0,
      categorySpend: {},
      topCategories: [],
    };
  }

  // Compute actual observed window from earliest txn → today.
  const earliest = txns.reduce((acc, t) => (t.date < acc ? t.date : acc), txns[0].date);
  const observedMonths = Math.max(
    1,
    monthsBetween(new Date(earliest), new Date()),
  );

  const monthlyByCat = new Map<string, number>();
  let totalMonthly = 0;
  for (const t of txns) {
    const k = t.ai_category ?? t.category ?? 'Uncategorized';
    const v = Number(t.amount);
    monthlyByCat.set(k, (monthlyByCat.get(k) ?? 0) + v);
    totalMonthly += v;
  }

  const annualized: Record<string, number> = {};
  for (const [k, v] of monthlyByCat) {
    annualized[k] = Number(((v / observedMonths) * 12).toFixed(2));
  }
  const totalAnnualized = Number(((totalMonthly / observedMonths) * 12).toFixed(2));

  const topCategories = Object.entries(annualized)
    .map(([category, annualSpend]) => ({
      category,
      annualSpend,
      share: totalAnnualized === 0 ? 0 : annualSpend / totalAnnualized,
    }))
    .sort((a, b) => b.annualSpend - a.annualSpend)
    .slice(0, 8);

  return {
    userId,
    totalAnnualized,
    monthsObserved: observedMonths,
    categorySpend: annualized,
    topCategories,
  };
}

function monthsBetween(a: Date, b: Date): number {
  const years = b.getUTCFullYear() - a.getUTCFullYear();
  const months = b.getUTCMonth() - a.getUTCMonth();
  return Math.max(1, years * 12 + months + (b.getUTCDate() >= a.getUTCDate() ? 0 : -1));
}
