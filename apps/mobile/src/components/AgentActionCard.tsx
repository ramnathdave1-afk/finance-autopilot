import * as React from "react";
import { ActivityIndicator, View } from "react-native";
import type { AgentActionCardModel } from "../lib/feed-types";
import { useTheme } from "../theme";
import { Button } from "./Button";
import { FeedCard } from "./FeedCard";

export interface AgentActionCardProps {
  card: AgentActionCardModel;
}

export function AgentActionCard({ card }: AgentActionCardProps) {
  const theme = useTheme();
  const [pending, setPending] = React.useState(false);

  const run = async (fn?: () => void | Promise<void>) => {
    if (!fn) return;
    setPending(true);
    try {
      await fn();
    } finally {
      setPending(false);
    }
  };

  return (
    <FeedCard
      testID={`agent-action-${card.id}`}
      agentLabel={card.agentLabel}
      title={card.title}
      {...(card.body !== undefined ? { body: card.body } : {})}
      timestamp={card.timestamp}
      tone="accent"
      {...(card.estimatedRoiAmount != null
        ? { badgeRight: `$${card.estimatedRoiAmount.toFixed(0)}/mo` }
        : {})}
    >
      {pending ? (
        <View style={{ paddingVertical: theme.spacing.sm }}>
          <ActivityIndicator color={theme.colors.accent} />
        </View>
      ) : (
        <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
          <Button
            testID={`approve-${card.id}`}
            label="Approve"
            variant="primary"
            size="sm"
            onPress={() => run(card.onApprove)}
          />
          <Button
            testID={`skip-${card.id}`}
            label="Skip"
            variant="ghost"
            size="sm"
            onPress={() => run(card.onSkip)}
          />
        </View>
      )}
    </FeedCard>
  );
}
