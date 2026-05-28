// Round-up math (PRD §8.2 Agent 3).
//
// For each debit (outflow) transaction, round the amount UP to the next
// whole dollar and sum the difference. Inflows (paychecks, refunds) are
// ignored.
//
// Amounts are in cents. We normalize sign by accepting an `outflowSign`
// because Plaid sometimes returns debits as positive and sometimes as
// negative depending on the integration.

export interface RoundUpTxn {
  id: string;
  amountCents: number;
  date: string;
  /** Whether this transaction is an outflow (a purchase). */
  isDebit: boolean;
}

/** Round each debit up to the next whole dollar; return total cents to sweep. */
export function roundUpTotal(transactions: RoundUpTxn[]): number {
  let total = 0;
  for (const t of transactions) {
    if (!t.isDebit) continue;
    const abs = Math.abs(t.amountCents);
    if (abs === 0) continue;
    const cents = abs % 100;
    if (cents === 0) continue; // exact dollar → no round-up
    total += 100 - cents;
  }
  return total;
}

/** Per-transaction breakdown — useful for showing the user where it came from. */
export function roundUpBreakdown(
  transactions: RoundUpTxn[],
): Array<{ id: string; roundUpCents: number }> {
  const out: Array<{ id: string; roundUpCents: number }> = [];
  for (const t of transactions) {
    if (!t.isDebit) continue;
    const abs = Math.abs(t.amountCents);
    const cents = abs % 100;
    const round = abs === 0 || cents === 0 ? 0 : 100 - cents;
    if (round > 0) out.push({ id: t.id, roundUpCents: round });
  }
  return out;
}
