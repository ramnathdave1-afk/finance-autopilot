import "server-only";
import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export class UnauthorizedError extends Error {
  readonly response: NextResponse;
  constructor() {
    super("unauthorized");
    this.response = NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
}

/**
 * Resolve the signed-in Supabase user. Throws `UnauthorizedError` (whose
 * `.response` is a 401 NextResponse) when no session is present. Route
 * handlers should `catch (e) { if (e instanceof UnauthorizedError) return e.response; throw e; }`.
 */
export async function requireUser(): Promise<{ user: User; supabase: SupabaseClient }> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) throw new UnauthorizedError();
  return { user: data.user, supabase };
}
