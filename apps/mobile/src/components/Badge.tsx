import * as React from "react";
import { View } from "react-native";
import { useTheme } from "../theme";
import { Text } from "./Text";

export interface BadgeProps {
  label: string;
  tone?: "neutral" | "accent" | "danger" | "warn";
}

export function Badge({ label, tone = "neutral" }: BadgeProps) {
  const theme = useTheme();
  const bg =
    tone === "accent"
      ? theme.colors.accent
      : tone === "danger"
        ? theme.colors.danger
        : tone === "warn"
          ? theme.colors.warn
          : theme.colors.borderDefault;
  const fg = tone === "accent" ? theme.colors.accentFg : theme.colors.fgDefault;
  return (
    <View
      style={{
        backgroundColor: bg,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: 2,
        borderRadius: theme.radii.pill,
        alignSelf: "flex-start"
      }}
    >
      <Text variant="xs" weight="semibold" style={{ color: fg }}>
        {label}
      </Text>
    </View>
  );
}
