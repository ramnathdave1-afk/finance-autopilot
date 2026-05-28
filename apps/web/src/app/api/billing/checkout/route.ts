// Stripe Checkout session creator (PRD §7, §13).
// Replaces the original stub at this path. The real Stripe SDK calls flow
// through @fa/stripe's adapter (production must install RealStripeAdapter).

import { NextResponse } from "next/server";
import { z } from "zod";
import { createCheckoutSession } from "@fa/stripe";
import { requireUser, UnauthorizedError } from "@/lib/api/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  tier: z.enum(["autopilot", "pro", "premium"]),
  billingCycle: z.enum(["monthly", "annual"]),
});

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const { user } = await requireUser();
    const json = await req.json().catch(() => null);
    const parsed = Body.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }

    const origin = req.headers.get("origin") ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const result = await createCheckoutSession({
      userId: user.id,
      requestedTier: parsed.data.tier,
      billingCycle: parsed.data.billingCycle,
      successUrl: `${origin}/upgrade/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${origin}/upgrade`,
    });
    return NextResponse.json({ url: result.url, sessionId: result.sessionId });
  } catch (e) {
    if (e instanceof UnauthorizedError) return e.response;
    const msg = e instanceof Error ? e.message : "internal_error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
