import * as React from "react";
import { Pressable, View } from "react-native";
import { Slot, useRouter, usePathname } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text } from "../../src/components/Text";
import { useTheme } from "../../src/theme";

const TABS = [
  { href: "/(app)/feed", label: "Feed" },
  { href: "/(app)/net-worth", label: "Net Worth" },
  { href: "/(app)/activity", label: "Activity" },
  { href: "/(app)/settings", label: "Settings" }
] as const;

export default function AppLayout() {
  const theme = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bgDefault }}>
      <View style={{ flex: 1 }}>
        <Slot />
      </View>
      <View
        style={{
          flexDirection: "row",
          borderTopWidth: 1,
          borderTopColor: theme.colors.borderDefault,
          paddingVertical: theme.spacing.sm,
          backgroundColor: theme.colors.bgElevated
        }}
      >
        {TABS.map((t) => {
          const active = pathname.includes(t.href.split("/").pop() ?? "");
          return (
            <Pressable
              key={t.href}
              testID={`tab-${t.label}`}
              onPress={() => router.replace(t.href as any)}
              style={{ flex: 1, alignItems: "center", paddingVertical: theme.spacing.xs }}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
            >
              <Text
                variant="sm"
                weight={active ? "semibold" : "regular"}
                tone={active ? "accent" : "muted"}
              >
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}
