"use server";
import { revalidatePath } from "next/cache";
import { approveAction, markCancelled, startAction } from "@fa/db";
import type { AgentType } from "@fa/db/types";
import { hasSupabaseEnv } from "@/lib/data/env";
import { currentUserId } from "@/lib/current-user";

export type ActionResult = { ok: boolean; error?: string };

export async function approveActionAction(actionId: string): Promise<ActionResult> {
  if (!hasSupabaseEnv()) return { ok: true };
  try {
    await approveAction(actionId);
    revalidatePath("/app");
    revalidatePath("/app/activity");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function skipActionAction(actionId: string): Promise<ActionResult> {
  if (!hasSupabaseEnv()) return { ok: true };
  try {
    await markCancelled(actionId);
    revalidatePath("/app");
    revalidatePath("/app/activity");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export interface DispatchInput {
  agentId: string;
  agentType: AgentType;
  actionType: string;
  target?: string | null;
  requiresApproval?: boolean;
}

/**
 * Create an agent_action row from a UI trigger (e.g. "Negotiate this bill",
 * "File this dispute"). T3/T4 workflows pick it up via Inngest based on the
 * action_type / agent_type tuple.
 */
export async function dispatchAction(input: DispatchInput): Promise<ActionResult & { actionId?: string }> {
  if (!hasSupabaseEnv()) return { ok: true, actionId: "demo" };
  try {
    const userId = await currentUserId();
    const row = await startAction({
      userId,
      agentId: input.agentId,
      agentType: input.agentType,
      actionType: input.actionType,
      target: input.target ?? null,
      requiresApproval: input.requiresApproval ?? false
    });
    revalidatePath("/app");
    return { ok: true, actionId: row.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
