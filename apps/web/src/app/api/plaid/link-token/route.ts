// Plaid Link token (PRD §13). Auth-gated.

import { NextResponse } from "next/server";
import { createLinkToken } from "@fa/plaid";
import { requireUser, UnauthorizedError } from "@/lib/api/auth";
import { hasSupabaseEnv } from "@/lib/data/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(): Promise<NextResponse> {
  // Local dev fallback so the onboarding flow isn't dead without keys.
  if (!hasSupabaseEnv() || !process.env.PLAID_CLIENT_ID) {
    return NextResponse.json({ link_token: "sandbox-placeholder", placeholder: true });
  }
  try {
    const { user } = await requireUser();
    const token = await createLinkToken(user.id);
    return NextResponse.json(token);
  } catch (e) {
    if (e instanceof UnauthorizedError) return e.response;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "link_token_failed" },
      { status: 500 },
    );
  }
}
