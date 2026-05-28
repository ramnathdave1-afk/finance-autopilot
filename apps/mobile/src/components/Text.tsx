import * as React from "react";
import { Text as RNText, type TextProps as RNTextProps, StyleSheet } from "react-native";
import { useTheme } from "../theme";
import type { TypographyToken } from "../theme/tokens";

export interface TextProps extends RNTextProps {
  variant?: TypographyToken;
  tone?: "default" | "muted" | "subtle" | "accent" | "danger";
  weight?: "regular" | "medium" | "semibold" | "bold";
}

export function Text({
  variant = "base",
  tone = "default",
  weight = "regular",
  style,
  children,
  ...rest
}: TextProps) {
  const theme = useTheme();
  const fontWeight: TextProps["weight"] extends "bold" ? "700" : string = (
    weight === "bold" ? "700" : weight === "semibold" ? "600" : weight === "medium" ? "500" : "400"
  ) as any;
  const color =
    tone === "muted"
      ? theme.colors.fgMuted
      : tone === "subtle"
        ? theme.colors.fgSubtle
        : tone === "accent"
          ? theme.colors.accent
          : tone === "danger"
            ? theme.colors.danger
            : theme.colors.fgDefault;
  return (
    <RNText
      {...rest}
      style={StyleSheet.flatten([
        theme.typography[variant],
        { color, fontWeight: fontWeight as any },
        style
      ])}
    >
      {children}
    </RNText>
  );
}
