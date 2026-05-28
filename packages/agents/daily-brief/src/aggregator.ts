// Pure aggregator: pulls the three numbers Agent 6 needs to brief the user.
// Pulled out into its own file so tests can exercise the SQL shape against a
// mocked supabase client without going through defineAgent/runAgent.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@fa/db/types';

export interface UpcomingBill {
  merchant: string;
  amount: number;
  /** ISO date string of next expected charge. */
  dueAt: string;
}

export interface CompletedAction {
  agentType: string;
  actionType: string;
  roi: number | null;
  target: string | null;
}

export interface DailyBriefAggregate {
  yesterdaySpend: number;
  upcomingBills: UpcomingBill[];
  completedActions: CompletedAction[];
}

type DbClient = SupabaseClient<Database>;

function dateOnly(d: Date): string {
  // YYYY-MM-DD — transactions.date is a date column, not a timestamp.
  return d.toISOString().slice(0, 10);
}

/**
 * Aggregate the inputs to the morning brief. `now` is injectable for tests.
 *
 * - yesterdaySpend: sum of positive transaction amounts dated YYYY-MM-DD = yesterday.
 * - upcomingBills: subscriptions whose next expected charge (last_charged_at + frequency)
 *   falls in the next 24h, capped at 5.
 * - completedActions: agent_actions with status='succeeded' in the last 24h.
 */
export async function aggregateDailyBrief(
  userId: string,
  supabase: DbClient,
  now: Date = new Date(),
): Promise<DailyBriefAggregate> {
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  const last24hIso = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const next24hIso = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

  // 1. Yesterday's spend — positive amounts only (debits).
  const { data: txns, error: txErr } = await supabase
    .from('transactions')
    .select('amount')
    .eq('user_id', userId)
    .eq('date', dateOnly(yesterday))
    .gt('amount', 0);
  if (txErr) throw new Error(`aggregate:transactions ${txErr.message}`);

  const yesterdaySpend = (txns ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0);

  // 2. Upcoming bills — active subscriptions due in next 24h.
  const { data: subs, error: subErr } = await supabase
    .from('subscriptions')
    .select('merchant, amount, frequency, last_charged_at')
    .eq('user_id', userId)
    .eq('status', 'active');
  if (subErr) throw new Error(`aggregate:subscriptions ${subErr.message}`);

  const upcomingBills: UpcomingBill[] = [];
  for (const s of subs ?? []) {
    const due = nextDueAt(s.last_charged_at, s.frequency, now);
    if (!due) continue;
    if (due.getTime() >= now.getTime() && due.getTime() <= now.getTime() + 24 * 60 * 60 * 1000) {
      upcomingBills.push({
        merchant: s.merchant,
        amount: Number(s.amount ?? 0),
        dueAt: due.toISOString(),
      });
    }
  }
  upcomingBills.sort((a, b) => a.dueAt.localeCompare(b.dueAt));

  // 3. Completed agent actions in the last 24h.
  const { data: acts, error: actErr } = await supabase
    .from('agent_actions')
    .select('agent_type, action_type, roi_amount, target, completed_at, status')
    .eq('user_id', userId)
    .eq('status', 'succeeded')
    .gte('completed_at', last24hIso)
    .lte('completed_at', next24hIso);
  if (actErr) throw new Error(`aggregate:actions ${actErr.message}`);

  const completedActions: CompletedAction[] = (acts ?? []).map((a) => ({
    agentType: a.agent_type as string,
    actionType: a.action_type as string,
    roi: a.roi_amount == null ? null : Number(a.roi_amount),
    target: (a.target as string | null) ?? null,
  }));

  return { yesterdaySpend, upcomingBills, completedActions };
}

/** Exposed for testing. */
export function nextDueAt(
  lastChargedAt: string | null,
  frequency: string,
  now: Date,
): Date | null {
  if (!lastChargedAt) return null;
  const last = new Date(lastChargedAt);
  if (Number.isNaN(last.getTime())) return null;

  const step =
    frequency === 'weekly' ? 7 :
    frequency === 'monthly' ? 30 :
    frequency === 'annual' ? 365 :
    null;
  if (step == null) return null;

  // Advance last_charged_at by `step` days until it's >= now.
  const due = new Date(last);
  while (due.getTime() < now.getTime()) {
    due.setDate(due.getDate() + step);
  }
  return due;
}

