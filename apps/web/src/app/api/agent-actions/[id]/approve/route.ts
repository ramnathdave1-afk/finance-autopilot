// Approve a pending agent_action and dispatch its execution to Inngest.
// PRD §10 (orchestration), §14 (approve-each consent gating).

import { NextResponse } from "next/server";
import { createServiceClient, approveAction, type AgentType } from "@fa/db";
import { sendAgentEvent } from "@/lib/api/inngest-client";
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
      .select("id, user_id, agent_id, agent_type, action_type, target, status")
      .eq("id", id)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (row.user_id !== user.id) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    await approveAction(id);
    await sendAgentEvent(row.agent_type as AgentType, row.action_type, {
      actionId: id,
      userId: row.user_id,
      agentId: row.agent_id,
      target: row.target,
      // The agent's `input` is loaded by the worker from its own context;
      // we forward the action_id so it can rehydrate.
      input: { actionId: id, target: row.target },
    });

    return NextResponse.json({ status: "queued", actionId: id });
  } catch (e) {
    if (e instanceof UnauthorizedError) return e.response;
    const msg = e instanceof Error ? e.message : "internal_error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
