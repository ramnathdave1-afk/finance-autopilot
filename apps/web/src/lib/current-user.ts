import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface CurrentUser {
  id: string;
  email: string | null;
  isDemo: boolean;
}

// Returns the signed-in user, or a demo identity when running without auth env.
// Letting fetchers fall back to stubs keeps prerender + local dev usable.
export async function currentUser(): Promise<CurrentUser> {
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    if (data?.user?.id) {
      return { id: data.user.id, email: data.user.email ?? null, isDemo: false };
    }
  } catch {
    // env missing or session not set
  }
  return { id: "demo-user", email: null, isDemo: true };
}

export async function currentUserId(): Promise<string> {
  return (await currentUser()).id;
}
