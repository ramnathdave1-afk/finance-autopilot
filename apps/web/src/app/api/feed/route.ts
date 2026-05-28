// Vertical feed source-of-truth. Mobile + web both consume this.
// Shape matches apps/mobile/src/lib/feed-types.ts FeedItem union.

import { NextResponse } from "next/server";
import { createServiceClient, type AgentType } from "@fa/db";
import { requireUser, UnauthorizedError } from "@/lib/api/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AGENT_LABEL: Record<string, string> = {
  subscription_killer: "Subscription Killer",
  auto_saver: "Auto-Saver",
  round_up_investor: "Round-Up Investor",
  spending_coach: "Spending Coach",
  goal_funder: "Goal Funder",
  daily_brief: "Daily Brief",
  bill_negotiation: "Bill Negotiation",
  charge_dispute: "Charge Dispute",
  credit_card_optimizer: "Card Optimizer",
  missing_money: "Missing Money",
  refinance_watcher: "Refinance Watcher",
  insurance_shopper: "Insurance Shopper",
};

interface FeedItemBase {
  id: string;
  agent: AgentType;
  agentLabel: string;
  timestamp: string;
}

type FeedItem =
  | (FeedItemBase & {
      kind: "agent_action";
      title: string;
      body?: string;
      estimatedRoiAmount: number | null;
    })
  | (FeedItemBase & { kind: "insight"; title: string; body: string })
  | (FeedItemBase & { kind: "win"; title: string; body?: string; roiAmount: number })
  | (FeedItemBase & { kind: "alert"; title: string; body: string; severity: "info" | "warn" | "danger" });

export async function GET(req: Request): Promise<NextResponse> {
  try {
    const { user } = await requireUser(req);
    const url = new URL(req.url);
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 50), 1), 200);

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("agent_actions")
      .select("id, agent_type, action_type, target, status, roi_amount, requested_at, completed_at")
      .eq("user_id", user.id)
      .order("requested_at", { ascending: false })
      .limit(limit);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const items: FeedItem[] = (data ?? []).map((r) => {
      const row = r as {
        id: string;
        agent_type: AgentType;
        action_type: string;
        target: string | null;
        status: string;
        roi_amount: number | null;
        requested_at: string;
        completed_at: string | null;
      };
      const base = {
        id: row.id,
        agent: row.agent_type,
        agentLabel: AGENT_LABEL[row.agent_type] ?? row.agent_type,
        timestamp: row.completed_at ?? row.requested_at,
      };
      const title = row.target ? `${row.action_type}: ${row.target}` : row.action_type;
      if (row.status === "awaiting_approval" || row.status === "pending") {
        return { ...base, kind: "agent_action", title, estimatedRoiAmount: row.roi_amount };
      }
      if (row.status === "succeeded") {
        return { ...base, kind: "win", title, roiAmount: row.roi_amount ?? 0 };
      }
      if (row.status === "failed" || row.status === "escalated") {
        return {
          ...base,
          kind: "alert",
          title,
          body: "This action did not complete. Tap for details.",
          severity: row.status === "escalated" ? "danger" : "warn",
        };
      }
      return { ...base, kind: "insight", title, body: row.action_type };
    });

    return NextResponse.json({ items });
  } catch (e) {
    if (e instanceof UnauthorizedError) return e.response;
    const msg = e instanceof Error ? e.message : "internal_error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
