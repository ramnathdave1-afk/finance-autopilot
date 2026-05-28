import * as React from "react";
import type { InsightCardModel } from "../lib/feed-types";
import { Button } from "./Button";
import { FeedCard } from "./FeedCard";

export function InsightCard({ card }: { card: InsightCardModel }) {
  return (
    <FeedCard
      testID={`insight-${card.id}`}
      agentLabel={card.agentLabel}
      title={card.title}
      body={card.body}
      timestamp={card.timestamp}
    >
      {card.cta && (
        <Button
          testID={`insight-cta-${card.id}`}
          label={card.cta.label}
          variant="outline"
          size="sm"
          onPress={card.cta.onPress}
        />
      )}
    </FeedCard>
  );
}
