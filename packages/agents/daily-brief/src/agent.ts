// Agent 6 — Daily Briefing (PRD §8.2)
// Read-only, no approval required. Sent once per user per day at their local
// briefing time. Idempotency key = brief:<YYYY-MM-DD>:<window> so a re-run
// (cron retry, manual fire) maps to the same agent_actions row.

import { createServiceClient } from '@fa/db';
import { defineAgent, sendPush, type AgentDefinition } from '@fa/inngest';
import { call as claudeCall, FAST_MODEL } from '@fa/claude';
import { aggregateDailyBrief, type DailyBriefAggregate } from './aggregator';

export interface DailyBriefInput {
  window?: 'morning' | 'evening';
  /** Override for tests/cron — defaults to new Date(). */
  now?: string;
}

export interface DailyBriefData {
  brief: string;
  sentAt: string;
  aggregate: DailyBriefAggregate;
}

function todayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export const dailyBriefAgent: AgentDefinition<DailyBriefInput> = defineAgent<DailyBriefInput>({
  type: 'daily_brief',
  actionType: 'send_brief',
  requiresApproval: false,
  idempotencyKey: (i) => {
    const now = i.now ? new Date(i.now) : new Date();
    const window = i.window ?? 'morning';
    return `brief:${todayKey(now)}:${window}`;
  },
  run: async (input, ctx) => {
    const now = input.now ? new Date(input.now) : new Date();
    const window = input.window ?? 'morning';

    await ctx.log('aggregate:start', true, { window });
    const supabase = createServiceClient();
    const agg = await aggregateDailyBrief(ctx.userId, supabase, now);
    await ctx.log('aggregate:done', true, {
      yesterdaySpend: agg.yesterdaySpend,
      upcomingBillsCount: agg.upcomingBills.length,
      completedActionsCount: agg.completedActions.length,
    });

    const brief = await composeBrief(agg, window);
    await ctx.log('claude:done', true, { length: brief.length });

    const title = window === 'morning' ? 'Good morning' : 'Evening recap';
    await sendPush(ctx.userId, {
      title,
      body: brief,
      data: { kind: 'daily_brief', window },
    });
    const sentAt = new Date().toISOString();
    await ctx.log('push:sent', true, { sentAt });

    const data: DailyBriefData = { brief, sentAt, aggregate: agg };
    return { roi: null, data: data as unknown as Record<string, unknown> };
  },
});

/** Build the Claude prompt + call. Exposed so tests can target it directly. */
export async function composeBrief(
  agg: DailyBriefAggregate,
  window: 'morning' | 'evening',
): Promise<string> {
  const billsLine =
    agg.upcomingBills.length === 0
      ? 'No bills due in the next 24h.'
      : agg.upcomingBills
          .map((b) => `- ${b.merchant}: $${b.amount.toFixed(2)} due ${b.dueAt.slice(0, 10)}`)
          .join('\n');

  const actionsLine =
    agg.completedActions.length === 0
      ? 'No agent actions completed in the last 24h.'
      : agg.completedActions
          .map((a) => {
            const roi = a.roi == null ? '' : ` (saved $${a.roi.toFixed(2)})`;
            return `- ${a.agentType}/${a.actionType}${roi}${a.target ? ` — ${a.target}` : ''}`;
          })
          .join('\n');

  const system =
    'You are the user\'s personal finance briefing assistant. Write a concise, ' +
    'friendly 2-3 sentence brief in plain English. No markdown, no lists, no ' +
    'emojis. Lead with the most important fact. Never invent numbers.';

  const user = [
    `Window: ${window}`,
    `Yesterday's spend: $${agg.yesterdaySpend.toFixed(2)}`,
    '',
    'Upcoming bills (next 24h):',
    billsLine,
    '',
    'Agent actions in last 24h:',
    actionsLine,
  ].join('\n');

  const res = await claudeCall({
    model: FAST_MODEL,
    system,
    user,
    maxTokens: 200,
    temperature: 0.5,
    tag: 'daily_brief',
  });
  return res.text.trim();
}
