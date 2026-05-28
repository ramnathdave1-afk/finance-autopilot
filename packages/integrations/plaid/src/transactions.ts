import { createServiceClient } from '@fa/db';
import type { TransactionRow } from '@fa/db/types';
import { getPlaidClient } from './client';
import { readAccessToken } from './vault';
import { categorizeBatch } from '@fa/claude';

/**
 * Incremental sync for one Plaid item using /transactions/sync.
 * Cursor-driven: advances until has_more === false.
 * Per PRD §20: incremental every hour, full nightly. This handles both —
 * it's effectively the same call, the cursor decides scope.
 *
 * Returns the number of net rows added/modified.
 */
export async function syncItemTransactions(providerItemRowId: string): Promise<{
  added: number;
  modified: number;
  removed: number;
}> {
  const supabase = createServiceClient();
  const plaid = getPlaidClient();

  const { data: item, error: itemErr } = await supabase
    .from('provider_items')
    .select('id, user_id, provider_item_id, cursor, vault_secret_id')
    .eq('id', providerItemRowId)
    .single();
  if (itemErr || !item) throw new Error(`provider_item not found: ${itemErr?.message}`);
  if (!item.vault_secret_id) throw new Error('provider_item missing vault_secret_id');

  const accessToken = await readAccessToken(item.vault_secret_id);

  // Map account_id (Plaid) → internal connected_accounts.id
  const { data: accounts, error: accErr } = await supabase
    .from('connected_accounts')
    .select('id, provider_account_id')
    .eq('user_id', item.user_id)
    .eq('provider_item_id', item.provider_item_id);
  if (accErr) throw new Error(`accounts lookup failed: ${accErr.message}`);
  const accountByPlaidId = new Map<string, string>(
    (accounts ?? []).map((a) => [a.provider_account_id!, a.id]),
  );

  let cursor = item.cursor ?? undefined;
  let hasMore = true;
  let totalAdded = 0;
  let totalModified = 0;
  let totalRemoved = 0;

  const newTxnIdsForCategorize: string[] = [];

  while (hasMore) {
    const res = await plaid.transactionsSync({
      access_token: accessToken,
      cursor,
      options: { include_personal_finance_category: true },
    });
    cursor = res.data.next_cursor;
    hasMore = res.data.has_more;

    const upserts = [...res.data.added, ...res.data.modified].flatMap((t) => {
      const accountId = accountByPlaidId.get(t.account_id);
      if (!accountId) return [];
      return [{
        user_id: item.user_id,
        account_id: accountId,
        provider: 'plaid' as const,
        provider_transaction_id: t.transaction_id,
        amount: t.amount,
        iso_currency_code: t.iso_currency_code ?? 'USD',
        merchant: t.merchant_name ?? t.name ?? null,
        raw_description: t.name ?? null,
        category: t.personal_finance_category?.primary ?? (t.category?.[0] ?? null),
        date: t.date,
        pending: t.pending,
      }];
    });

    if (upserts.length > 0) {
      const { data: written, error } = await supabase
        .from('transactions')
        .upsert(upserts, { onConflict: 'provider,provider_transaction_id' })
        .select('id, merchant, raw_description, amount, ai_category');
      if (error) throw new Error(`transactions upsert failed: ${error.message}`);
      for (const row of written ?? []) {
        if (!row.ai_category) newTxnIdsForCategorize.push(row.id);
      }
    }

    totalAdded += res.data.added.length;
    totalModified += res.data.modified.length;

    if (res.data.removed.length > 0) {
      const removedIds = res.data.removed.map((r) => r.transaction_id);
      const { error } = await supabase
        .from('transactions')
        .delete()
        .in('provider_transaction_id', removedIds)
        .eq('provider', 'plaid');
      if (error) throw new Error(`transactions delete failed: ${error.message}`);
      totalRemoved += removedIds.length;
    }
  }

  await supabase
    .from('provider_items')
    .update({ cursor, last_synced_at: new Date().toISOString() })
    .eq('id', item.id);

  if (newTxnIdsForCategorize.length > 0) {
    // Run categorization out-of-band but await it so callers can verify
    // ai_category fill in tests. Batched inside categorizeTransactionIds.
    await categorizeTransactionIds(newTxnIdsForCategorize);
  }

  return { added: totalAdded, modified: totalModified, removed: totalRemoved };
}

/**
 * Pull a batch of uncategorized transactions, ask Claude, write back ai_category.
 * Used by the sync path above and by the nightly catch-up cron.
 */
export async function categorizeTransactionIds(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const supabase = createServiceClient();
  const { data: txns, error } = await supabase
    .from('transactions')
    .select('id, merchant, raw_description, amount, category')
    .in('id', ids);
  if (error) throw new Error(`fetch txns for categorize failed: ${error.message}`);
  if (!txns || txns.length === 0) return 0;

  const results = await categorizeBatch(
    txns.map((t) => ({
      id: t.id,
      merchant: t.merchant,
      description: t.raw_description,
      amount: Number(t.amount),
      hint: t.category,
    })),
  );

  let updated = 0;
  for (const r of results) {
    const { error: uErr } = await supabase
      .from('transactions')
      .update({
        ai_category: r.category,
        ai_category_confidence: r.confidence,
        ai_categorized_at: new Date().toISOString(),
      })
      .eq('id', r.id);
    if (!uErr) updated += 1;
  }
  return updated;
}

/** Catch-up job: categorize any transaction still missing ai_category. */
export async function categorizeBacklog(userId: string, limit = 200): Promise<number> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('transactions')
    .select('id')
    .eq('user_id', userId)
    .is('ai_category', null)
    .limit(limit);
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return 0;
  return categorizeTransactionIds(data.map((r) => r.id));
}

export type { TransactionRow };
