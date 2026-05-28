// Finicity (Mastercard Open Banking) fallback adapter.
//
// Second-line resilience after MX (PRD §11).
//
// Auth flow:
//   1. POST /aggregation/v2/partners/authentication  → partnerAccessToken
//      Body: { partnerId, partnerSecret }
//      Token has a 2-hour TTL.
//   2. Per-call: header `Finicity-App-Token: <token>` + `Finicity-App-Key`.
//   3. We store the Finicity `customerId` in vault (same slot the Plaid
//      access token would occupy) since Finicity scopes all reads by it.
//
// Endpoints used:
//   GET /aggregation/v2/customers/{customerId}/accounts
//   GET /aggregation/v3/customers/{customerId}/transactions?fromDate=&toDate=

import { createServiceClient } from '@fa/db';
import { categorizeTransactionIds } from '../transactions';
import { readAccessToken } from '../vault';
import type {
  ProviderAdapter,
  ProviderSyncResult,
  NormalizedAccount,
  NormalizedTransaction,
} from './types';

const FINICITY_BASE = 'https://api.finicity.com';

interface PartnerTokenCache {
  token: string;
  exp: number;
}
let _partnerToken: PartnerTokenCache | null = null;

async function partnerToken(): Promise<string> {
  const now = Date.now();
  if (_partnerToken && _partnerToken.exp > now + 60_000) return _partnerToken.token;

  const partnerId = process.env.FINICITY_PARTNER_ID;
  const partnerSecret = process.env.FINICITY_PARTNER_SECRET;
  const appKey = process.env.FINICITY_APP_KEY;
  if (!partnerId || !partnerSecret || !appKey) {
    throw new Error('FINICITY_{PARTNER_ID,PARTNER_SECRET,APP_KEY} required');
  }

  const res = await fetch(`${FINICITY_BASE}/aggregation/v2/partners/authentication`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'Finicity-App-Key': appKey,
    },
    body: JSON.stringify({ partnerId, partnerSecret }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Finicity auth ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as { token: string };
  _partnerToken = { token: json.token, exp: now + 2 * 60 * 60 * 1000 - 60_000 };
  return _partnerToken.token;
}

async function finFetch<T>(path: string): Promise<T> {
  const token = await partnerToken();
  const res = await fetch(`${FINICITY_BASE}${path}`, {
    headers: {
      Accept: 'application/json',
      'Finicity-App-Key': process.env.FINICITY_APP_KEY!,
      'Finicity-App-Token': token,
    },
  });
  if (!res.ok) {
    if (res.status === 401) {
      _partnerToken = null; // force re-auth on next call
    }
    const body = await res.text().catch(() => '');
    throw new Error(`Finicity ${path} → ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

interface FinAccount {
  id: string;
  number?: string;
  name?: string;
  type?: string;
  detail?: { description?: string };
  balance?: number;
  availableBalance?: number;
  currency?: string;
  institutionName?: string;
}

interface FinTransaction {
  id: number | string;
  accountId: string;
  amount: number;       // Finicity: negative = outflow
  currencySymbol?: string;
  description?: string;
  memo?: string;
  categorization?: { category?: string };
  postedDate?: number;  // epoch seconds
  transactionDate?: number;
  status?: string;      // 'active' | 'pending'
}

export const finicityAdapter: ProviderAdapter = {
  name: 'finicity',

  isConfigured() {
    return Boolean(
      process.env.FINICITY_PARTNER_ID &&
        process.env.FINICITY_PARTNER_SECRET &&
        process.env.FINICITY_APP_KEY,
    );
  },

  async refreshBalances(providerItemRowId: string): Promise<{ accounts: number }> {
    const { userId, customerId } = await loadItem(providerItemRowId);
    const res = await finFetch<{ accounts: FinAccount[] }>(
      `/aggregation/v2/customers/${encodeURIComponent(customerId)}/accounts`,
    );
    await upsertAccounts(userId, providerItemRowId, res.accounts ?? []);
    return { accounts: (res.accounts ?? []).length };
  },

  async syncItem(providerItemRowId: string): Promise<ProviderSyncResult> {
    const supabase = createServiceClient();
    const { userId, customerId } = await loadItem(providerItemRowId);

    const acctRes = await finFetch<{ accounts: FinAccount[] }>(
      `/aggregation/v2/customers/${encodeURIComponent(customerId)}/accounts`,
    );
    await upsertAccounts(userId, providerItemRowId, acctRes.accounts ?? []);

    const { data: itemMeta } = await supabase
      .from('provider_items')
      .select('last_synced_at')
      .eq('id', providerItemRowId)
      .single();
    const fromEpoch = itemMeta?.last_synced_at
      ? Math.floor(new Date(itemMeta.last_synced_at).getTime() / 1000)
      : Math.floor((Date.now() - 90 * 86400_000) / 1000);
    const toEpoch = Math.floor(Date.now() / 1000);

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

    const txRes = await finFetch<{ transactions: FinTransaction[] }>(
      `/aggregation/v3/customers/${encodeURIComponent(customerId)}/transactions?fromDate=${fromEpoch}&toDate=${toEpoch}&limit=500`,
    );

    const normalized: NormalizedTransaction[] = (txRes.transactions ?? [])
      .map((t): NormalizedTransaction | null => {
        const accountId = acctMap.get(t.accountId);
        if (!accountId) return null;
        const epoch = t.postedDate ?? t.transactionDate ?? toEpoch;
        return {
          provider_transaction_id: String(t.id),
          account_id: accountId,
          amount: -Number(t.amount), // flip to our convention: positive = outflow
          iso_currency_code: t.currencySymbol ?? 'USD',
          merchant: null as string | null,
          raw_description: t.description ?? t.memo ?? null,
          category: t.categorization?.category ?? null,
          date: new Date(epoch * 1000).toISOString().slice(0, 10),
          pending: (t.status ?? 'active').toLowerCase() === 'pending',
        };
      })
      .filter((x): x is NormalizedTransaction => x !== null);

    const newIds: string[] = [];
    if (normalized.length > 0) {
      const rows = normalized.map((n) => ({
        user_id: userId,
        account_id: n.account_id,
        provider: 'finicity' as const,
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
      if (error) throw new Error(`Finicity transactions upsert: ${error.message}`);
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

async function loadItem(providerItemRowId: string): Promise<{ userId: string; customerId: string }> {
  const supabase = createServiceClient();
  const { data: item, error } = await supabase
    .from('provider_items')
    .select('user_id, vault_secret_id, provider')
    .eq('id', providerItemRowId)
    .single();
  if (error || !item) throw new Error(`provider_items not found: ${error?.message}`);
  if (item.provider !== 'finicity') throw new Error('finicityAdapter called on non-finicity item');
  if (!item.vault_secret_id) throw new Error('Finicity item missing vault_secret_id (customerId)');
  const customerId = await readAccessToken(item.vault_secret_id);
  return { userId: item.user_id, customerId };
}

async function upsertAccounts(
  userId: string,
  providerItemRowId: string,
  accounts: FinAccount[],
): Promise<void> {
  if (accounts.length === 0) return;
  const supabase = createServiceClient();
  const rows: Array<NormalizedAccount & {
    user_id: string;
    provider: 'finicity';
    provider_item_id: string;
    status: string;
    last_synced_at: string;
  }> = accounts.map((a) => ({
    user_id: userId,
    provider: 'finicity',
    provider_item_id: providerItemRowId,
    provider_account_id: a.id,
    institution_name: a.institutionName ?? 'Finicity',
    account_type: a.type ?? 'depository',
    account_subtype: a.detail?.description ?? null,
    mask: (a.number ?? '').slice(-4) || null,
    current_balance: a.balance ?? null,
    available_balance: a.availableBalance ?? null,
    iso_currency_code: a.currency ?? 'USD',
    status: 'active',
    last_synced_at: new Date().toISOString(),
  }));
  const { error } = await supabase
    .from('connected_accounts')
    .upsert(rows, { onConflict: 'provider,provider_account_id' });
  if (error) throw new Error(`Finicity accounts upsert: ${error.message}`);
}

// Back-compat exports.
export async function isFinicityAvailable(): Promise<boolean> {
  return finicityAdapter.isConfigured();
}
export async function syncItemTransactionsFinicity(providerItemRowId: string): Promise<ProviderSyncResult> {
  if (!finicityAdapter.isConfigured()) throw new Error('Finicity not configured');
  return finicityAdapter.syncItem(providerItemRowId);
}
