// MX Platform fallback adapter.
//
// Activated when Plaid disconnect rate > 5% (PRD §11, §19) or when a
// specific user has been login_required > 24h on Plaid.
//
// MX uses HTTP Basic auth with (MX_CLIENT_ID, MX_API_KEY) and a user
// scoping pattern: every call is scoped to `/users/{user_guid}/...`. The
// access token equivalent is the `member_guid` we store in
// provider_items.provider_item_id, paired with the MX user_guid stored in
// vault alongside the access-token slot.
//
// Endpoints used:
//   GET  /users/{user_guid}/accounts
//   GET  /users/{user_guid}/transactions?from_date=&to_date=
//
// Reference: https://docs.mx.com/api/transaction_data

import { createServiceClient } from '@fa/db';
import { categorizeTransactionIds } from '../transactions';
import { readAccessToken } from '../vault';
import type {
  ProviderAdapter,
  ProviderSyncResult,
  NormalizedAccount,
  NormalizedTransaction,
} from './types';

const MX_BASE_PROD = 'https://api.mx.com';
const MX_BASE_INT = 'https://int-api.mx.com';

function baseUrl(): string {
  return process.env.MX_ENV === 'production' ? MX_BASE_PROD : MX_BASE_INT;
}

function authHeader(): string {
  const id = process.env.MX_CLIENT_ID;
  const key = process.env.MX_API_KEY;
  if (!id || !key) throw new Error('MX_CLIENT_ID + MX_API_KEY required');
  return 'Basic ' + Buffer.from(`${id}:${key}`).toString('base64');
}

