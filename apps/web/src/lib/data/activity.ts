import "server-only";
import { createServiceClient } from "@fa/db";
import { hasSupabaseEnv } from "./env";

export type ActivityRow = {
  id: string;
  agent: string;
  title: string;
  status: string;
  roi: number;
  at: string;
};

export async function getActivityLog(userId: string, limit = 50): Promise<ActivityRow[]> {
  if (!hasSupabaseEnv()) return [];
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("agent_actions")
      .select("id, agent_type, action_type, target, status, roi_amount, requested_at, completed_at")
      .eq("user_id", userId)
      .order("requested_at", { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return data.map((row) => {
      const r = row as {
        id: string;
        agent_type: string;
        action_type: string;
        target: string | null;
        status: string;
        roi_amount: number | null;
        requested_at: string;
        completed_at: string | null;
      };
      return {
        id: r.id,
        agent: r.agent_type,
        title: r.target ? `${r.action_type}: ${r.target}` : r.action_type,
        status: r.status,
        roi: r.roi_amount ?? 0,
        at: r.completed_at ?? r.requested_at
      };
    });
  } catch {
    return [];
  }
}
