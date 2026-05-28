// Daily rate ingestion. The Inngest cron (see README + integration notes)
// calls refreshRates() once per day: it pulls current published rates through
// the injected RatePort and writes them to rate_snapshots. The agent reads
// those snapshots back out — ingestion and evaluation are decoupled.

import type { LoanType } from '@fa/db/types';
import { HttpRatePort, type RatePort } from './rate-port';
import { persistRateQuotes } from './loan-store';

/** All loan types we watch rates for (matches the loan_type enum). */
export const WATCHED_LOAN_TYPES: readonly LoanType[] = [
  'mortgage',
  'student',
  'auto',
  'personal',
  'heloc',
];

export interface RefreshRatesResult {
  source: string;
  fetched: number;
  written: number;
  skipped?: 'not_configured';
}

/**
 * Fetch + persist today's rates. Defaults to the live HttpRatePort (env-keyed);
 * tests pass a MockRatePort. If the live port isn't configured we DO NOT write
 * fabricated rates — we skip and report it, so a missing key can never look
 * like a successful ingest.
 */
export async function refreshRates(opts?: {
  port?: RatePort;
  loanTypes?: readonly LoanType[];
}): Promise<RefreshRatesResult> {
  const port = opts?.port ?? new HttpRatePort();
  const loanTypes = opts?.loanTypes ?? WATCHED_LOAN_TYPES;

  if (!port.isConfigured()) {
    return { source: port.source, fetched: 0, written: 0, skipped: 'not_configured' };
  }

  const quotes = await port.fetchRates(loanTypes);
  const written = await persistRateQuotes(quotes);
  return { source: port.source, fetched: quotes.length, written };
}
