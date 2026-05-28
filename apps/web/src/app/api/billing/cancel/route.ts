// One-click cancel (PRD §9 Story 4, §14).
//
// ANTI-CLEO GUARANTEE: this route MUST NOT return retention copy, retention
// links, or any "are you sure" follow-ups. The response shape is the typed
// `OneClickCancelResult` from @fa/stripe — `retentionPrompts` is structurally
// constrained to `never[]` and is passed through verbatim.

import { NextResponse } from "next/server";
import { oneClickCancel } from "@fa/stripe";
import { requireUser, UnauthorizedError } from "@/lib/api/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(): Promise<NextResponse> {
  try {
    const { user } = await requireUser();
    const result = await oneClickCancel(user.id);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof UnauthorizedError) return e.response;
    const msg = e instanceof Error ? e.message : "internal_error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
