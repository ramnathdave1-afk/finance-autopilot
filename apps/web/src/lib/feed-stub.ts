import type { FeedCardData } from "@fa/ui";

// Placeholder data — Terminal 3/4/5 agents will replace this with live feed
export const stubFeed: FeedCardData[] = [
  {
    id: "demo-1",
    agent: "Subscription Killer",
    type: "approval",
    title: "Cancel Planet Fitness?",
    body: "Last visit 91 days ago. $25/mo recurring.",
    roi_amount: 25,
    timestamp: "2m ago",
    actions: [
      { label: "Cancel it", intent: "primary" },
      { label: "Keep", intent: "ghost" }
    ]
  },
  {
    id: "demo-2",
    agent: "Spending Coach",
    type: "info",
    title: "Uber Eats up 80% this month",
    body: "You've spent $340 vs $189 last month. Want a $200/mo cap?",
    timestamp: "1h ago",
    actions: [{ label: "Set rule" }, { label: "Dismiss", intent: "ghost" }]
  },
  {
    id: "demo-3",
    agent: "Daily Brief",
    type: "info",
    title: "Yesterday: $42 spent",
    body: "Net worth up $310 this week. 1 cancellation pending approval.",
    timestamp: "7:02 am"
  }
];
