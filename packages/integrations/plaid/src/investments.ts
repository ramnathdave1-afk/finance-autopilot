// Plaid Investments — Pro-tier net worth (PRD §13).
// One-shot daily holdings snapshot: pulls /investments/holdings/get and
// upserts a per-(account, security, as_of) row in investment_holdings.
//
// Net worth math then includes equity/ETF positions, not just cash balances.

import { createServiceClient } from '@fa/db';
import { getPlaidClient } from './client';
import { readAccessToken } from './vault';

export async function syncHoldingsForItem(providerItemRowId: string): Promise<{ inserted: number }> {
  const supabase = createServiceClient();
  const plaid = getPlaidClient();

  const { data: item, error } = await supabase
    .from('provider_items')
    .select('id, user_id, provider_item_id, vault_secret_id')
    .eq('id', providerItemRowId)
    .single();
  if (error || !item) throw new Error(`provider_item not found: ${error?.message}`);
  if (!item.vault_secret_id) throw new Error('provider_item missing vault_secret_id');

  const accessToken = await readAccessToken(item.vault_secret_id);

  let res;
  try {
    res = await plaid.investmentsHoldingsGet({ access_token: accessToken });
  } catch (e: unknown) {
    const code = (e as { response?: { data?: { error_code?: string } } })?.response?.data?.error_code;
    // No investments products on this Item — that's expected for cash-only banks.
    if (code === 'PRODUCTS_NOT_SUPPORTED' || code === 'NO_INVESTMENT_ACCOUNTS') {
      return { inserted: 0 };
    }
    throw e;
  }

  const securities = new Map(res.data.securities.map((s) => [s.security_id, s]));
  const today = new Date().toISOString().slice(0, 10);

  // Map Plaid account_id → our internal connected_accounts.id
  const { data: accounts } = await supabase
    .from('connected_accounts')
    .select('id, provider_account_id')
    .eq('user_id', item.user_id)
    .eq('provider_item_id', item.provider_item_id);
  const acctMap = new Map<string, string>(
    (accounts ?? []).map((a: { id: string; provider_account_id: string | null }) => [a.provider_account_id ?? '', a.id]),
  );

  const rows = res.data.holdings.flatMap((h) => {
    const accountId = acctMap.get(h.account_id);
    if (!accountId) return [];
    const sec = securities.get(h.security_id);
    const price = h.institution_price ?? sec?.close_price ?? null;
    return [{
      user_id: item.user_id,
      account_id: accountId,
      security_id: h.security_id,
      ticker: sec?.ticker_symbol ?? null,
      name: sec?.name ?? null,
      type: sec?.type ?? null,
      quantity: h.quantity,
      cost_basis: h.cost_basis ?? null,
      current_price: price,
      current_value: price !== null ? Number((Number(price) * h.quantity).toFixed(2)) : null,
      iso_currency_code: h.iso_currency_code ?? 'USD',
      as_of: today,
    }];
  });

  if (rows.length === 0) return { inserted: 0 };

  const { error: insErr } = await supabase
    .from('investment_holdings')
    .upsert(rows, { onConflict: 'account_id,security_id,as_of' });
  if (insErr) throw new Error(`holdings upsert failed: ${insErr.message}`);

  return { inserted: rows.length };
}

/** Sum of latest-day current_value across all of a user's investment holdings. */
export async function investmentNetWorth(userId: string): Promise<number> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('investment_holdings')
    .select('current_value, as_of')
    .eq('user_id', userId)
    .order('as_of', { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return 0;
  const latest = data[0].as_of;
  return data
    .filter((r: { as_of: string; current_value: number | null }) => r.as_of === latest)
    .reduce((sum: number, r: { current_value: number | null }) => sum + Number(r.current_value ?? 0), 0);
}
