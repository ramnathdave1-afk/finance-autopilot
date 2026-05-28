// Thin wrapper over @fa/db's createServiceClient for reading existing
// unclaimed_finds + inserting new ones. Isolated so tests can mock just this
// surface (same shape as subscription-killer's subscription-lookup.ts).
//
// The unclaimed_finds table (packages/db/migrations/phase2_T2_tier2_tables.sql)
// already exists with a partial unique index on (user_id, source, property_id)
// WHERE property_id IS NOT NULL — so DB-level dedupe only covers id-bearing
// finds. We additionally dedupe in-app so finds WITHOUT a property_id (some
// state DBs omit it) don't pile up across daily runs.

import { createServiceClient } from '@fa/db';
import type { UnclaimedFindRow } from '@fa/db';
import type { UnclaimedHit } from './unclaimed-property-port';

/** Load every find already recorded for this user (any status). */
export async function getExistingFinds(userId: string): Promise<UnclaimedFindRow[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('unclaimed_finds')
    .select('*')
    .eq('user_id', userId);
  if (error) throw new Error(`getExistingFinds failed: ${error.message}`);
  return (data ?? []) as UnclaimedFindRow[];
}

/** Stable key for a find — mirrors the DB unique index plus a holder fallback. */
export function dedupeKey(parts: {
  source: string;
  propertyId: string | null;
  holder: string | null;
  amountEstimate: string | null;
}): string {
  // When the source gives a property_id, that alone is canonical (matches the
  // DB unique index). Otherwise fall back to source+holder+amount so repeated
  // daily runs of the same id-less hit collapse to one row.
  if (parts.propertyId) return `${parts.source}::id::${parts.propertyId}`;
  return `${parts.source}::h::${parts.holder ?? ''}::${parts.amountEstimate ?? ''}`;
}

/** Map a raw hit onto the unclaimed_finds insert shape. */
export function hitToRow(userId: string, hit: UnclaimedHit) {
  return {
    user_id: userId,
    source: hit.source,
    state: hit.state ?? null,
    holder: hit.holder ?? null,
    amount_estimate: hit.amountEstimate ?? null,
    property_id: hit.propertyId ?? null,
    details: hit.details ?? null,
    claim_url: hit.claimUrl ?? null,
    status: 'detected' as const,
  };
}

export interface InsertResult {
  inserted: UnclaimedFindRow[];
}

/** Insert the given rows, returning the inserted rows. Empty input = no-op. */
export async function insertFinds(
  rows: ReturnType<typeof hitToRow>[],
): Promise<InsertResult> {
  if (rows.length === 0) return { inserted: [] };
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('unclaimed_finds')
    .insert(rows)
    .select('*');
  if (error) throw new Error(`insertFinds failed: ${error.message}`);
  return { inserted: (data ?? []) as UnclaimedFindRow[] };
}
