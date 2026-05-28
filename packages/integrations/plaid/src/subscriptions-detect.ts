// Subscription detection — clusters recurring outflows into subscription rows.
// Feeds T4's Subscription Killer agent and the PRD §8.1 "subscription audit"
// free-tier feature.
//
// Algorithm (intentionally simple for v1):
//   1. Group user transactions by (normalized merchant, amount-bucket).
//   2. A merchant is "recurring" if there are >= 3 charges in the last 180
//      days at the same amount (±5%) AND the median gap between charges is
//      in [25, 35] (monthly), [12, 16] (biweekly), or [355, 375] (annual).
//   3. Upsert into `subscriptions`. Link member transactions back via
//      transactions.subscription_id and flip is_subscription = true.
//
// Tunable from outside via DetectOptions.

import { createServiceClient } from '@fa/db';
import type { TransactionRow } from '@fa/db/types';

export interface DetectOptions {
  windowDays?: number;       // default 180
  minOccurrences?: number;   // default 3
  amountTolerance?: number;  // fractional, default 0.05
}

const FREQ_WINDOWS: Array<{ label: string; lo: number; hi: number }> = [
  { label: 'weekly',   lo: 6,   hi: 8 },
  { label: 'biweekly', lo: 12,  hi: 16 },
  { label: 'monthly',  lo: 25,  hi: 35 },
  { label: 'annual',   lo: 355, hi: 375 },
];

export async function detectSubscriptionsForUser(
  userId: string,
  opts: DetectOptions = {},
): Promise<{ created: number; matched: number; linkedTxns: number }> {
  const supabase = createServiceClient();
  const windowDays = opts.windowDays ?? 180;
  const minOcc = opts.minOccurrences ?? 3;
  const tol = opts.amountTolerance ?? 0.05;

  const since = new Date(Date.now() - windowDays * 86400_000).toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('transactions')
    .select('id, merchant, raw_description, amount, date')
    .eq('user_id', userId)
    .gte('date', since)
    .gt('amount', 0)
    .order('date', { ascending: true });
  if (error) throw new Error(error.message);

  const txns = (data ?? []) as Array<Pick<TransactionRow, 'id' | 'merchant' | 'raw_description' | 'amount' | 'date'>>;

  // Group by normalized merchant.
  const groups = new Map<string, typeof txns>();
  for (const t of txns) {
    const key = normalizeMerchant(t.merchant ?? t.raw_description ?? '');
    if (!key) continue;
    const arr = groups.get(key) ?? [];
    arr.push(t);
    groups.set(key, arr);
  }

  let created = 0;
  let matched = 0;
  let linkedTxns = 0;

  for (const [merchant, members] of groups) {
    if (members.length < minOcc) continue;

    // Cluster by amount with tolerance.
    const clusters: Array<typeof members> = [];
    for (const t of members) {
      const c = clusters.find((cl) => Math.abs(Number(cl[0].amount) - Number(t.amount)) / Number(cl[0].amount) <= tol);
      if (c) c.push(t);
      else clusters.push([t]);
    }

    for (const cluster of clusters) {
      if (cluster.length < minOcc) continue;

      const gaps = pairwiseGaps(cluster.map((c) => c.date));
      const med = median(gaps);
      const freq = FREQ_WINDOWS.find((w) => med >= w.lo && med <= w.hi);
      if (!freq) continue;

      const amount = Number(cluster[0].amount);
      const lastCharged = cluster[cluster.length - 1].date;
      const firstSeen = cluster[0].date;

      // Upsert subscription.
      const { data: existing } = await supabase
        .from('subscriptions')
        .select('id')
        .eq('user_id', userId)
        .eq('merchant', merchant)
        .maybeSingle();

      let subId: string;
      if (existing) {
        subId = existing.id;
        await supabase
          .from('subscriptions')
          .update({
            amount,
            frequency: freq.label,
            last_charged_at: lastCharged,
            status: 'active',
          })
          .eq('id', subId);
        matched += 1;
      } else {
        const { data: inserted, error: insErr } = await supabase
          .from('subscriptions')
          .insert({
            user_id: userId,
            merchant,
            amount,
            frequency: freq.label,
            first_seen_at: firstSeen,
            last_charged_at: lastCharged,
            status: 'active',
          })
          .select('id')
          .single();
        if (insErr || !inserted) continue;
        subId = inserted.id;
        created += 1;
      }

      const ids = cluster.map((c) => c.id);
      const { error: linkErr } = await supabase
        .from('transactions')
        .update({ subscription_id: subId, is_subscription: true })
        .in('id', ids);
      if (!linkErr) linkedTxns += ids.length;
    }
  }

  return { created, matched, linkedTxns };
}

/** Strip dates, store ids, locations, and case from a merchant string. */
export function normalizeMerchant(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\b(?:[a-z0-9]*\d{2,}[a-z0-9]*)\b/g, ' ') // drop order ids, store nums
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function pairwiseGaps(dates: string[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < dates.length; i += 1) {
    const a = new Date(dates[i - 1]).getTime();
    const b = new Date(dates[i]).getTime();
    out.push(Math.round((b - a) / 86400_000));
  }
  return out;
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
