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
 *
 * Two auth transports are supported:
 *   - Web: the session lives in cookies (handled by the SSR client).
 *   - Mobile: the session is sent as `Authorization: Bearer <access_token>`
 *     (apps/mobile/src/lib/api.ts) with no cookies. Pass the `Request` so the
 *     bearer token can be validated. The cookie path is the fallback.
 */
export async function requireUser(req?: Request): Promise<{ user: User; supabase: SupabaseClient }> {
  const supabase = await createClient();

  const authz = req?.headers.get("authorization");
  if (authz?.startsWith("Bearer ")) {
    const token = authz.slice("Bearer ".length).trim();
    if (token) {
      const { data, error } = await supabase.auth.getUser(token);
      if (!error && data?.user) return { user: data.user, supabase };
    }
    // A malformed/expired bearer token is unauthorized — don't silently
    // fall through to the (empty) cookie session in the mobile case.
    throw new UnauthorizedError();
  }

  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) throw new UnauthorizedError();
  return { user: data.user, supabase };
}
