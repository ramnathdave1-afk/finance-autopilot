// Stripe Customer Portal session (PRD §13).

import { NextResponse } from "next/server";
import { createPortalSession } from "@fa/stripe";
import { requireUser, UnauthorizedError } from "@/lib/api/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const { user } = await requireUser();
    const origin = req.headers.get("origin") ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const result = await createPortalSession({ userId: user.id, returnUrl: `${origin}/settings/billing` });
    return NextResponse.json({ url: result.url });
  } catch (e) {
    if (e instanceof UnauthorizedError) return e.response;
    const msg = e instanceof Error ? e.message : "internal_error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
