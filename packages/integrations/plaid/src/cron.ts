// Cron entrypoints for Plaid + multi-provider sync.
//
// Two schedules per PRD §20:
//   - Hourly:  incremental syncUser(userId) per active user
//   - Nightly: full syncAll() across every active provider item, plus
//              detectAndQueueReauth() and snapshotAllUsers()
//
// apps/web's Inngest API route registers these via inngest.createFunction.
// The local handlers below are also directly callable so a Vercel cron route
// can hit them without going through Inngest if needed.

import { createServiceClient, snapshotAllUsers } from '@fa/db';
import { syncItemForProvider, detectAndQueueReauth } from './router';

export interface CronResult {
  ok: boolean;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  details: Record<string, unknown>;
}

/** Nightly: every active provider item gets a full sync + reauth sweep + net-worth snapshots. */
export async function nightlySyncHandler(): Promise<CronResult> {
  const startedAt = new Date();
  const supabase = createServiceClient();

  const { data: items, error } = await supabase
    .from('provider_items')
    .select('id')
    .in('status', ['active', 'login_required']);
  if (error) throw new Error(error.message);

  let added = 0;
  let failed = 0;
  for (const item of items ?? []) {
    try {
      const r = await syncItemForProvider(item.id);
      added += r.added;
    } catch {
      failed += 1;
    }
  }

  const reauth = await detectAndQueueReauth();
  const snaps = await snapshotAllUsers();

  const finishedAt = new Date();
  return {
    ok: true,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    details: {
      items: (items ?? []).length,
      itemsAdded: added,
      itemsFailed: failed,
      reauth,
      snapshots: snaps,
    },
  };
}

/** Hourly: one item per call, fanned out per user (Inngest does the fan-out). */
export async function hourlySyncUserHandler(userId: string): Promise<CronResult> {
  const startedAt = new Date();
  const supabase = createServiceClient();

  const { data: items, error } = await supabase
    .from('provider_items')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'active');
  if (error) throw new Error(error.message);

  let added = 0;
  let failed = 0;
  for (const item of items ?? []) {
    try {
      const r = await syncItemForProvider(item.id);
      added += r.added;
    } catch {
      failed += 1;
    }
  }

  const finishedAt = new Date();
  return {
    ok: true,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    details: { items: (items ?? []).length, added, failed },
  };
}

// ===== Inngest function bindings =====
// These are imported by apps/web's /api/inngest route and passed to
// inngest.createFunction. Keeping the wiring here means cron schedule changes
// don't require app-layer edits.

export const cronSpecs = {
  nightly: {
    id: 'plaid-nightly-sync',
    name: 'Plaid nightly full sync + snapshots',
    /** 03:00 UTC daily */
    cron: '0 3 * * *',
    handler: nightlySyncHandler,
  },
  hourly: {
    id: 'plaid-hourly-sync',
    name: 'Plaid hourly incremental sync (fan-out per user)',
    /** Every hour on the hour */
    cron: '0 * * * *',
    /**
     * Hourly job emits a fan-out event per user; apps/web's Inngest route
     * registers a `plaid.user.sync` handler that calls hourlySyncUserHandler.
     */
    eventName: 'plaid.user.sync',
    handler: async () => {
      const supabase = createServiceClient();
      const { data, error } = await supabase
        .from('provider_items')
        .select('user_id')
        .eq('status', 'active');
      if (error) throw new Error(error.message);
      const userIds = Array.from(new Set((data ?? []).map((r: { user_id: string }) => r.user_id)));
      return { fanOut: userIds.length, userIds };
    },
  },
} as const;
