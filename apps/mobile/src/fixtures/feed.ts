// TODO(integrate-feed-api): replace with `apiGet<FeedItem[]>("/api/feed", token)`.
// T1's web app exposes the canonical feed; mobile reads from the same endpoint.
import type { FeedItem } from "../lib/feed-types";

export const mockFeed: FeedItem[] = [
  {
    id: "fa-1",
    kind: "agent_action",
    agent: "subscription_killer",
    agentLabel: "Subscription Killer",
    title: "Cancel Hulu? You haven't used it in 47 days.",
    body: "$17.99/mo. One tap to cancel — refund-eligible if billing already ran.",
    estimatedRoiAmount: 17.99,
    timestamp: "2m ago"
  },
  {
    id: "fa-2",
    kind: "win",
    agent: "auto_saver",
    agentLabel: "Auto-Saver",
    title: "Moved $42 to your house fund",
    body: "You can afford this — checking still has 14 days of buffer.",
    roiAmount: 42,
    timestamp: "1h ago"
  },
  {
    id: "fa-3",
    kind: "insight",
    agent: "spending_coach",
    agentLabel: "Spending Coach",
    title: "DoorDash is up 41% this month",
    body: "Six orders this week. Want me to cap at $40/wk and warn you when you hit it?",
    timestamp: "Today",
    cta: { label: "Set rule", onPress: () => {} }
  },
  {
    id: "fa-4",
    kind: "alert",
    agent: "daily_brief",
    agentLabel: "Daily Brief",
    title: "Car payment due in 3 days — $389",
    body: "Checking balance covers it. No action needed.",
    severity: "info",
    timestamp: "8am"
  }
];
