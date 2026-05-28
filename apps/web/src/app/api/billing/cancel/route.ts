import { NextResponse } from "next/server";

// Stub — T5 wires this to Stripe subscription cancel. UI already shows the
// "cancelled" confirmation regardless; this endpoint just records intent.

export async function POST() {
  // TODO(T5): stripe.subscriptions.update(id, { cancel_at_period_end: true })
  return NextResponse.json({ ok: true, placeholder: true });
}
