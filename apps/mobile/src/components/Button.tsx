import * as React from "react";
import { Pressable, type PressableProps, StyleSheet, View } from "react-native";
import { useTheme } from "../theme";
import { Text } from "./Text";

export interface ButtonProps extends Omit<PressableProps, "children" | "style"> {
  label: string;
  variant?: "primary" | "ghost" | "outline" | "danger";
  size?: "sm" | "md";
  testID?: string;
}

export function Button({
  label,
  variant = "primary",
  size = "md",
  disabled,
  testID,
  ...rest
}: ButtonProps) {
  const theme = useTheme();
  const padV = size === "sm" ? theme.spacing.sm : theme.spacing.md;
  const padH = size === "sm" ? theme.spacing.md : theme.spacing.lg;
  const bg =
    variant === "primary"
      ? theme.colors.accent
      : variant === "danger"
        ? theme.colors.danger
        : "transparent";
  const fg =
    variant === "primary"
      ? theme.colors.accentFg
      : variant === "danger"
        ? "#ffffff"
        : theme.colors.fgDefault;
  const border =
    variant === "outline" ? theme.colors.borderStrong : "transparent";
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      disabled={disabled}
      {...rest}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: bg,
          borderColor: border,
          borderWidth: variant === "outline" ? 1 : 0,
          borderRadius: theme.radii.md,
          paddingVertical: padV,
          paddingHorizontal: padH,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1
        }
      ]}
    >
      <View>
        <Text variant={size === "sm" ? "sm" : "base"} weight="semibold" style={{ color: fg }}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: "center", justifyContent: "center" }
});
