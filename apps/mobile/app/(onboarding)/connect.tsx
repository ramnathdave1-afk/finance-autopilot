import * as React from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { Button } from "../../src/components/Button";
import { Text } from "../../src/components/Text";
import { useTheme } from "../../src/theme";

export default function Connect() {
  const theme = useTheme();
  const router = useRouter();
  const [connecting, setConnecting] = React.useState(false);

  const onConnect = async () => {
    setConnecting(true);
    try {
      // TODO(integrate-plaid-rn): use react-native-plaid-link-sdk's `create` +
      // `open`, then POST publicToken to /api/plaid/exchange on @fa/web. For now
      // fake success so onboarding flow is testable end-to-end.
      await new Promise((r) => setTimeout(r, 600));
      router.push("/(onboarding)/tier");
    } finally {
      setConnecting(false);
    }
  };

  return (
    <View style={{ flex: 1, padding: theme.spacing.lg, gap: theme.spacing.base }}>
      <Text variant="3xl" weight="semibold">
        Connect your bank
      </Text>
      <Text variant="base" tone="muted">
        Read-only via Plaid. We never see your password and can't move money without your approval.
      </Text>
      <View style={{ marginTop: theme.spacing.lg, gap: theme.spacing.sm }}>
        <Button
          testID="plaid-connect"
          label={connecting ? "Connecting…" : "Connect bank with Plaid"}
          onPress={onConnect}
          disabled={connecting}
        />
        <Button
          label="Skip for now"
          variant="ghost"
          onPress={() => router.push("/(onboarding)/tier")}
        />
      </View>
    </View>
  );
}
