// Plaid public_token → access_token exchange (PRD §13). Auth-gated.

import { NextResponse } from "next/server";
import { z } from "zod";
import { exchangePublicToken } from "@fa/plaid";
import { requireUser, UnauthorizedError } from "@/lib/api/auth";
import { hasSupabaseEnv } from "@/lib/data/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  publicToken: z.string().min(1).optional(),
  public_token: z.string().min(1).optional(),
  institutionId: z.string().nullable().optional(),
  institutionName: z.string().nullable().optional(),
});

export async function POST(request: Request): Promise<NextResponse> {
  if (!hasSupabaseEnv() || !process.env.PLAID_CLIENT_ID) {
    return NextResponse.json({ connected: true, accountIds: [], placeholder: true });
  }
  try {
    const { user } = await requireUser();
    const json = await request.json().catch(() => null);
    const parsed = Body.safeParse(json);
    const publicToken = parsed.success ? parsed.data.publicToken ?? parsed.data.public_token : undefined;
    if (!publicToken) {
      return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }
    const itemRowId = await exchangePublicToken({
      userId: user.id,
      publicToken,
      institutionId: parsed.success ? parsed.data.institutionId ?? null : null,
      institutionName: parsed.success ? parsed.data.institutionName ?? null : null,
    });
    return NextResponse.json({ connected: true, itemRowId, accountIds: [] as string[] });
  } catch (e) {
    if (e instanceof UnauthorizedError) return e.response;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "exchange_failed" },
      { status: 500 },
    );
  }
}
