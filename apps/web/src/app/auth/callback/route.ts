import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { identify, track } from "@/lib/analytics/posthog";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/app";
  if (code) {
    const supabase = await createClient();
    const { data } = await supabase.auth.exchangeCodeForSession(code);
    // Conversion event (PRD §19): the email-confirmation callback is the
    // server-side completion of signup — the first point we hold a confirmed
    // user id. Bind the distinct id + fire signup_completed. Fire-and-forget;
    // no-op without a PostHog key, never blocks the redirect.
    const userId = data?.user?.id;
    if (userId) {
      void identify(userId, data?.user?.email ? { email: data.user.email } : undefined);
      void track(userId, "signup_completed", {});
    }
  }
  return NextResponse.redirect(`${origin}${next}`);
}
