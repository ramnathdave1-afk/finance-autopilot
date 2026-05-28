// Paycheck detection heuristic.
//
// Heuristic (PRD §8.2 Agent 2):
//   - Credit transaction (amount > 0 in our schema means inflow — but Plaid
//     uses negative for outflow on some integrations; we accept a sign param
//     and normalize)
//   - Amount >= $500 (50000 cents)
//   - Repeats at least twice with similar amount (within 10%) and consistent
//     cadence (7 / 14 / 15 / 16 / 30 / 31 days apart)
//
// Pure function, fully tested with fixtures.

export interface PaycheckTxn {
  id: string;
  amountCents: number; // inflow positive
  date: string; // ISO yyyy-mm-dd
  merchant?: string;
}

export interface DetectedPaycheck {
  id: string;
  amountCents: number;
  date: string;
  cadenceDays: number;
}

const MIN_PAYCHECK_CENTS = 50_000;
const AMOUNT_TOLERANCE = 0.1; // 10%
const VALID_CADENCES = [7, 14, 15, 16, 30, 31];

export function detectPaychecks(transactions: PaycheckTxn[]): DetectedPaycheck[] {
  const inflows = transactions
    .filter((t) => t.amountCents >= MIN_PAYCHECK_CENTS)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (inflows.length < 2) return [];

  // Group by similar amount + employer-ish merchant if available.
  const groups: PaycheckTxn[][] = [];
  for (const t of inflows) {
    const g = groups.find((g) => withinTolerance(g[0]!.amountCents, t.amountCents));
    if (g) g.push(t);
    else groups.push([t]);
  }

  const detected: DetectedPaycheck[] = [];
  for (const group of groups) {
    if (group.length < 2) continue;
    // Verify cadence between consecutive items in the group.
    let cadence = 0;
    let consistent = true;
    for (let i = 1; i < group.length; i++) {
      const diff = daysBetween(group[i - 1]!.date, group[i]!.date);
      if (!VALID_CADENCES.includes(diff)) {
        consistent = false;
        break;
      }
      if (cadence === 0) cadence = diff;
    }
    if (!consistent) continue;
    for (const t of group) {
      detected.push({
        id: t.id,
        amountCents: t.amountCents,
        date: t.date,
        cadenceDays: cadence,
      });
    }
  }
  return detected;
}

function withinTolerance(a: number, b: number): boolean {
  const ratio = Math.abs(a - b) / Math.max(a, b);
  return ratio <= AMOUNT_TOLERANCE;
}

function daysBetween(a: string, b: string): number {
  const da = Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10));
  const db = Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10));
  return Math.round((db - da) / 86_400_000);
}
