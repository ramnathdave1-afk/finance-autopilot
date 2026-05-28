import * as React from "react";
import { View } from "react-native";
import { Slot, usePathname } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../../src/theme";

const STEPS = [
  "/(onboarding)/welcome",
  "/(onboarding)/goals",
  "/(onboarding)/connect",
  "/(onboarding)/tier",
  "/(onboarding)/done"
];

export default function OnboardingLayout() {
  const theme = useTheme();
  const path = usePathname();
  const idx = Math.max(
    0,
    STEPS.findIndex((s) => path.includes(s.split("/").pop() ?? ""))
  );
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bgDefault }}>
      <View
        style={{
          flexDirection: "row",
          gap: theme.spacing.xs,
          padding: theme.spacing.base,
          justifyContent: "center"
        }}
      >
        {STEPS.map((_, i) => (
          <View
            key={i}
            style={{
              width: 24,
              height: 4,
              borderRadius: 2,
              backgroundColor:
                i <= idx ? theme.colors.accent : theme.colors.borderDefault
            }}
          />
        ))}
      </View>
      <Slot />
    </SafeAreaView>
  );
}
