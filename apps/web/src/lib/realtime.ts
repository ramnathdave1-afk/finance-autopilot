"use client";

// Client hook for the Supabase Realtime channel that the inngest router
// publishes to (`agent_actions:user:${userId}`). Subscribers re-render the
// feed without polling.
//
// Wire-shape MUST match @fa/inngest's RealtimeUpdate:
//   { type: 'agent_action.updated', actionId, userId, status,
//     agentType, actionType, roi?, voiceRecordingUrl? }

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export interface AgentActionUpdate {
  type: "agent_action.updated";
  actionId: string;
  userId: string;
  status: string;
  agentType: string;
  actionType: string;
  roi?: number | null;
  voiceRecordingUrl?: string | null;
}

/**
 * Subscribe to live agent_action updates for the current user. Returns the
 * last N updates (default 20) in reverse chronological order so the feed can
 * splice them in without a refetch.
 */
export function useAgentActionsStream(userId: string | null | undefined, max = 20): AgentActionUpdate[] {
  const [updates, setUpdates] = useState<AgentActionUpdate[]>([]);
  const ref = useRef<AgentActionUpdate[]>([]);

  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();
    const channel = supabase.channel(`agent_actions:user:${userId}`);

    channel
      .on("broadcast", { event: "agent_action.updated" }, (payload) => {
        const u = (payload?.payload ?? payload) as AgentActionUpdate;
        if (!u || u.type !== "agent_action.updated") return;
        ref.current = [u, ...ref.current].slice(0, max);
        setUpdates(ref.current);
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, max]);

  return updates;
}
