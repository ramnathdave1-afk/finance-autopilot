import * as React from "react";
import { FlatList, View } from "react-native";
import { AgentActionCard } from "../../src/components/AgentActionCard";
import { AlertCard } from "../../src/components/AlertCard";
import { InsightCard } from "../../src/components/InsightCard";
import { PauseAllButton } from "../../src/components/PauseAllButton";
import { Text } from "../../src/components/Text";
import { WinCard } from "../../src/components/WinCard";
import { mockFeed } from "../../src/fixtures/feed";
import type { FeedItem } from "../../src/lib/feed-types";
import { useTheme } from "../../src/theme";

function renderItem(item: FeedItem) {
  switch (item.kind) {
    case "agent_action":
      return <AgentActionCard card={item} />;
    case "insight":
      return <InsightCard card={item} />;
    case "win":
      return <WinCard card={item} />;
    case "alert":
      return <AlertCard card={item} />;
  }
}

export default function Feed() {
  const theme = useTheme();
  const [paused, setPaused] = React.useState(false);
  // TODO(integrate-feed-api): replace mockFeed with apiGet<FeedItem[]>('/api/feed', token)
  const data = mockFeed;
  return (
    <FlatList<FeedItem>
      data={data}
      keyExtractor={(i) => i.id}
      contentContainerStyle={{ padding: theme.spacing.base, gap: theme.spacing.base }}
      ListHeaderComponent={
        <View style={{ gap: theme.spacing.sm, marginBottom: theme.spacing.sm }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text variant="3xl" weight="semibold">
              Today
            </Text>
            <PauseAllButton paused={paused} onToggle={setPaused} />
          </View>
          <Text variant="sm" tone="muted">
            {data.length} things from your agents.
          </Text>
        </View>
      }
      renderItem={({ item }) => renderItem(item)}
      ItemSeparatorComponent={() => <View style={{ height: theme.spacing.sm }} />}
    />
  );
}
