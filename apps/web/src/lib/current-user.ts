import "server-only";
import { createClient } from "@/lib/supabase/server";

// Returns the signed-in user id, or a demo id when running without auth env.
// Letting fetchers fall back to stubs keeps prerender + local dev usable.
export async function currentUserId(): Promise<string> {
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    if (data?.user?.id) return data.user.id;
  } catch {
    // env missing or session not set
  }
  return "demo-user";
}
