import * as React from "react";
import { FlatList, View } from "react-native";
import { AgentActionCard } from "../../src/components/AgentActionCard";
import { AlertCard } from "../../src/components/AlertCard";
import { InsightCard } from "../../src/components/InsightCard";
import { PauseAllButton } from "../../src/components/PauseAllButton";
import { Skeleton } from "../../src/components/Skeleton";
import { Text } from "../../src/components/Text";
import { WinCard } from "../../src/components/WinCard";
import type { FeedItem } from "../../src/lib/feed-types";
import { loadFeed, type FeedState } from "../../src/lib/load-feed";
import { useTheme } from "../../src/theme";

type State = FeedState;

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
  const [state, setState] = React.useState<State>({ status: "loading" });

  React.useEffect(() => {
    let active = true;
    setState({ status: "loading" });
    void loadFeed().then((next) => {
      if (active) setState(next);
    });
    return () => {
      active = false;
    };
  }, []);

  if (state.status === "loading") {
    return (
      <View style={{ padding: theme.spacing.base, gap: theme.spacing.base }} testID="feed-loading">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} height={96} radius={theme.radii.md} />
        ))}
      </View>
    );
  }

  if (state.status === "error") {
    return (
      <View
        style={{
          flex: 1,
          padding: theme.spacing.lg,
          gap: theme.spacing.sm,
          justifyContent: "center",
          alignItems: "center"
        }}
        testID="feed-error"
      >
        <Text variant="xl" weight="semibold">
          Something went wrong
        </Text>
        <Text variant="sm" tone="muted">
          {state.message}
        </Text>
      </View>
    );
  }

  const data = state.items;
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
      ListEmptyComponent={
        <View style={{ paddingVertical: theme.spacing.xl, gap: theme.spacing.sm }} testID="feed-empty">
          <Text variant="xl" weight="semibold">
            You're all caught up
          </Text>
          <Text variant="sm" tone="muted">
            Nothing from your agents right now. We'll let you know when something needs you.
          </Text>
        </View>
      }
      renderItem={({ item }) => renderItem(item)}
      ItemSeparatorComponent={() => <View style={{ height: theme.spacing.sm }} />}
    />
  );
}
