"use server";
import { revalidatePath } from "next/cache";
import { createServiceClient } from "@fa/db";
import { hasSupabaseEnv } from "@/lib/data/env";
import { currentUserId } from "@/lib/current-user";

export interface NotificationPrefs {
  voice_briefing_enabled: boolean;
  briefing_time_local: string;
}

export async function saveNotificationPrefs(prefs: NotificationPrefs): Promise<{ ok: boolean; error?: string }> {
  if (!hasSupabaseEnv()) return { ok: true };
  try {
    const userId = await currentUserId();
    const supabase = createServiceClient();
    const { error } = await supabase
      .from("users")
      .update({
        voice_briefing_enabled: prefs.voice_briefing_enabled,
        briefing_time_local: prefs.briefing_time_local
      })
      .eq("id", userId);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/app/settings/notifications");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "save failed" };
  }
}
