// Stripe webhook receiver (PRD §13, §17).
//
// Hard requirements:
//   - Raw body (do NOT JSON.parse — signature is computed over raw bytes).
//   - Verify signature with the Stripe SDK BEFORE doing anything else.
//   - 400 on signature failure. NEVER 5xx — Stripe retries on 5xx and we'd
//     stampede our own handlers.
//   - nodejs runtime, force-dynamic — webhooks need real Node + raw Buffer.

import { NextResponse } from "next/server";
import Stripe from "stripe";
import { handleWebhook } from "@fa/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<NextResponse> {
  const sig = req.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!sig || !secret) {
    return NextResponse.json({ error: "missing signature or secret" }, { status: 400 });
  }

  const rawBody = await req.text();

  // Verify signature at the route boundary with the official SDK. This is a
  // cheap fast-fail that never reaches the @fa/stripe layer for forged bodies.
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "sk_test_placeholder", {
    apiVersion: "2024-12-18.acacia" as Stripe.LatestApiVersion,
  });
  try {
    stripe.webhooks.constructEvent(rawBody, sig, secret);
  } catch {
    // Never log the body or signature. Plain 400.
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  try {
    const result = await handleWebhook(rawBody, sig, secret);
    return NextResponse.json({ ok: true, eventId: result.eventId, processed: result.processed });
  } catch (e) {
    // Internal dispatch error — return 200 so Stripe doesn't retry forever
    // on a permanently-bad event. We log a redacted error tag for ops.
    const tag = e instanceof Error ? e.name : "Unknown";
    console.error(`[stripe-webhook] dispatch_error tag=${tag}`);
    return NextResponse.json({ ok: false, reason: "dispatch_error" }, { status: 200 });
  }
}
