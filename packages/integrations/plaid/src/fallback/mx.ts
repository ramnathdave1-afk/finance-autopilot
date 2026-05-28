// MX fallback — stub. Activated when Plaid disconnect rate > 5% (PRD §11, §19 alerts).
// Behind the same `DataProvider` enum so callers branch on row.provider.
//
// TODO(Phase 2): implement MX OAuth + transactions sync.

export async function isMxAvailable(): Promise<boolean> {
  return Boolean(process.env.MX_CLIENT_ID && process.env.MX_API_KEY);
}

export async function syncItemTransactionsMx(_providerItemRowId: string): Promise<{
  added: number;
  modified: number;
  removed: number;
}> {
  if (!(await isMxAvailable())) {
    throw new Error('MX fallback not configured (MX_CLIENT_ID / MX_API_KEY missing)');
  }
  // Phase 1: not implemented. Wire up in Phase 2 if Plaid disconnect alerts fire.
  throw new Error('MX sync not implemented in Phase 1');
}
