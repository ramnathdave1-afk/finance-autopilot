"use server";
import { revalidatePath } from "next/cache";
import { setPauseAll } from "@fa/db";
import { hasSupabaseEnv } from "@/lib/data/env";
import { currentUserId } from "@/lib/current-user";

export async function setPauseAllAction(paused: boolean): Promise<{ ok: boolean }> {
  if (!hasSupabaseEnv()) return { ok: true };
  try {
    const userId = await currentUserId();
    await setPauseAll(userId, paused);
    revalidatePath("/app");
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
