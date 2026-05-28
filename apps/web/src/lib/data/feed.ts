import "server-only";
import { createServiceClient } from "@fa/db";
import type { FeedCardData } from "@fa/ui";
import { stubFeed } from "@/lib/feed-stub";
import { hasSupabaseEnv } from "./env";

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
  insurance_shopper: "Insurance Shopper"
};

function timeAgo(iso: string): string {
  const sec = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60) return "just now";
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

export async function getFeedCards(userId: string, limit = 10): Promise<FeedCardData[]> {
  if (!hasSupabaseEnv()) return stubFeed;
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("agent_actions")
      .select("id, agent_type, action_type, target, status, roi_amount, requested_at, completed_at")
      .eq("user_id", userId)
      .in("status", ["awaiting_approval", "succeeded"])
      .order("requested_at", { ascending: false })
      .limit(limit);
    if (error || !data) return stubFeed;
    return data.map((row): FeedCardData => {
      const r = row as {
        id: string;
        agent_type: string;
        action_type: string;
        target: string | null;
        status: string;
        roi_amount: number | null;
        requested_at: string;
        completed_at: string | null;
      };
      const isApproval = r.status === "awaiting_approval";
      return {
        id: r.id,
        agent: AGENT_LABEL[r.agent_type] ?? r.agent_type,
        type: isApproval ? "approval" : "win",
        title: r.target ? `${r.action_type}: ${r.target}` : r.action_type,
        roi_amount: r.roi_amount,
        timestamp: timeAgo(r.completed_at ?? r.requested_at),
        actions: isApproval
          ? [{ label: "Approve" }, { label: "Skip", intent: "ghost" }]
          : undefined
      };
    });
  } catch {
    return stubFeed;
  }
}
