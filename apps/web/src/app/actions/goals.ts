"use server";
import { revalidatePath } from "next/cache";
import { createServiceClient } from "@fa/db";
import { hasSupabaseEnv } from "@/lib/data/env";
import { currentUserId } from "@/lib/current-user";

export interface GoalInput {
  name: string;
  targetAmount: number;
  targetDate: string | null;
}

export async function saveGoalsAction(goals: GoalInput[]): Promise<{ ok: boolean; error?: string }> {
  if (!hasSupabaseEnv()) return { ok: true };
  try {
    const userId = await currentUserId();
    const supabase = createServiceClient();
    const rows = goals
      .filter((g) => g.name && g.targetAmount > 0)
      .map((g) => ({
        user_id: userId,
        name: g.name,
        target_amount: g.targetAmount,
        target_date: g.targetDate,
        current_amount: 0,
        monthly_funding: 0,
        status: "active"
      }));
    if (rows.length === 0) return { ok: true };
    const { error } = await supabase.from("goals").insert(rows);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/onboarding");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "save failed" };
  }
}