async function mxFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    headers: {
      Accept: 'application/vnd.mx.api.v1+json',
      Authorization: authHeader(),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`MX ${path} → ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

interface MxAccount {
  guid: string;
  name: string;
  type: string;
  subtype?: string | null;
  account_number?: string | null;
  balance?: number | null;
  available_balance?: number | null;
  currency_code?: string | null;
  institution_name?: string | null;
}

interface MxTransaction {
  guid: string;
  account_guid: string;
  amount: number;          // MX: positive = outflow already
  currency_code?: string | null;
  description?: string | null;
  merchant_guid?: string | null;
  merchant_name?: string | null;
  category?: string | null;
  date?: string;            // ISO date
  status?: string;          // 'POSTED' | 'PENDING'
}

export const mxAdapter: ProviderAdapter = {
  name: 'mx',

  isConfigured() {
    return Boolean(process.env.MX_CLIENT_ID && process.env.MX_API_KEY);
  },

  async refreshBalances(providerItemRowId: string): Promise<{ accounts: number }> {
    const { userId, mxUserGuid } = await loadItem(providerItemRowId);
    const res = await mxFetch<{ accounts: MxAccount[] }>(
      `/users/${encodeURIComponent(mxUserGuid)}/accounts`,
    );
    await upsertAccounts(userId, providerItemRowId, res.accounts ?? []);
    return { accounts: (res.accounts ?? []).length };
  },

  async syncItem(providerItemRowId: string): Promise<ProviderSyncResult> {
    const supabase = createServiceClient();
    const { userId, mxUserGuid } = await loadItem(providerItemRowId);

    // Refresh accounts first so the merchant→account_id map is current.
    const acctRes = await mxFetch<{ accounts: MxAccount[] }>(
      `/users/${encodeURIComponent(mxUserGuid)}/accounts`,
    );
    await upsertAccounts(userId, providerItemRowId, acctRes.accounts ?? []);

    // Use the item-level last_synced_at as the from_date for incremental.
    const { data: itemMeta } = await supabase
      .from('provider_items')
      .select('last_synced_at')
      .eq('id', providerItemRowId)
      .single();
    const from = itemMeta?.last_synced_at
      ? new Date(itemMeta.last_synced_at).toISOString().slice(0, 10)
      : new Date(Date.now() - 90 * 86400_000).toISOString().slice(0, 10);
    const to = new Date().toISOString().slice(0, 10);

    const { data: accounts } = await supabase
      .from('connected_accounts')
      .select('id, provider_account_id')
      .eq('user_id', userId)
      .eq('provider_item_id', providerItemRowId);
    const acctMap = new Map<string, string>(
      (accounts ?? []).map((a: { id: string; provider_account_id: string | null }) => [
        a.provider_account_id ?? '',
        a.id,
      ]),
    );

    const txRes = await mxFetch<{ transactions: MxTransaction[] }>(
      `/users/${encodeURIComponent(mxUserGuid)}/transactions?from_date=${from}&to_date=${to}&records_per_page=500`,
    );

    const normalized: NormalizedTransaction[] = (txRes.transactions ?? [])
      .map((t) => {
        const accountId = acctMap.get(t.account_guid);
        if (!accountId) return null;
        return {
          provider_transaction_id: t.guid,
          account_id: accountId,
          amount: t.amount,
          iso_currency_code: t.currency_code ?? 'USD',
          merchant: t.merchant_name ?? null,
          raw_description: t.description ?? null,
          category: t.category ?? null,
          date: (t.date ?? to).slice(0, 10),
          pending: (t.status ?? 'POSTED').toUpperCase() === 'PENDING',
        } satisfies NormalizedTransaction;
      })
      .filter((x): x is NormalizedTransaction => x !== null);

    const newIds: string[] = [];
    if (normalized.length > 0) {
      const rows = normalized.map((n) => ({
        user_id: userId,
        account_id: n.account_id,
        provider: 'mx' as const,
        provider_transaction_id: n.provider_transaction_id,
        amount: n.amount,
        iso_currency_code: n.iso_currency_code,
        merchant: n.merchant,
        raw_description: n.raw_description,
        category: n.category,
        date: n.date,
        pending: n.pending,
      }));
      const { data: written, error } = await supabase
        .from('transactions')
        .upsert(rows, { onConflict: 'provider,provider_transaction_id' })
        .select('id, ai_category');
      if (error) throw new Error(`MX transactions upsert: ${error.message}`);
      for (const r of written ?? []) {
        if (!r.ai_category) newIds.push(r.id);
      }
    }

    await supabase
      .from('provider_items')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('id', providerItemRowId);

    if (newIds.length > 0) await categorizeTransactionIds(newIds);

    return { added: normalized.length, modified: 0, removed: 0 };
  },
};

async function loadItem(providerItemRowId: string): Promise<{ userId: string; mxUserGuid: string }> {
  const supabase = createServiceClient();
  const { data: item, error } = await supabase
    .from('provider_items')
    .select('user_id, vault_secret_id, provider')
    .eq('id', providerItemRowId)
    .single();
  if (error || !item) throw new Error(`provider_items not found: ${error?.message}`);
  if (item.provider !== 'mx') throw new Error('mxAdapter called on non-mx item');
  if (!item.vault_secret_id) throw new Error('MX item missing vault_secret_id (user_guid)');
  const mxUserGuid = await readAccessToken(item.vault_secret_id);
  return { userId: item.user_id, mxUserGuid };
}

async function upsertAccounts(
  userId: string,
  providerItemRowId: string,
  accounts: MxAccount[],
): Promise<void> {
  if (accounts.length === 0) return;
  const supabase = createServiceClient();
  const rows: Array<NormalizedAccount & {
    user_id: string;
    provider: 'mx';
    provider_item_id: string;
    status: string;
    last_synced_at: string;
  }> = accounts.map((a) => ({
    user_id: userId,
    provider: 'mx',
    provider_item_id: providerItemRowId,
    provider_account_id: a.guid,
    institution_name: a.institution_name ?? 'MX',
    account_type: a.type ?? 'depository',
    account_subtype: a.subtype ?? null,
    mask: (a.account_number ?? '').slice(-4) || null,
    current_balance: a.balance ?? null,
    available_balance: a.available_balance ?? null,
    iso_currency_code: a.currency_code ?? 'USD',
    status: 'active',
    last_synced_at: new Date().toISOString(),
  }));
  const { error } = await supabase
    .from('connected_accounts')
    .upsert(rows, { onConflict: 'provider,provider_account_id' });
  if (error) throw new Error(`MX accounts upsert: ${error.message}`);
}

// Back-compat exports — earlier callers used these names.
export async function isMxAvailable(): Promise<boolean> {
  return mxAdapter.isConfigured();
}
export async function syncItemTransactionsMx(providerItemRowId: string): Promise<ProviderSyncResult> {
  if (!mxAdapter.isConfigured()) throw new Error('MX not configured');
  return mxAdapter.syncItem(providerItemRowId);
}
