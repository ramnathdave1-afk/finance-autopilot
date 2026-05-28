import * as React from "react";
import type { AlertCardModel } from "../lib/feed-types";
import { FeedCard } from "./FeedCard";

const toneMap = {
  info: "neutral",
  warn: "warn",
  danger: "danger"
} as const;

export function AlertCard({ card }: { card: AlertCardModel }) {
  return (
    <FeedCard
      testID={`alert-${card.id}`}
      agentLabel={card.agentLabel}
      title={card.title}
      body={card.body}
      timestamp={card.timestamp}
      tone={toneMap[card.severity]}
    />
  );
}
