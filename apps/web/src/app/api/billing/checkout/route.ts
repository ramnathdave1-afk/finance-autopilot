import { NextResponse } from "next/server";
import { z } from "zod";

// Stub — T5 wires this to Stripe Checkout. Until then, returns a placeholder
// that the upgrade page can treat as "go look at the paywall page" so the
// user-facing flow isn't dead.

const Body = z.object({
  tier: z.enum(["autopilot", "pro", "premium"]),
  billing: z.enum(["monthly", "annual"])
});

export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  // TODO(T5): Replace with stripe.checkout.sessions.create({...}) call.
  const { tier, billing } = parsed.data;
  return NextResponse.json({
    url: `/paywall?intent=${tier}&billing=${billing}`,
    placeholder: true
  });
}
