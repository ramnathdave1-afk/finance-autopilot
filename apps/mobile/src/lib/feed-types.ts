import type { AgentType } from "@fa/types";

interface FeedBase {
  id: string;
  agent: AgentType;
  agentLabel: string;
  timestamp: string;
}

export interface AgentActionCardModel extends FeedBase {
  kind: "agent_action";
  title: string;
  body?: string;
  /** Required so user can preview the action's effect before approving. */
  estimatedRoiAmount: number | null;
  /** Resolves true if approved, false if skipped. */
  onApprove?: () => void | Promise<void>;
  onSkip?: () => void | Promise<void>;
}

export interface InsightCardModel extends FeedBase {
  kind: "insight";
  title: string;
  body: string;
  cta?: { label: string; onPress: () => void } | undefined;
}

export interface WinCardModel extends FeedBase {
  kind: "win";
  title: string;
  body?: string;
  roiAmount: number;
  /** Optional share message; falls back to title. */
  shareMessage?: string | undefined;
}

export interface AlertCardModel extends FeedBase {
  kind: "alert";
  title: string;
  body: string;
  severity: "info" | "warn" | "danger";
}

export type FeedItem =
  | AgentActionCardModel
  | InsightCardModel
  | WinCardModel
  | AlertCardModel;
