// Finicity fallback — stub. Second-line resilience after MX.

export async function isFinicityAvailable(): Promise<boolean> {
  return Boolean(process.env.FINICITY_PARTNER_ID && process.env.FINICITY_PARTNER_SECRET);
}

export async function syncItemTransactionsFinicity(_providerItemRowId: string): Promise<{
  added: number;
  modified: number;
  removed: number;
}> {
  if (!(await isFinicityAvailable())) {
    throw new Error('Finicity fallback not configured');
  }
  throw new Error('Finicity sync not implemented in Phase 1');
}
