import * as React from "react";
import { View } from "react-native";
import { useTheme } from "../theme";
import { Badge } from "./Badge";
import { Text } from "./Text";

export interface FeedCardProps {
  agentLabel: string;
  tone?: "neutral" | "accent" | "danger" | "warn";
  title: string;
  body?: string;
  timestamp?: string;
  badgeRight?: string;
  children?: React.ReactNode;
  testID?: string;
}

/**
 * Base card shell mirroring packages/ui/src/feed-card.tsx visual language.
 * Composes the agent badge + ROI badge + title/body + footer slot for actions.
 */
export function FeedCard({
  agentLabel,
  tone = "neutral",
  title,
  body,
  timestamp,
  badgeRight,
  children,
  testID
}: FeedCardProps) {
  const theme = useTheme();
  return (
    <View
      testID={testID}
      style={{
        backgroundColor: theme.colors.bgElevated,
        borderRadius: theme.radii.lg,
        borderWidth: 1,
        borderColor: theme.colors.borderDefault,
        padding: theme.spacing.base,
        gap: theme.spacing.sm
      }}
    >
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center"
        }}
      >
        <View style={{ flexDirection: "row", gap: theme.spacing.sm, alignItems: "center" }}>
          <Badge label={agentLabel} tone={tone} />
          {badgeRight && <Badge label={badgeRight} tone="accent" />}
        </View>
        {timestamp && (
          <Text variant="xs" tone="subtle">
            {timestamp}
          </Text>
        )}
      </View>
      <Text variant="lg" weight="semibold">
        {title}
      </Text>
      {body && (
        <Text variant="base" tone="muted">
          {body}
        </Text>
      )}
      {children && <View style={{ marginTop: theme.spacing.sm }}>{children}</View>}
    </View>
  );
}
