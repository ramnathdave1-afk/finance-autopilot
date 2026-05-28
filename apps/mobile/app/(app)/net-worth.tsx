import * as React from "react";
import { ScrollView, View } from "react-native";
import { Badge } from "../../src/components/Badge";
import { Text } from "../../src/components/Text";
import { useTheme } from "../../src/theme";

// TODO(integrate-networth-api): wire to /api/networth from @fa/web (T2-owned).
const mockSeries = [42_100, 42_400, 42_800, 43_200, 43_350, 43_900, 44_220];
const milestone = 50_000;

export default function NetWorth() {
  const theme = useTheme();
  const current = mockSeries[mockSeries.length - 1] ?? 0;
  const start = mockSeries[0] ?? 0;
  const delta = current - start;
  const pct = ((delta / Math.max(1, start)) * 100).toFixed(1);

  return (
    <ScrollView contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.lg }}>
      <Text variant="sm" tone="muted">
        Net worth
      </Text>
      <Text variant="display" weight="bold">
        ${current.toLocaleString()}
      </Text>
      <Badge label={`+$${delta.toLocaleString()} (${pct}%) this week`} tone="accent" />
      {/* simple sparkline placeholder — bars sized to series */}
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 6, height: 80 }}>
        {mockSeries.map((v, i) => {
          const max = Math.max(...mockSeries);
          const h = Math.max(6, (v / max) * 80);
          return (
            <View
              key={i}
              style={{
                flex: 1,
                height: h,
                backgroundColor: theme.colors.accent,
                borderRadius: 4,
                opacity: 0.4 + (i / mockSeries.length) * 0.6
              }}
            />
          );
        })}
      </View>
      <View
        style={{
          backgroundColor: theme.colors.bgElevated,
          padding: theme.spacing.base,
          borderRadius: theme.radii.lg,
          borderWidth: 1,
          borderColor: theme.colors.borderDefault,
          gap: theme.spacing.sm
        }}
      >
        <Text variant="sm" tone="subtle">
          Next milestone
        </Text>
        <Text variant="xl" weight="semibold">
          ${milestone.toLocaleString()} — ~{Math.round(((milestone - current) / 200))} weeks at current pace
        </Text>
      </View>
    </ScrollView>
  );
}
