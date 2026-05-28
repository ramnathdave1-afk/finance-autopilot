import * as React from "react";
import { FlatList, View } from "react-native";
import type { AgentAction, AgentActionStatus } from "@fa/types";
import { Badge } from "../../src/components/Badge";
import { Text } from "../../src/components/Text";
import { useTheme } from "../../src/theme";

// TODO(integrate-activity-api): wire to /api/agent-actions (T3 owns audit log).
const mockActions: AgentAction[] = [
  {
    id: "a1",
    user_id: "u1",
    agent_id: "ag1",
    agent_type: "subscription_killer",
    action_type: "cancel_subscription",
    target: "Hulu",
    status: "succeeded",
    requested_at: "2026-05-27T10:00:00Z",
    completed_at: "2026-05-27T10:00:42Z",
    roi_amount: 17.99,
    refund_eligible: true,
    audit_log: [],
    voice_recording_url: null
  },
  {
    id: "a2",
    user_id: "u1",
    agent_id: "ag2",
    agent_type: "auto_saver",
    action_type: "transfer_to_savings",
    target: "House fund",
    status: "succeeded",
    requested_at: "2026-05-27T09:00:00Z",
    completed_at: "2026-05-27T09:00:08Z",
    roi_amount: 42,
    refund_eligible: false,
    audit_log: [],
    voice_recording_url: null
  },
  {
    id: "a3",
    user_id: "u1",
    agent_id: "ag3",
    agent_type: "spending_coach",
    action_type: "alert_overspend",
    target: "DoorDash",
    status: "pending",
    requested_at: "2026-05-28T08:00:00Z",
    completed_at: null,
    roi_amount: null,
    refund_eligible: false,
    audit_log: [],
    voice_recording_url: null
  }
];

const toneOf = (s: AgentActionStatus) =>
  s === "succeeded" ? "accent" : s === "failed" ? "danger" : "neutral";

export default function Activity() {
  const theme = useTheme();
  return (
    <FlatList
      data={mockActions}
      keyExtractor={(a) => a.id}
      contentContainerStyle={{ padding: theme.spacing.base, gap: theme.spacing.sm }}
      ListHeaderComponent={
        <Text variant="3xl" weight="semibold" style={{ marginBottom: theme.spacing.base }}>
          Activity
        </Text>
      }
      renderItem={({ item }) => (
        <View
          style={{
            backgroundColor: theme.colors.bgElevated,
            padding: theme.spacing.base,
            borderRadius: theme.radii.md,
            borderWidth: 1,
            borderColor: theme.colors.borderDefault,
            gap: theme.spacing.xs
          }}
        >
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Badge label={item.agent_type.replace(/_/g, " ")} tone={toneOf(item.status)} />
            <Text variant="xs" tone="subtle">
              {new Date(item.requested_at).toLocaleString()}
            </Text>
          </View>
          <Text variant="base" weight="semibold">
            {item.action_type.replace(/_/g, " ")} — {item.target ?? ""}
          </Text>
          {item.roi_amount != null && (
            <Text variant="sm" tone="accent">
              +${item.roi_amount.toFixed(2)}
            </Text>
          )}
          <Text variant="xs" tone="muted">
            Status: {item.status}
          </Text>
        </View>
      )}
    />
  );
}
