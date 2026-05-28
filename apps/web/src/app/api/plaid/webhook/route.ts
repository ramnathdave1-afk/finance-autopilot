// Plaid webhook receiver (PRD §13, §17).
// - Reads raw body so JWT signature verification (request_body_sha256) is exact.
// - Returns 200 ALWAYS. Plaid retries on 5xx — we don't want stampedes.

import { NextResponse } from "next/server";
import { handlePlaidWebhook, verifyPlaidJwt } from "@fa/plaid";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<NextResponse> {
  const rawBody = await req.text();
  const verificationHeader = req.headers.get("plaid-verification");

  try {
    const ok = await verifyPlaidJwt(verificationHeader, rawBody);
    if (!ok) {
      // Always 200 to prevent retries; surface the rejection in the body.
      return NextResponse.json({ ok: false, reason: "invalid_signature" }, { status: 200 });
    }

    const body = JSON.parse(rawBody) as unknown;
    const result = await handlePlaidWebhook(body);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error(`[plaid-webhook] error tag=${e instanceof Error ? e.name : "Unknown"}`);
    return NextResponse.json({ ok: false, reason: "internal" }, { status: 200 });
  }
}
