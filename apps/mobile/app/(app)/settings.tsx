import * as React from "react";
import { ScrollView, Switch, View } from "react-native";
import { useRouter } from "expo-router";
import { Button } from "../../src/components/Button";
import { CancelSubscriptionSheet } from "../../src/components/CancelSubscriptionSheet";
import { PauseAllButton } from "../../src/components/PauseAllButton";
import { Text } from "../../src/components/Text";
import { useTheme } from "../../src/theme";
import { supabase } from "../../src/lib/supabase";

export default function Settings() {
  const theme = useTheme();
  const router = useRouter();
  const [paused, setPaused] = React.useState(false);
  const [analytics, setAnalytics] = React.useState(true);
  const [cancelOpen, setCancelOpen] = React.useState(false);

  const row = {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderDefault
  };

  const onLogout = async () => {
    await supabase.auth.signOut();
    router.replace("/(auth)/login");
  };

  return (
    <ScrollView contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.base }}>
      <Text variant="3xl" weight="semibold">
        Settings
      </Text>

      <View style={{ marginTop: theme.spacing.base }}>
        <Text variant="sm" tone="subtle">
          Agents
        </Text>
        <View style={row}>
          <Text variant="base">Pause all agents</Text>
          <PauseAllButton paused={paused} onToggle={setPaused} />
        </View>
        <View style={row}>
          <View style={{ flex: 1 }}>
            <Text variant="base">Cancel a subscription</Text>
            <Text variant="xs" tone="muted">
              One tap. We don't put you through a retention maze.
            </Text>
          </View>
          <Button
            testID="open-cancel-sheet"
            label="Cancel"
            variant="outline"
            size="sm"
            onPress={() => setCancelOpen(true)}
          />
        </View>
      </View>

      <View>
        <Text variant="sm" tone="subtle">
          Privacy
        </Text>
        <View style={row}>
          <Text variant="base">Anonymous analytics</Text>
          <Switch
            value={analytics}
            onValueChange={setAnalytics}
            trackColor={{ true: theme.colors.accent, false: theme.colors.borderStrong }}
          />
        </View>
      </View>

      <Button label="Log out" variant="outline" onPress={onLogout} />

      <CancelSubscriptionSheet
        visible={cancelOpen}
        merchant="Hulu"
        monthlyAmount={17.99}
        onConfirm={() => {
          // TODO(integrate-cancel-api): POST /api/subscriptions/:id/cancel
          setCancelOpen(false);
        }}
        onDismiss={() => setCancelOpen(false)}
      />
    </ScrollView>
  );
}
