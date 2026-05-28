// Streaks computation — PRD §8.5 gamification.
//
// Three counters derived purely from transactions + rules:
//
//   savings_days       — consecutive days the user had net positive cashflow
//                        (inflows ≥ outflows in that day's transactions).
//   no_uber_eats_days  — consecutive days with zero Food Delivery charges.
//   under_cap_days     — consecutive days where total outflow stayed under
//                        the user's spending-cap rule (if any cap rule
//                        exists in `rules`). Returns 0 if no cap rule set.
//
// "Streak day" = a calendar date in user's local TZ. We approximate TZ via
// users.briefing_time_local's host date, which is good enough for v1; we'll
// add tzdb support when launches outside US/Eastern come up.

import { createServiceClient } from './client';

export interface Streaks {
  savings_days: number;
  no_uber_eats_days: number;
  under_cap_days: number;
  /** Cap value the under_cap_days streak is measured against (null if no rule). */
  daily_cap: number | null;
}

const FOOD_DELIVERY_CATEGORIES = new Set(['Food Delivery']);

export async function getStreaks(userId: string, maxLookbackDays = 60): Promise<Streaks> {
  const supabase = createServiceClient();

  // Pull recent transactions in date-desc order.
  const since = new Date(Date.now() - maxLookbackDays * 86400_000).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('transactions')
    .select('amount, date, ai_category, category')
    .eq('user_id', userId)
    .gte('date', since)
    .order('date', { ascending: false });
  if (error) throw new Error(error.message);

  type Tx = { amount: number; date: string; ai_category: string | null; category: string | null };
  const txns = (data ?? []) as Tx[];

  // Pull user's spending-cap rule, if any. We treat any rule with
  // trigger.kind === 'daily_outflow_cap' as the cap source.
  const { data: rules } = await supabase
    .from('rules')
    .select('trigger, enabled')
    .eq('user_id', userId)
    .eq('enabled', true);
  let dailyCap: number | null = null;
  for (const r of rules ?? []) {
    const t = r.trigger as { kind?: string; cap?: number } | null;
    if (t?.kind === 'daily_outflow_cap' && typeof t.cap === 'number') {
      dailyCap = t.cap;
      break;
    }
  }

  // Bucket txns by date.
  type DayAgg = { inflow: number; outflow: number; foodDelivery: number };
  const byDay = new Map<string, DayAgg>();
  for (const t of txns) {
    const cur = byDay.get(t.date) ?? { inflow: 0, outflow: 0, foodDelivery: 0 };
    const amt = Number(t.amount);
    if (amt > 0) cur.outflow += amt;
    else cur.inflow += -amt;
    const cat = t.ai_category ?? t.category ?? '';
    if (amt > 0 && FOOD_DELIVERY_CATEGORIES.has(cat)) cur.foodDelivery += amt;
    byDay.set(t.date, cur);
  }

  // Walk back from yesterday — today is incomplete, so we don't count it.
  const yesterday = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);

  return {
    savings_days: walkStreak(yesterday, maxLookbackDays, (d) => {
      const agg = byDay.get(d);
      if (!agg) return false; // no activity → streak breaks (conservative)
      return agg.inflow >= agg.outflow;
    }),
    no_uber_eats_days: walkStreak(yesterday, maxLookbackDays, (d) => {
      const agg = byDay.get(d);
      if (!agg) return true; // no activity = no food delivery
      return agg.foodDelivery === 0;
    }),
    under_cap_days:
      dailyCap === null
        ? 0
        : walkStreak(yesterday, maxLookbackDays, (d) => {
            const agg = byDay.get(d);
            if (!agg) return true; // no activity = under cap
            return agg.outflow <= (dailyCap as number);
          }),
    daily_cap: dailyCap,
  };
}

function walkStreak(startISO: string, maxDays: number, qualifies: (dateISO: string) => boolean): number {
  let n = 0;
  const start = new Date(startISO);
  for (let i = 0; i < maxDays; i += 1) {
    const d = new Date(start.getTime() - i * 86400_000).toISOString().slice(0, 10);
    if (qualifies(d)) n += 1;
    else break;
  }
  return n;
}
