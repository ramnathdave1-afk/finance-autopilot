// Thin read-only wrapper over @fa/db for the latest investment_holdings
// snapshot. Isolated so tests can mock just this surface (same shape as
// missing-money's finds-store / subscription-killer's subscription-lookup).
//
// The investment_holdings table already exists
// (packages/db/migrations/phase2_T2_tier2_tables.sql) — we only READ it.

import { createServiceClient } from '@fa/db';
import type { InvestmentHoldingRow } from '@fa/db';
import type { Position } from './rebalance';

/**
 * Load the most recent holdings snapshot for a user. Holdings are snapshotted
 * per `as_of` date; we take only rows from the latest date so stale snapshots
 * don't double-count a position. Returns [] when the user has no holdings.
 */
export async function getLatestHoldings(userId: string): Promise<InvestmentHoldingRow[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('investment_holdings')
    .select('*')
    .eq('user_id', userId)
    .order('as_of', { ascending: false });
  if (error) throw new Error(`getLatestHoldings failed: ${error.message}`);
  const rows = (data ?? []) as InvestmentHoldingRow[];
  if (rows.length === 0) return [];
  const latest = rows[0]!.as_of;
  return rows.filter((r) => r.as_of === latest);
}

/**
 * Map a raw holdings row onto the pure-math Position. `taxable` is resolved
 * from the caller-supplied set of taxable account ids (the agent passes which
 * connected_accounts are taxable; retirement accounts are excluded from
 * tax-loss harvesting). Unknown asset type collapses to 'other'.
 */
export function rowToPosition(
  row: InvestmentHoldingRow,
  taxableAccountIds: ReadonlySet<string>,
): Position {
  return {
    holdingId: row.id,
    accountId: row.account_id,
    ticker: row.ticker,
    name: row.name,
    assetClass: row.type && row.type.trim() !== '' ? row.type : 'other',
    currentValue: Number(row.current_value ?? 0),
    costBasis: row.cost_basis === null ? null : Number(row.cost_basis),
    taxable: taxableAccountIds.has(row.account_id),
  };
}
