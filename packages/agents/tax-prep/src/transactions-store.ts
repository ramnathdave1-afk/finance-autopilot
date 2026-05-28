// Thin wrapper over @fa/db's createServiceClient for reading the user's
// categorized transactions for a tax year. Isolated so tests can mock just this
// surface (same shape as spending-coach's pullLast30Days).

import { createServiceClient } from '@fa/db';
import type { TransactionRow } from '@fa/db/types';

/**
 * Pull every transaction dated within `taxYear` for the user, newest first.
 * Filtered by the `date` column at the DB so we don't haul the full history.
 */
export async function getTransactionsForYear(
  userId: string,
  taxYear: number,
): Promise<TransactionRow[]> {
  const supabase = createServiceClient();
  const start = `${taxYear}-01-01`;
  const end = `${taxYear}-12-31`;
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .gte('date', start)
    .lte('date', end)
    .order('date', { ascending: false });
  if (error) throw new Error(`getTransactionsForYear failed: ${error.message}`);
  return (data ?? []) as TransactionRow[];
}
