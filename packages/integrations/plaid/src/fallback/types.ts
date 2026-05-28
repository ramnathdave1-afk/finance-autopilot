// Shared shapes for fallback providers. Both MX and Finicity implementations
// conform to the same surface so `providerRouter` in ../router.ts can pick
// without callers branching.

export interface ProviderSyncResult {
  added: number;
  modified: number;
  removed: number;
}

export interface ProviderAdapter {
  /** Provider name (matches `data_provider` enum). */
  name: 'mx' | 'finicity';
  isConfigured(): boolean;
  /** Sync transactions + accounts for one provider_items row. */
  syncItem(providerItemRowId: string): Promise<ProviderSyncResult>;
  /** Pull current balances for one item — used during re-auth verification. */
  refreshBalances(providerItemRowId: string): Promise<{ accounts: number }>;
}

export interface NormalizedTransaction {
  provider_transaction_id: string;
  account_id: string;          // internal connected_accounts.id
  amount: number;
  iso_currency_code: string;
  merchant: string | null;
  raw_description: string | null;
  category: string | null;
  date: string;                // ISO date
  pending: boolean;
}

export interface NormalizedAccount {
  provider_account_id: string;
  institution_name: string;
  account_type: string;
  account_subtype: string | null;
  mask: string | null;
  current_balance: number | null;
  available_balance: number | null;
  iso_currency_code: string;
}
