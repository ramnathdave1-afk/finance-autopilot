// Reject a pending agent_action — marks it cancelled in the audit log.

import { NextResponse } from "next/server";
import { createServiceClient, markCancelled } from "@fa/db";
import { requireUser, UnauthorizedError } from "@/lib/api/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { user } = await requireUser();
    const { id } = await context.params;
    if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

    const supabase = createServiceClient();
    const { data: row, error } = await supabase
      .from("agent_actions")
      .select("id, user_id")
      .eq("id", id)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (row.user_id !== user.id) return NextResponse.json({ error: "forbidden" }, { status: 403 });

    await markCancelled(id);
    return NextResponse.json({ status: "cancelled", actionId: id });
  } catch (e) {
    if (e instanceof UnauthorizedError) return e.response;
    const msg = e instanceof Error ? e.message : "internal_error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
