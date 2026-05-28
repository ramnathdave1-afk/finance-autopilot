import "server-only";
import { createServiceClient } from "@fa/db";
import { hasSupabaseEnv } from "./env";

export async function getPauseAll(userId: string): Promise<boolean> {
  if (!hasSupabaseEnv()) return false;
  try {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from("users")
      .select("pause_all_agents")
      .eq("id", userId)
      .maybeSingle();
    const row = data as { pause_all_agents?: boolean } | null;
    return Boolean(row?.pause_all_agents);
  } catch {
    return false;
  }
}
