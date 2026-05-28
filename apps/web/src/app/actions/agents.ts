"use server";
import { revalidatePath } from "next/cache";
import { approveAction, logStep, markCancelled, startAction } from "@fa/db";
import type { AgentType } from "@fa/db/types";
import { ROUTER_EVENT } from "@fa/inngest";
import { hasSupabaseEnv } from "@/lib/data/env";
import { currentUserId } from "@/lib/current-user";
import { getInngest } from "@/lib/api/inngest-client";

export type ActionResult = { ok: boolean; error?: string };

export async function approveActionAction(actionId: string): Promise<ActionResult> {
  if (!hasSupabaseEnv()) return { ok: true };
  try {
    await approveAction(actionId);
    // Now that the row is approved, kick the router so the agent runs.
    try {
      await getInngest().send({ name: ROUTER_EVENT, data: { actionId } });
    } catch (e) {
      console.warn(`[approveActionAction] inngest send failed: ${e instanceof Error ? e.message : String(e)}`);
    }
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
  /**
   * Richer-than-target input for agents that need it (auto-saver paycheck
   * context, round-up week-of transactions, subscription-killer credentials).
   * Seeded into agent_actions.audit_log as the `input:seed` step. The router
   * pulls it back out via hydrateInput().
   */
  input?: Record<string, unknown>;
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

    // Seed richer input into audit_log so the router can hydrate it on the
    // worker side. Skip if there's no extra input — the agent will run from
    // { target } alone.
    if (input.input) {
      try {
        await logStep(row.id, { step: "input:seed", ok: true, detail: { input: input.input } });
      } catch (e) {
        // Non-fatal: agent can still run from target. Log only.
        console.warn(`[dispatchAction] input seed failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // Only emit the router event when the row is ready to run.
    // Approval-gated rows wait for approveActionAction() before dispatch.
    if (!input.requiresApproval) {
      try {
        await getInngest().send({ name: ROUTER_EVENT, data: { actionId: row.id } });
      } catch (e) {
        // Don't fail UI dispatch on a transient Inngest hiccup — the row
        // exists and a janitor can re-emit. Log only.
        console.warn(`[dispatchAction] inngest send failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    revalidatePath("/app");
    return { ok: true, actionId: row.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
