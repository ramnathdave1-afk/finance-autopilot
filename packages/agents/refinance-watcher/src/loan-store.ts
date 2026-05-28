// Thin wrappers over @fa/db's createServiceClient for the loans + rate_snapshots
// surfaces. Isolated so tests can mock just this layer (mirrors
// subscription-killer's subscription-lookup.ts). Tables already exist —
// packages/db/migrations/phase2_T2_tier2_tables.sql. We do NOT create them.

import { createServiceClient } from '@fa/db';
import type { LoanRow, LoanType, RateSnapshotRow } from '@fa/db/types';
import type { RateQuote } from './rate-port';

/** All loans for a user. */
export async function getUserLoans(userId: string): Promise<LoanRow[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('loans')
    .select('*')
    .eq('user_id', userId);
  if (error) throw new Error(`getUserLoans failed: ${error.message}`);
  return (data ?? []) as LoanRow[];
}

/**
 * Latest rate snapshot per loan type, returned as a map. Picks the row with
 * the most recent captured_on for each loan_type the user actually holds.
 */
export async function getLatestSnapshots(
  loanTypes: readonly LoanType[],
): Promise<Map<LoanType, RateSnapshotRow>> {
  const out = new Map<LoanType, RateSnapshotRow>();
  if (loanTypes.length === 0) return out;
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('rate_snapshots')
    .select('*')
    .in('loan_type', loanTypes as LoanType[])
    .order('captured_on', { ascending: false });
  if (error) throw new Error(`getLatestSnapshots failed: ${error.message}`);
  for (const row of (data ?? []) as RateSnapshotRow[]) {
    // First seen wins because we ordered captured_on desc.
    if (!out.has(row.loan_type)) out.set(row.loan_type, row);
  }
  return out;
}

/**
 * Persist freshly-fetched rate quotes into rate_snapshots. Upsert on the
 * (loan_type, source, captured_on) unique index so a re-run on the same day is
 * idempotent. Returns the number of rows written.
 */
export async function persistRateQuotes(quotes: RateQuote[]): Promise<number> {
  if (quotes.length === 0) return 0;
  const supabase = createServiceClient();
  const rows = quotes.map((q) => ({
    loan_type: q.loanType,
    source: q.source,
    apr_low: q.aprLow,
    apr_avg: q.aprAvg,
    apr_high: q.aprHigh,
    captured_on: q.capturedOn,
  }));
  const { error } = await supabase
    .from('rate_snapshots')
    .upsert(rows, { onConflict: 'loan_type,source,captured_on' });
  if (error) throw new Error(`persistRateQuotes failed: ${error.message}`);
  return rows.length;
}
