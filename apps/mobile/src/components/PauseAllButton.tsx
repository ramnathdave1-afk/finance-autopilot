import * as React from "react";
import { Pressable, View } from "react-native";
import { useTheme } from "../theme";
import { Text } from "./Text";

export interface PauseAllButtonProps {
  paused: boolean;
  onToggle: (next: boolean) => void;
  testID?: string;
}

/**
 * Always-visible kill switch. PRD §8.5: "user can pause all agents from anywhere".
 */
export function PauseAllButton({ paused, onToggle, testID = "pause-all" }: PauseAllButtonProps) {
  const theme = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="switch"
      accessibilityState={{ checked: paused }}
      accessibilityLabel={paused ? "Resume all agents" : "Pause all agents"}
      onPress={() => onToggle(!paused)}
      style={({ pressed }) => [
        {
          flexDirection: "row",
          alignItems: "center",
          gap: theme.spacing.sm,
          paddingVertical: theme.spacing.sm,
          paddingHorizontal: theme.spacing.md,
          borderRadius: theme.radii.pill,
          borderWidth: 1,
          borderColor: paused ? theme.colors.danger : theme.colors.borderStrong,
          backgroundColor: paused ? theme.colors.danger : "transparent",
          opacity: pressed ? 0.85 : 1
        }
      ]}
    >
      <View
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: paused ? "#ffffff" : theme.colors.accent
        }}
      />
      <Text variant="sm" weight="semibold" style={paused ? { color: "#ffffff" } : undefined}>
        {paused ? "Agents paused" : "Pause all agents"}
      </Text>
    </Pressable>
  );
}
