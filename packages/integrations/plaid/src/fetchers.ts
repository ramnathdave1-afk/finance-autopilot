// Data fetchers used by Terminal 1's dashboard.
// All RLS-aware: callers pass an authenticated SupabaseClient (anon-key session)
// so user_id = auth.uid() is enforced. We do NOT use the service client here.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@fa/db/types';

type Client = SupabaseClient<Database>;

export interface NetWorth {
  assets: number;
  liabilities: number;
  net: number;
  asOf: string;
}

export async function getNetWorth(supabase: Client, userId: string): Promise<NetWorth> {
  const { data, error } = await supabase
    .from('connected_accounts')
    .select('account_type, current_balance')
    .eq('user_id', userId)
    .eq('status', 'active');
  if (error) throw new Error(error.message);

  let assets = 0;
  let liabilities = 0;
  for (const a of data ?? []) {
    const b = Number(a.current_balance ?? 0);
    if (a.account_type === 'credit' || a.account_type === 'loan') liabilities += Math.abs(b);
    else assets += b;
  }
  return { assets, liabilities, net: assets - liabilities, asOf: new Date().toISOString() };
}

export interface SpendingPoint {
  category: string;
  amount: number;
  count: number;
}

export async function getSpendingByCategory(
  supabase: Client,
  userId: string,
  days = 30,
): Promise<SpendingPoint[]> {
  const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('transactions')
    .select('amount, ai_category, category')
    .eq('user_id', userId)
    .gte('date', since)
    .gt('amount', 0); // outflows in Plaid are positive
  if (error) throw new Error(error.message);

  const buckets = new Map<string, SpendingPoint>();
  for (const t of data ?? []) {
    const key = t.ai_category ?? t.category ?? 'Uncategorized';
    const cur = buckets.get(key) ?? { category: key, amount: 0, count: 0 };
    cur.amount += Number(t.amount);
    cur.count += 1;
    buckets.set(key, cur);
  }
  return Array.from(buckets.values()).sort((a, b) => b.amount - a.amount);
}

export interface AccountBalance {
  id: string;
  institution: string;
  type: string;
  subtype: string | null;
  mask: string | null;
  current: number;
  available: number | null;
}

export async function getBalances(supabase: Client, userId: string): Promise<AccountBalance[]> {
  const { data, error } = await supabase
    .from('connected_accounts')
    .select('id, institution_name, account_type, account_subtype, mask, current_balance, available_balance')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('institution_name');
  if (error) throw new Error(error.message);
  return (data ?? []).map((a) => ({
    id: a.id,
    institution: a.institution_name,
    type: a.account_type,
    subtype: a.account_subtype,
    mask: a.mask,
    current: Number(a.current_balance ?? 0),
    available: a.available_balance === null ? null : Number(a.available_balance),
  }));
}

export async function getRecentTransactions(
  supabase: Client,
  userId: string,
  limit = 50,
) {
  const { data, error } = await supabase
    .from('transactions')
    .select('id, date, amount, merchant, ai_category, category, pending')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}
