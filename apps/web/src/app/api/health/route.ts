// Uptime health probe. Public — no auth.

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    ok: true,
    version: process.env.VERCEL_GIT_COMMIT_SHA ?? "dev",
    ts: new Date().toISOString(),
  });
}
