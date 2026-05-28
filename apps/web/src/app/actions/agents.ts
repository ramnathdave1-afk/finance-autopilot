"use server";
import { revalidatePath } from "next/cache";
import { approveAction, createServiceClient, logStep, markCancelled, startAction, upsertAgent } from "@fa/db";
import type { AgentType } from "@fa/db/types";
import { ROUTER_EVENT } from "@fa/inngest";
import { hasSupabaseEnv } from "@/lib/data/env";
import { currentUserId } from "@/lib/current-user";
import { getInngest } from "@/lib/api/inngest-client";
import { track } from "@/lib/analytics/posthog";

export type ActionResult = { ok: boolean; error?: string };

export interface ActionStatusResult {
  status: string;
  roi: number | null;
  /** Voice recording URL for the bill-negotiation call, when present. */
  voiceRecordingUrl?: string | null;
}

/**
 * Poll a dispatched agent_action's terminal status from the UI. Returns the
 * current status + ROI, and (for bill negotiation) the call recording URL once
 * the voice agent has populated bill_negotiations.voice_recording_url. Without
 * Supabase env (local/demo) the action is reported as still pending so the UI
 * never fabricates a completion.
 */
export async function getActionStatus(actionId: string): Promise<ActionStatusResult> {
  if (!hasSupabaseEnv()) return { status: "pending", roi: null };
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("agent_actions")
      .select("status, roi_amount, agent_type")
      .eq("id", actionId)
      .maybeSingle();
    if (error || !data) return { status: "pending", roi: null };
    const row = data as { status: string; roi_amount: number | null; agent_type: string };

    let voiceRecordingUrl: string | null | undefined;
    if (row.agent_type === "bill_negotiation") {
      const { data: neg } = await supabase
        .from("bill_negotiations")
        .select("voice_recording_url")
        .eq("agent_action_id", actionId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      voiceRecordingUrl = (neg as { voice_recording_url: string | null } | null)?.voice_recording_url ?? null;
    }

    return {
      status: row.status,
      roi: row.roi_amount ?? null,
      ...(voiceRecordingUrl !== undefined ? { voiceRecordingUrl } : {}),
    };
  } catch {
    return { status: "pending", roi: null };
  }
}

export interface AuditStep {
  ts: string;
  step: string;
  ok: boolean;
  detail?: Record<string, unknown>;
}

export interface ActionDetailResult {
  status: string;
  roi: number | null;
  /**
   * The agent's audit-log steps. Recommend-only Tier-3 agents (tax, rebalancer,
   * strategy, human-backup) do not persist their `data` payload to a dedicated
   * column — runAgent only writes `roi` + the audit_log. So each agent logs its
   * FULL deliverable into its terminal audit step's detail (tax `summary:built`
   * → income1099/needsReview1099/deductionsByBucket; rebalancer `analysis:done`
   * → recommendedTrades/harvestCandidates; strategy `strategy:done` → levers),
   * and the UI reconstructs the result from that detail. Empty without Supabase
   * env so the UI never fabricates a result.
   */
  steps: AuditStep[];
}

/**
 * Fetch a dispatched action's status + full audit trail for result rendering.
 * Without Supabase env (local/demo) returns pending + no steps so the UI never
 * fabricates a completion or a result.
 */
export async function getActionDetail(actionId: string): Promise<ActionDetailResult> {
  if (!hasSupabaseEnv()) return { status: "pending", roi: null, steps: [] };
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("agent_actions")
      .select("status, roi_amount, audit_log")
      .eq("id", actionId)
      .maybeSingle();
    if (error || !data) return { status: "pending", roi: null, steps: [] };
    const row = data as { status: string; roi_amount: number | null; audit_log: AuditStep[] | null };
    return { status: row.status, roi: row.roi_amount ?? null, steps: row.audit_log ?? [] };
  } catch {
    return { status: "pending", roi: null, steps: [] };
  }
}

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
    void track(actionId, "agent_action_approved", {});
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

/** Matches a canonical UUID (the shape of agents.id / agent_actions.agent_id). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * account_subtype values (lower-cased) that are TAX-ADVANTAGED and therefore NOT
 * eligible for tax-loss harvesting. Anything else under an investment/brokerage
 * account_type is treated as taxable. Conservative: only known retirement /
 * education subtypes are excluded.
 */
const TAX_ADVANTAGED_SUBTYPES = new Set([
  "401k",
  "401a",
  "403b",
  "457b",
  "ira",
  "roth",
  "roth 401k",
  "roth ira",
  "sep ira",
  "simple ira",
  "rollover ira",
  "hsa",
  "529",
  "education savings account",
  "ugma",
  "utma",
  "pension",
  "retirement",
  "tsp",
]);

/**
 * Resolve the signed-in user's TAXABLE investment account ids — the only
 * accounts where tax-loss harvesting applies. An account is taxable when its
 * account_type is investment/brokerage AND its subtype is not a known tax-
 * advantaged (retirement/education) type. Returns [] without Supabase env so
 * the rebalancer simply finds no harvest candidates rather than fabricating any.
 */
export async function getTaxableAccountIds(): Promise<string[]> {
  if (!hasSupabaseEnv()) return [];
  try {
    const userId = await currentUserId();
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("connected_accounts")
      .select("id, account_type, account_subtype")
      .eq("user_id", userId);
    if (error || !data) return [];
    const rows = data as Array<{ id: string; account_type: string; account_subtype: string | null }>;
    return rows
      .filter((r) => {
        const type = (r.account_type ?? "").toLowerCase();
        if (type !== "investment" && type !== "brokerage") return false;
        const subtype = (r.account_subtype ?? "").toLowerCase().trim();
        return !TAX_ADVANTAGED_SUBTYPES.has(subtype);
      })
      .map((r) => r.id);
  } catch {
    return [];
  }
}

export interface DispatchInput {
  /**
   * Optional explicit agents.id (a UUID). When omitted, dispatchAction resolves
   * the signed-in user's canonical agent row for `agentType` (create-on-first-
   * use) and uses its UUID. UI callers pass only agentType; the agentId column
   * is `uuid not null references agents(id)`, so a non-UUID literal would fail
   * the FK/cast against a real DB.
   */
  agentId?: string;
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
  // Guard: if a caller passes an explicit agentId it MUST be a UUID. A bare
  // agent-type string (e.g. "tax_prep") would violate the agent_id uuid/FK
  // constraint at the DB. Reject early with a clear message instead of letting
  // a raw Postgres cast error surface.
  if (input.agentId !== undefined && !UUID_RE.test(input.agentId)) {
    return { ok: false, error: `invalid agentId (expected agents.id UUID): ${input.agentId}` };
  }
  if (!hasSupabaseEnv()) return { ok: true, actionId: "demo" };
  try {
    const userId = await currentUserId();
    // Resolve the real agents.id UUID for this user + agent type (create-on-
    // first-use). This is the value written to agent_actions.agent_id, satisfying
    // the uuid/FK constraint; downstream (approve route, router) reads it back.
    const agentId = input.agentId ?? (await upsertAgent(userId, input.agentType));
    const row = await startAction({
      userId,
      agentId,
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

    // Conversion event (PRD §19): every UI-triggered agent action is a
    // "proposed" event keyed to the user. Fire-and-forget; no-op without a
    // PostHog key, never throws into the request.
    void track(userId, "agent_action_proposed", {
      agent_type: input.agentType,
      action_type: input.actionType,
      requires_approval: input.requiresApproval ?? false,
    });

    revalidatePath("/app");
    return { ok: true, actionId: row.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
