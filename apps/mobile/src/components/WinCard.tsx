import * as React from "react";
import { Share, View } from "react-native";
import type { WinCardModel } from "../lib/feed-types";
import { useTheme } from "../theme";
import { Button } from "./Button";
import { FeedCard } from "./FeedCard";
import { Text } from "./Text";

export function WinCard({ card }: { card: WinCardModel }) {
  const theme = useTheme();
  const onShare = async () => {
    try {
      await Share.share({
        message: card.shareMessage ?? `${card.title} — saved $${card.roiAmount} with Pilot.`
      });
    } catch {
      // user-cancel is a no-op
    }
  };
  return (
    <FeedCard
      testID={`win-${card.id}`}
      agentLabel={card.agentLabel}
      title={card.title}
      {...(card.body !== undefined ? { body: card.body } : {})}
      timestamp={card.timestamp}
      tone="accent"
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between"
        }}
      >
        <View>
          <Text variant="xs" tone="muted">
            Saved
          </Text>
          <Text variant="3xl" weight="bold" tone="accent">
            ${card.roiAmount.toFixed(0)}
          </Text>
        </View>
        <Button testID={`share-${card.id}`} label="Share" variant="outline" size="sm" onPress={onShare} />
      </View>
    </FeedCard>
  );
}
