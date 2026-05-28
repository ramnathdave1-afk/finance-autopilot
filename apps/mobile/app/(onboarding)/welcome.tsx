import * as React from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { Button } from "../../src/components/Button";
import { Text } from "../../src/components/Text";
import { useTheme } from "../../src/theme";

const OPTIONS = [
  { id: "cancel_subs", label: "Cancel subscriptions I don't use" },
  { id: "save_more", label: "Save more automatically" },
  { id: "negotiate", label: "Negotiate my bills" },
  { id: "debt", label: "Pay off debt" },
  { id: "invest", label: "Invest spare change" },
  { id: "all", label: "All of it — set me on autopilot" }
];

export default function Welcome() {
  const theme = useTheme();
  const router = useRouter();
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <ScrollView contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.base }}>
      <Text variant="3xl" weight="semibold">
        What do you want help with?
      </Text>
      <Text variant="base" tone="muted">
        Pick anything. You can change this later.
      </Text>
      <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.md }}>
        {OPTIONS.map((o) => {
          const on = selected.has(o.id);
          return (
            <Pressable
              key={o.id}
              testID={`welcome-chip-${o.id}`}
              onPress={() => toggle(o.id)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              style={{
                padding: theme.spacing.base,
                borderRadius: theme.radii.md,
                borderWidth: 1,
                borderColor: on ? theme.colors.accent : theme.colors.borderStrong,
                backgroundColor: on ? theme.colors.accent : "transparent"
              }}
            >
              <Text
                variant="base"
                weight="medium"
                style={on ? { color: theme.colors.accentFg } : undefined}
              >
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Button
        label="Continue"
        onPress={() => router.push("/(onboarding)/goals")}
        disabled={selected.size === 0}
      />
    </ScrollView>
  );
}
