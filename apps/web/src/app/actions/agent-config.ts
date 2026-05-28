"use server";
import { revalidatePath } from "next/cache";
import { upsertAgent } from "@fa/db";
import type { AgentType, ConsentMode } from "@fa/db/types";
import { hasSupabaseEnv } from "@/lib/data/env";
import { currentUserId } from "@/lib/current-user";

export async function saveAgentConfig(
  agentType: AgentType,
  consent: ConsentMode,
  enabled: boolean
): Promise<{ ok: boolean; error?: string }> {
  if (!hasSupabaseEnv()) return { ok: true };
  try {
    const userId = await currentUserId();
    await upsertAgent(userId, agentType, consent, enabled);
    revalidatePath("/app/settings/agents");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "save failed" };
  }
}
