// Thin wrapper over @fa/db's createServiceClient for the insurance_policies
// read + insurance_quotes write. Isolated so tests can mock just this surface,
// mirroring subscription-killer's subscription-lookup.ts.

import { createServiceClient } from '@fa/db';
import type { InsurancePolicyRow, InsuranceQuoteRow } from '@fa/db/types';
import type { RankedQuote } from './ranking';

export async function getPolicy(policyId: string): Promise<InsurancePolicyRow | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('insurance_policies')
    .select('*')
    .eq('id', policyId)
    .maybeSingle();
  if (error) throw new Error(`getPolicy failed: ${error.message}`);
  return (data ?? null) as InsurancePolicyRow | null;
}

/** A quote row ready to insert into insurance_quotes (id/captured_at default). */
export type InsuranceQuoteInsert = Omit<InsuranceQuoteRow, 'id' | 'captured_at'>;

/**
 * Persist the ranked competitor quotes for a policy. Returns the number of
 * rows written. One row per RankedQuote, newest captured set per re-quote run.
 */
export async function writeQuotes(
  userId: string,
  policyId: string,
  ranked: RankedQuote[],
): Promise<number> {
  if (ranked.length === 0) return 0;
  const supabase = createServiceClient();
  const rows: InsuranceQuoteInsert[] = ranked.map((q) => ({
    user_id: userId,
    policy_id: policyId,
    carrier: q.carrier,
    monthly_premium: q.monthlyPremium,
    annual_premium: q.annualPremium ?? Number((q.monthlyPremium * 12).toFixed(2)),
    coverage_match: q.coverageMatch ?? null,
    quote_url: q.quoteUrl ?? null,
    expires_at: q.expiresAt ?? null,
  }));
  const { error } = await supabase.from('insurance_quotes').insert(rows);
  if (error) throw new Error(`writeQuotes failed: ${error.message}`);
  return rows.length;
}
