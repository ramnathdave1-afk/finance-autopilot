// PRD §8.4 Agent 16 — Human Backup.
//
// The escalation / queue agent. When any OTHER agent fails or escalates (an
// agent_action in status 'failed' / 'escalated'), or the existing
// reconnect_bank reauth flow fires (@fa/plaid/router emits those onto this same
// human_backup agent), Human Backup routes the action to a human-review queue:
//   1. ensure the user has a human_backup agent row,
//   2. for each not-yet-queued failure, park an `awaiting_approval` 'human_review'
//      action (the human-review state in this schema),
//   3. record a 24h SLA deadline (PRD §8.4) in the audit log,
//   4. notify the user that a human is taking over,
//   5. flag any already-queued entry whose 24h SLA has now breached.
//
// LEAN / RECOMMEND-ONLY (PRD §8.4): this agent moves no money and takes no
// autonomous action on the user's accounts. It only changes agent_actions
// queue state + notifies. requiresApproval:true — a human still has to act.
//
// HONESTY: there is no external integration in the routing logic. The only
// outbound side-effect is notifyUser (Expo/OneSignal), which fails loudly when
// uncredentialed and is mocked in tests; a notify failure is logged, never faked.

import { defineAgent, type AgentDefinition, notifyUser } from '@fa/inngest';
import {
  getRoutableFailures,
  getQueueEntries,
  getOpenQueueRows,
  ensureHumanBackupAgent,
  enqueueForHuman,
  markBreached,
} from './queue-store';
import {
  SLA_HOURS,
  slaDeadline,
  isSlaBreached,
  selectToEnqueue,
  queueKey,
  routeReason,
} from './sla';

export interface HumanBackupInput {
  /** The user whose failed/escalated actions get swept into the queue. */
  userId: string;
  /** Override the SLA window (hours). Defaults to 24 (PRD §8.4). */
  slaHours?: number;
  /** Override "now" for deterministic tests. ISO string. */
  nowIso?: string;
}

export interface QueuedItem {
  /** The new human_review queue action id. */
  queueActionId: string;
  /** The source action that was routed. */
  sourceActionId: string;
  reason: string;
  /** 24h SLA deadline (ISO). */
  slaDeadline: string;
}

export interface HumanBackupData {
  /** Failed/escalated actions found this sweep. */
  candidateCount: number;
  /** Actions newly routed to a human this run. */
  enqueued: QueuedItem[];
  /** Source actions skipped because already queued. */
  alreadyQueuedCount: number;
  /** Open queue entries whose 24h SLA has now breached. */
  breachedCount: number;
}

export const humanBackupAgent: AgentDefinition<HumanBackupInput> = defineAgent<HumanBackupInput>({
  type: 'human_backup',
  actionType: 'route_to_human',
  // The SWEEP itself is an automated, informational pass (like daily_brief /
  // missing_money detection) — it must run without approval so it can react to
  // failures unattended. The QUEUE ENTRIES it creates are what carry
  // requiresApproval:true (a human must pick each up). Mirrors how
  // @fa/plaid/router parks reconnect_bank actions: the carrier sweep is
  // automatic; the parked action awaits a human.
  requiresApproval: false,
  // One sweep per user per run; DB idempotency on each queued entry handles re-runs.
  idempotencyKey: (i) => `human-backup:sweep:${i.userId}`,
  run: async (input, ctx) => {
    const nowIso = input.nowIso ?? new Date().toISOString();
    const slaHours = input.slaHours ?? SLA_HOURS;

    await ctx.log('sweep:start', true, { userId: input.userId, slaHours });

    // 1. Gather failures to route + the existing queue snapshot.
    const [candidates, existingQueue] = await Promise.all([
      getRoutableFailures(input.userId),
      getQueueEntries(input.userId),
    ]);
    await ctx.log('sweep:scanned', true, {
      candidateCount: candidates.length,
      queueSize: existingQueue.length,
    });

    // 2. Dedupe: only route failures that don't already have a queue entry.
    const toEnqueue = selectToEnqueue(candidates, existingQueue);
    const alreadyQueuedCount = candidates.length - toEnqueue.length;

    // 3. Enqueue each, recording the 24h SLA deadline in the audit log.
    const humanBackupAgentId =
      toEnqueue.length > 0 ? await ensureHumanBackupAgent(input.userId) : null;
    const enqueued: QueuedItem[] = [];
    for (const src of toEnqueue) {
      const deadline = slaDeadline(nowIso, slaHours);
      const reason = routeReason(src);
      const { id: queueActionId } = await enqueueForHuman({
        userId: input.userId,
        humanBackupAgentId: humanBackupAgentId!,
        sourceActionId: src.id,
        idempotencyKey: queueKey(src),
        target: src.target,
      });
      await ctx.log('queue:enqueued', true, {
        queueActionId,
        sourceActionId: src.id,
        sourceAgentType: src.agent_type,
        reason,
        slaDeadline: deadline,
      });

      // 4. Notify — best-effort. A notify failure must not undo the enqueue,
      //    but we never pretend it succeeded.
      try {
        const res = await notifyUser(input.userId, {
          title: 'A human is taking over',
          body: `We hit a snag on "${src.target ?? src.action_type}". A team member will handle it within ${slaHours} hours.`,
          data: { kind: 'human_backup', sourceActionId: src.id, reason, slaDeadline: deadline },
        });
        await ctx.log('queue:notified', res.delivered !== 'none', {
          sourceActionId: src.id,
          delivered: res.delivered,
          ...(res.reason ? { reason: res.reason } : {}),
        });
      } catch (e) {
        await ctx.log('queue:notify_error', false, {
          sourceActionId: src.id,
          error: e instanceof Error ? e.message : String(e),
        });
      }

      enqueued.push({ queueActionId, sourceActionId: src.id, reason, slaDeadline: deadline });
    }

    // 5. SLA-breach detection across already-open queue entries. Each entry's
    //    deadline = its requested_at + slaHours; flag any now past it.
    const breached = await detectBreaches(input.userId, nowIso, slaHours, ctx);

    const data: HumanBackupData = {
      candidateCount: candidates.length,
      enqueued,
      alreadyQueuedCount,
      breachedCount: breached,
    };

    await ctx.log('sweep:done', true, {
      enqueued: enqueued.length,
      alreadyQueuedCount,
      breachedCount: breached,
    });

    // No ROI: routing to a human delivers no dollar amount itself.
    return { roi: null, data: data as unknown as Record<string, unknown> };
  },
});

/**
 * Flag open human_review queue entries that have blown their 24h SLA. Reads the
 * queue rows directly (with requested_at) so the deadline is derived from when
 * the entry was created. Marks each breached entry escalated.
 */
async function detectBreaches(
  userId: string,
  nowIso: string,
  slaHours: number,
  ctx: { log: (s: string, ok: boolean, d?: Record<string, unknown>) => Promise<void> },
): Promise<number> {
  const open = await getOpenQueueRows(userId);
  let breached = 0;
  for (const row of open) {
    const deadline = slaDeadline(row.requested_at, slaHours);
    if (isSlaBreached(deadline, nowIso)) {
      await markBreached(row.id, deadline);
      await ctx.log('sla:breached', false, { queueActionId: row.id, deadline });
      breached += 1;
    }
  }
  return breached;
}
