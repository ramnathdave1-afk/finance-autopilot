import { createServiceClient } from '@fa/db';
import { getPlaidClient } from './client';

/** Fetch accounts for a Plaid item and upsert them into connected_accounts. */
export async function upsertAccountsForItem(
  userId: string,
  providerItemId: string,
  accessToken: string,
): Promise<number> {
  const plaid = getPlaidClient();
  const supabase = createServiceClient();

  const res = await plaid.accountsGet({ access_token: accessToken });
  const accounts = res.data.accounts;
  const institutionName = res.data.item.institution_id ?? 'Unknown';

  if (accounts.length === 0) return 0;

  const rows = accounts.map((a) => ({
    user_id: userId,
    provider: 'plaid' as const,
    provider_item_id: providerItemId,
    provider_account_id: a.account_id,
    institution_name: institutionName,
    account_type: a.type,
    account_subtype: a.subtype ?? null,
    mask: a.mask ?? null,
    current_balance: a.balances.current ?? null,
    available_balance: a.balances.available ?? null,
    iso_currency_code: a.balances.iso_currency_code ?? 'USD',
    status: 'active',
    last_synced_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from('connected_accounts')
    .upsert(rows, { onConflict: 'provider,provider_account_id' });
  if (error) throw new Error(`upsert accounts failed: ${error.message}`);
  return rows.length;
}
