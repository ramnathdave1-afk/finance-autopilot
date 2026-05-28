"use server";
import { z } from "zod";
import { createServiceClient } from "@fa/db";
import { hasSupabaseEnv } from "@/lib/data/env";

const Input = z.object({
  email: z.string().email(),
  source: z.string().nullable().optional(),
  referrer: z.string().nullable().optional()
});

export async function joinWaitlistAction(formData: FormData): Promise<{ ok: boolean; founderLocked: boolean; rank?: number; error?: string }> {
  const parsed = Input.safeParse({
    email: formData.get("email"),
    source: formData.get("source") ?? null,
    referrer: formData.get("referrer") ?? null
  });
  if (!parsed.success) return { ok: false, founderLocked: false, error: "Enter a valid email" };

  if (!hasSupabaseEnv()) {
    return { ok: true, founderLocked: true, rank: 1 };
  }

  try {
    const supabase = createServiceClient();
    const { count } = await supabase
      .from("waitlist_signups")
      .select("id", { count: "exact", head: true });
    const currentCount = count ?? 0;
    const founderLocked = currentCount < 100;

    const { error } = await supabase.from("waitlist_signups").insert({
      email: parsed.data.email,
      source: parsed.data.source ?? null,
      referrer: parsed.data.referrer ?? null,
      founder_locked: founderLocked
    });
    if (error) return { ok: false, founderLocked: false, error: error.message };
    return { ok: true, founderLocked, rank: currentCount + 1 };
  } catch (e) {
    return { ok: false, founderLocked: false, error: e instanceof Error ? e.message : "save failed" };
  }
}

export async function getWaitlistCount(): Promise<number> {
  if (!hasSupabaseEnv()) return 47;
  try {
    const supabase = createServiceClient();
    const { count } = await supabase
      .from("waitlist_signups")
      .select("id", { count: "exact", head: true });
    return count ?? 0;
  } catch {
    return 0;
  }
}
