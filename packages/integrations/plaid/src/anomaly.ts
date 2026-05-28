// Transaction anomaly detection for T4's Charge Dispute Agent (PRD §8.3 Agent 8).
// Two heuristics in v1, both intentionally simple — the goal is high precision
// so we don't surface false-positive dispute candidates to users:
//
//   1. Duplicate charges: same (merchant, amount) within DUP_WINDOW_DAYS.
//   2. Outlier amounts: amount > MERCHANT_OUTLIER_MULT × user's recent median
//      for that merchant. Requires >=3 prior charges at that merchant.
//
// Future v2: ML model trained on labelled disputes. Score field is already in
// `disputes.detection_score` so the upgrade is a drop-in.

import { createServiceClient } from '@fa/db';
import type { TransactionRow } from '@fa/db/types';

const DUP_WINDOW_DAYS = 3;
const MERCHANT_OUTLIER_MULT = 3.0;
const MIN_HISTORY_FOR_OUTLIER = 3;
const HISTORY_DAYS = 180;

export type AnomalyReason = 'duplicate' | 'unusual_amount' | 'subscription_after_cancel';

export interface AnomalyFlag {
  transactionId: string;
  reason: AnomalyReason;
  score: number;          // 0..1
  detail: string;         // human-readable explanation
}

/** Run all anomaly heuristics across recent transactions for a user. */
export async function detectAnomalies(userId: string, lookbackDays = 30): Promise<AnomalyFlag[]> {
  const supabase = createServiceClient();
  const since = new Date(Date.now() - lookbackDays * 86400_000).toISOString().slice(0, 10);
  const historySince = new Date(Date.now() - HISTORY_DAYS * 86400_000).toISOString().slice(0, 10);

  const { data: recent, error } = await supabase
    .from('transactions')
    .select('id, merchant, raw_description, amount, date, pending, subscription_id, is_subscription')
    .eq('user_id', userId)
    .gte('date', since)
    .gt('amount', 0)
    .order('date', { ascending: false });
  if (error) throw new Error(error.message);

  const candidates = (recent ?? []) as Array<Pick<TransactionRow, 'id' | 'merchant' | 'raw_description' | 'amount' | 'date' | 'pending' | 'subscription_id' | 'is_subscription'>>;
  if (candidates.length === 0) return [];

  const flags: AnomalyFlag[] = [];

  // Pull a wider history window for the outlier baselines.
  const { data: history } = await supabase
    .from('transactions')
    .select('id, merchant, amount, date, subscription_id')
    .eq('user_id', userId)
    .gte('date', historySince)
    .gt('amount', 0);
  const allHistory = (history ?? []) as Array<Pick<TransactionRow, 'id' | 'merchant' | 'amount' | 'date' | 'subscription_id'>>;

  // Index history by normalized merchant.
  const byMerchant = new Map<string, Array<number>>();
  for (const t of allHistory) {
    const key = normMerchant(t.merchant);
    if (!key) continue;
    const arr = byMerchant.get(key) ?? [];
    arr.push(Number(t.amount));
    byMerchant.set(key, arr);
  }

  // Index candidates by (normalized merchant, rounded amount) for duplicates.
  type CandShape = Pick<TransactionRow, 'id' | 'merchant' | 'raw_description' | 'amount' | 'date' | 'pending' | 'subscription_id' | 'is_subscription'>;
  const dupKey = (t: CandShape) => `${normMerchant(t.merchant)}::${Math.round(Number(t.amount) * 100)}`;
  const dupBuckets = new Map<string, CandShape[]>();
  for (const t of candidates) {
    const k = dupKey(t);
    const arr = dupBuckets.get(k) ?? [];
    arr.push(t);
    dupBuckets.set(k, arr);
  }

  for (const t of candidates) {
    // Skip subscription-linked charges — those are expected recurrence, not fraud.
    if (t.is_subscription) continue;

    // (1) Duplicate within window.
    const bucket = dupBuckets.get(dupKey(t)) ?? [];
    const dups = bucket.filter((b) => b.id !== t.id && withinDays(t.date, b.date, DUP_WINDOW_DAYS));
    if (dups.length > 0) {
      flags.push({
        transactionId: t.id,
        reason: 'duplicate',
        score: 0.85,
        detail: `Duplicate charge: ${dups.length} other charge(s) of $${Number(t.amount).toFixed(2)} at ${t.merchant ?? 'unknown'} within ${DUP_WINDOW_DAYS} days.`,
      });
      continue;
    }

    // (2) Outlier amount vs merchant history.
    const key = normMerchant(t.merchant);
    if (!key) continue;
    const hist = (byMerchant.get(key) ?? []).filter((a) => a !== Number(t.amount));
    if (hist.length >= MIN_HISTORY_FOR_OUTLIER) {
      const med = median(hist);
      if (med > 0 && Number(t.amount) >= MERCHANT_OUTLIER_MULT * med) {
        const ratio = Number(t.amount) / med;
        flags.push({
          transactionId: t.id,
          reason: 'unusual_amount',
          score: Math.min(0.95, 0.5 + Math.log10(ratio) * 0.3),
          detail: `Unusual amount: $${Number(t.amount).toFixed(2)} is ${ratio.toFixed(1)}× the median $${med.toFixed(2)} at ${t.merchant ?? 'unknown'}.`,
        });
      }
    }
  }

  return flags;
}

/**
 * Charges from a subscription the user already cancelled. Detected by joining
 * recent transactions against subscriptions.status='cancelled'.
 */
export async function detectChargesAfterCancellation(userId: string): Promise<AnomalyFlag[]> {
  const supabase = createServiceClient();
  const since = new Date(Date.now() - 60 * 86400_000).toISOString().slice(0, 10);

  const { data: cancelled, error } = await supabase
    .from('subscriptions')
    .select('id, merchant')
    .eq('user_id', userId)
    .eq('status', 'cancelled');
  if (error) throw new Error(error.message);
  if (!cancelled || cancelled.length === 0) return [];

  const ids = cancelled.map((c) => c.id);
  const { data: txns } = await supabase
    .from('transactions')
    .select('id, merchant, amount, date, subscription_id')
    .eq('user_id', userId)
    .gte('date', since)
    .in('subscription_id', ids);

  return (txns ?? []).map((t) => ({
    transactionId: t.id,
    reason: 'subscription_after_cancel' as const,
    score: 0.9,
    detail: `Charge of $${Number(t.amount).toFixed(2)} at ${t.merchant ?? 'unknown'} after subscription was cancelled.`,
  }));
}

function normMerchant(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw.toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function withinDays(a: string, b: string, days: number): boolean {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) <= days * 86400_000;
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
