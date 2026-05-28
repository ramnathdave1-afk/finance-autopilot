// Realtime publisher — Supabase Realtime channel per user.
//
// Used by the router + agent transition callbacks to push live status updates
// to a logged-in user's session. The web app subscribes via
// apps/web/src/lib/realtime.ts and re-renders the feed without polling.
//
// Channel naming: `agent_actions:user:${userId}`. Anyone with a valid session
// + that user id (RLS-enforced via Supabase) can subscribe.
//
// Event shape on the wire:
//   { type: 'agent_action.updated', actionId, status, agentType, actionType, roi? }
//
// Test seam: setRealtimePublisher() lets tests capture publishes without a
// real Supabase connection.

import { createServiceClient } from '@fa/db';
import type { ActionStatus, AgentType } from '@fa/db/types';

export interface RealtimeUpdate {
  type: 'agent_action.updated';
  actionId: string;
  userId: string;
  status: ActionStatus;
  agentType: AgentType;
  actionType: string;
  roi?: number | null;
  voiceRecordingUrl?: string | null;
}

export interface RealtimePublisher {
  publish(update: RealtimeUpdate): Promise<void>;
}

class SupabaseRealtimePublisher implements RealtimePublisher {
  async publish(update: RealtimeUpdate): Promise<void> {
    const supabase = createServiceClient();
    const channel = supabase.channel(`agent_actions:user:${update.userId}`);
    // `send` requires subscribing first; for server-side broadcasts we can
    // use the Realtime Broadcast REST API via the helper.
    await channel.send({
      type: 'broadcast',
      event: update.type,
      payload: update,
    });
    // No need to keep the channel alive — one-shot broadcast.
    await supabase.removeChannel(channel);
  }
}

let _publisher: RealtimePublisher = new SupabaseRealtimePublisher();

export function setRealtimePublisher(p: RealtimePublisher): void {
  _publisher = p;
}
export function _resetRealtimePublisher(): void {
  _publisher = new SupabaseRealtimePublisher();
}

/** Fire-and-forget publish. Swallows errors — realtime is best-effort, not authoritative. */
export async function publishAgentActionUpdate(update: RealtimeUpdate): Promise<void> {
  try {
    await _publisher.publish(update);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(`[realtime] publish failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}
