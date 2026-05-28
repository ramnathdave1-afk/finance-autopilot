// Spending-trend helpers used by T3's Spending Coach agent.
// All RLS-aware: pass in an authenticated SupabaseClient.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@fa/db/types';

type Client = SupabaseClient<Database>;

export interface CategoryDelta {
  category: string;
  currentAmount: number;
  priorAmount: number;
  deltaAmount: number;
  deltaPct: number; // (current - prior) / prior, or +Inf if prior=0
}

/**
 * Last-30 vs prior-30 spending delta per category. The Spending Coach prompts
 * Claude with the top-N deltas to produce action insights.
 */
export async function spendingDelta(
  supabase: Client,
  userId: string,
  windowDays = 30,
): Promise<CategoryDelta[]> {
  const now = Date.now();
  const dayMs = 86400_000;
  const curSince = new Date(now - windowDays * dayMs).toISOString().slice(0, 10);
  const priorSince = new Date(now - 2 * windowDays * dayMs).toISOString().slice(0, 10);
  const priorUntil = curSince;

  const cur = await fetchByCategory(supabase, userId, curSince);
  const prior = await fetchByCategoryRange(supabase, userId, priorSince, priorUntil);

  const all = new Set<string>([...cur.keys(), ...prior.keys()]);
  const rows: CategoryDelta[] = [];
  for (const cat of all) {
    const c = cur.get(cat) ?? 0;
    const p = prior.get(cat) ?? 0;
    const delta = c - p;
    const pct = p === 0 ? (c === 0 ? 0 : Number.POSITIVE_INFINITY) : delta / p;
    rows.push({ category: cat, currentAmount: c, priorAmount: p, deltaAmount: delta, deltaPct: pct });
  }
  return rows.sort((a, b) => Math.abs(b.deltaAmount) - Math.abs(a.deltaAmount));
}

async function fetchByCategory(supabase: Client, userId: string, since: string): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from('transactions')
    .select('amount, ai_category, category')
    .eq('user_id', userId)
    .gte('date', since)
    .gt('amount', 0);
  if (error) throw new Error(error.message);
  return tally(data ?? []);
}

async function fetchByCategoryRange(
  supabase: Client,
  userId: string,
  since: string,
  until: string,
): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from('transactions')
    .select('amount, ai_category, category')
    .eq('user_id', userId)
    .gte('date', since)
    .lt('date', until)
    .gt('amount', 0);
  if (error) throw new Error(error.message);
  return tally(data ?? []);
}

function tally(rows: Array<{ amount: number; ai_category: string | null; category: string | null }>): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = r.ai_category ?? r.category ?? 'Uncategorized';
    m.set(k, (m.get(k) ?? 0) + Number(r.amount));
  }
  return m;
}

/** Total inflows / outflows over a window. */
export async function cashflow(
  supabase: Client,
  userId: string,
  windowDays = 30,
): Promise<{ inflow: number; outflow: number; net: number }> {
  const since = new Date(Date.now() - windowDays * 86400_000).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('transactions')
    .select('amount')
    .eq('user_id', userId)
    .gte('date', since);
  if (error) throw new Error(error.message);
  let inflow = 0;
  let outflow = 0;
  for (const t of data ?? []) {
    const a = Number(t.amount);
    if (a < 0) inflow += -a;
    else outflow += a;
  }
  return { inflow, outflow, net: inflow - outflow };
}
