// Net-worth snapshot writer (PRD §8.5 "net worth tracker with weekly milestones",
// §6.6 Premium Net Worth Strategy agent). Nightly cron calls writeNetWorthSnapshot
// for every active user. T1's net-worth view reads the latest snapshot for the
// header strip and historical chart.

import { createServiceClient } from './client';
import type { NetWorthSnapshotRow } from '../types';

export interface SnapshotBreakdown {
  cash: number;
  investments: number;
  credit_debt: number;
  loans: number;
  other_assets: number;
  other_liabilities: number;
}

export interface SnapshotResult extends SnapshotBreakdown {
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  snapshotDate: string;
}

/**
 * Compute today's snapshot for `userId` from connected_accounts +
 * investment_holdings + loans, and upsert it into net_worth_snapshots.
 * Idempotent on (user_id, snapshot_date).
 */
export async function writeNetWorthSnapshot(userId: string): Promise<SnapshotResult> {
  const supabase = createServiceClient();
  const today = new Date().toISOString().slice(0, 10);

  // 1) Cash + credit accounts.
  const { data: accts, error: accErr } = await supabase
    .from('connected_accounts')
    .select('account_type, current_balance')
    .eq('user_id', userId)
    .eq('status', 'active');
  if (accErr) throw new Error(accErr.message);

  let cash = 0;
  let creditDebt = 0;
  let otherAssets = 0;
  let otherLiabilities = 0;

  for (const a of accts ?? []) {
    const bal = Number(a.current_balance ?? 0);
    switch (a.account_type) {
      case 'depository':
        cash += bal;
        break;
      case 'credit':
        creditDebt += Math.abs(bal);
        break;
      case 'loan':
        otherLiabilities += Math.abs(bal);
        break;
      case 'investment':
      case 'brokerage':
        // counted via investment_holdings below; if no holdings exist yet,
        // fall back to the cash balance reported on the brokerage account.
        otherAssets += bal;
        break;
      default:
        if (bal >= 0) otherAssets += bal;
        else otherLiabilities += Math.abs(bal);
    }
  }

  // 2) Latest-day investment holdings.
  const { data: holdings } = await supabase
    .from('investment_holdings')
    .select('current_value, as_of')
    .eq('user_id', userId)
    .order('as_of', { ascending: false })
    .limit(500);
  let investments = 0;
  const firstHolding = holdings?.[0] as { as_of: string } | undefined;
  if (firstHolding) {
    const latest = firstHolding.as_of;
    investments = (holdings ?? [])
      .filter((h: { as_of: string }) => h.as_of === latest)
      .reduce((s: number, h: { current_value: number | null }) => s + Number(h.current_value ?? 0), 0);
    if (investments > 0) otherAssets = Math.max(0, otherAssets - investments);
  }

  // 3) Explicit loans (mortgage/student/auto/etc) tracked by Refinance Watcher.
  const { data: loans } = await supabase
    .from('loans')
    .select('current_balance, principal')
    .eq('user_id', userId);
  let loanDebt = 0;
  for (const l of loans ?? []) {
    loanDebt += Number(l.current_balance ?? l.principal ?? 0);
  }

  const totalAssets = round2(cash + investments + otherAssets);
  const totalLiabilities = round2(creditDebt + loanDebt + otherLiabilities);
  const netWorth = round2(totalAssets - totalLiabilities);

  const breakdown: SnapshotBreakdown = {
    cash: round2(cash),
    investments: round2(investments),
    credit_debt: round2(creditDebt),
    loans: round2(loanDebt),
    other_assets: round2(otherAssets),
    other_liabilities: round2(otherLiabilities),
  };

  const { error: upErr } = await supabase
    .from('net_worth_snapshots')
    .upsert(
      {
        user_id: userId,
        snapshot_date: today,
        total_assets: totalAssets,
        total_liabilities: totalLiabilities,
        net_worth: netWorth,
        breakdown,
      },
      { onConflict: 'user_id,snapshot_date' },
    );
  if (upErr) throw new Error(`net_worth_snapshot upsert failed: ${upErr.message}`);

  return {
    snapshotDate: today,
    totalAssets,
    totalLiabilities,
    netWorth,
    ...breakdown,
  };
}

/** Get the most recent snapshot for a user (may be null if first run). */
export async function getLatestSnapshot(userId: string): Promise<NetWorthSnapshotRow | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('net_worth_snapshots')
    .select('*')
    .eq('user_id', userId)
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as NetWorthSnapshotRow | null;
}

/** History within the last `days` days. T1's net-worth chart consumes this. */
export async function getSnapshotHistory(userId: string, days = 90): Promise<NetWorthSnapshotRow[]> {
  const supabase = createServiceClient();
  const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('net_worth_snapshots')
    .select('*')
    .eq('user_id', userId)
    .gte('snapshot_date', since)
    .order('snapshot_date', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as NetWorthSnapshotRow[];
}

/** Nightly entrypoint — snapshot every user who has any active connected account. */
export async function snapshotAllUsers(): Promise<{ users: number; ok: number; failed: number }> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('connected_accounts')
    .select('user_id')
    .eq('status', 'active');
  if (error) throw new Error(error.message);
  const ids = Array.from(new Set((data ?? []).map((r: { user_id: string }) => r.user_id)));
  let ok = 0;
  let failed = 0;
  for (const uid of ids) {
    try {
      await writeNetWorthSnapshot(uid);
      ok += 1;
    } catch {
      failed += 1;
    }
  }
  return { users: ids.length, ok, failed };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
