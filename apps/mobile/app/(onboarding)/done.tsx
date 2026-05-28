import * as React from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { Button } from "../../src/components/Button";
import { Text } from "../../src/components/Text";
import { useTheme } from "../../src/theme";

export default function Done() {
  const theme = useTheme();
  const router = useRouter();

  return (
    <View style={{ flex: 1, padding: theme.spacing.lg, gap: theme.spacing.base, justifyContent: "center" }}>
      <Text variant="display" weight="bold">
        You're in.
      </Text>
      <Text variant="lg" tone="muted">
        Want me to scan for subscriptions you're not using? Most people find $30–60/mo in the first run.
      </Text>
      <Button
        label="Yes, run my first scan"
        onPress={() => router.replace("/(app)/feed")}
      />
      <Button label="Maybe later" variant="ghost" onPress={() => router.replace("/(app)/feed")} />
    </View>
  );
}
