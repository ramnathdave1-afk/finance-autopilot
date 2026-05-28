import * as React from "react";
import { ScrollView, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { Button } from "../../src/components/Button";
import { Text } from "../../src/components/Text";
import { useTheme } from "../../src/theme";

interface Goal {
  name: string;
  amount: string;
  date: string;
}

const empty = (): Goal => ({ name: "", amount: "", date: "" });

export default function Goals() {
  const theme = useTheme();
  const router = useRouter();
  const [goals, setGoals] = React.useState<Goal[]>([empty()]);

  const update = (i: number, patch: Partial<Goal>) => {
    setGoals((g) => g.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  };

  const add = () => {
    if (goals.length >= 3) return;
    setGoals((g) => [...g, empty()]);
  };

  const input = {
    color: theme.colors.fgDefault,
    borderColor: theme.colors.borderStrong,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md
  } as const;

  return (
    <ScrollView contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.base }}>
      <Text variant="3xl" weight="semibold">
        Goals (up to 3)
      </Text>
      <Text variant="base" tone="muted">
        Pilot funds these in the background.
      </Text>
      {goals.map((g, i) => (
        <View key={i} style={{ gap: theme.spacing.sm, marginTop: theme.spacing.md }}>
          <Text variant="sm" tone="subtle">
            Goal {i + 1}
          </Text>
          <TextInput
            accessibilityLabel={`Goal ${i + 1} name`}
            placeholder="House down payment"
            placeholderTextColor={theme.colors.fgSubtle}
            value={g.name}
            onChangeText={(v) => update(i, { name: v })}
            style={input}
          />
          <TextInput
            accessibilityLabel={`Goal ${i + 1} amount`}
            placeholder="$50,000"
            placeholderTextColor={theme.colors.fgSubtle}
            keyboardType="numeric"
            value={g.amount}
            onChangeText={(v) => update(i, { amount: v })}
            style={input}
          />
          <TextInput
            accessibilityLabel={`Goal ${i + 1} date`}
            placeholder="YYYY-MM"
            placeholderTextColor={theme.colors.fgSubtle}
            value={g.date}
            onChangeText={(v) => update(i, { date: v })}
            style={input}
          />
        </View>
      ))}
      {goals.length < 3 && (
        <Button label="+ Add another goal" variant="ghost" onPress={add} />
      )}
      <Button label="Continue" onPress={() => router.push("/(onboarding)/connect")} />
    </ScrollView>
  );
}
