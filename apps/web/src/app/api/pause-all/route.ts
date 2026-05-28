// Global pause-everything toggle (PRD §14).

import { NextResponse } from "next/server";
import { z } from "zod";
import { setPauseAll } from "@fa/db";
import { requireUser, UnauthorizedError } from "@/lib/api/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ paused: z.boolean() });

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const { user } = await requireUser();
    const json = await req.json().catch(() => null);
    const parsed = Body.safeParse(json);
    if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    await setPauseAll(user.id, parsed.data.paused);
    return NextResponse.json({ paused: parsed.data.paused });
  } catch (e) {
    if (e instanceof UnauthorizedError) return e.response;
    const msg = e instanceof Error ? e.message : "internal_error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
