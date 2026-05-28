import * as React from "react";
import { Modal, View } from "react-native";
import { useTheme } from "../theme";
import { Button } from "./Button";
import { Text } from "./Text";

export interface CancelSubscriptionSheetProps {
  visible: boolean;
  merchant: string;
  monthlyAmount: number;
  onConfirm: () => void;
  onDismiss: () => void;
  testID?: string;
}

/**
 * Anti-Cleo guard: ONE confirmation step. No retention cascade, no win-back screens.
 * The flow is exactly:
 *   1. Sheet appears with "Confirm cancel" (primary) + "Keep my plan" (ghost)
 *   2. Tap → action fires immediately.
 *
 * Test enforces button count is exactly 2.
 */
export function CancelSubscriptionSheet({
  visible,
  merchant,
  monthlyAmount,
  onConfirm,
  onDismiss,
  testID = "cancel-sheet"
}: CancelSubscriptionSheetProps) {
  const theme = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View
        testID={testID}
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.6)",
          justifyContent: "flex-end"
        }}
      >
        <View
          style={{
            backgroundColor: theme.colors.bgElevated,
            padding: theme.spacing.lg,
            borderTopLeftRadius: theme.radii.lg,
            borderTopRightRadius: theme.radii.lg,
            gap: theme.spacing.md
          }}
        >
          <Text variant="xl" weight="semibold">
            Cancel {merchant}?
          </Text>
          <Text variant="base" tone="muted">
            We'll cancel now and request a refund on the most recent charge if eligible. Saves
            ~${monthlyAmount.toFixed(0)}/mo.
          </Text>
          <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
            <Button
              testID="confirm-cancel"
              label="Confirm cancel"
              variant="danger"
              onPress={onConfirm}
            />
            <Button
              testID="keep-plan"
              label="Keep my plan"
              variant="ghost"
              onPress={onDismiss}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}
