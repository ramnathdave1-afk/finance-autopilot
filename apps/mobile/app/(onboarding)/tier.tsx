import * as React from "react";
import { ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import type { PricingTier } from "@fa/types";
import { Badge } from "../../src/components/Badge";
import { Button } from "../../src/components/Button";
import { Text } from "../../src/components/Text";
import { useTheme } from "../../src/theme";

interface Tier {
  id: Exclude<PricingTier, "free">;
  name: string;
  monthly: string;
  blurb: string;
  features: string[];
  highlight?: boolean;
  founder?: boolean;
}

const TIERS: Tier[] = [
  {
    id: "autopilot",
    name: "Autopilot",
    monthly: "$19.99",
    blurb: "Six core agents.",
    features: ["Subscription Killer", "Auto-Saver", "Round-Up", "Spending Coach", "Goal Funder", "Daily Brief"],
    highlight: true,
    founder: true
  },
  {
    id: "pro",
    name: "Pro",
    monthly: "$29.99",
    blurb: "Higher-impact agents.",
    features: ["Everything in Autopilot", "Bill Negotiation", "Charge Dispute", "Credit Card Optimizer"]
  },
  {
    id: "premium",
    name: "Premium",
    monthly: "$49.99",
    blurb: "Strategy + human backup.",
    features: ["Everything in Pro", "Tax Prep", "Investment Rebalancer", "White-glove backup"]
  }
];

export default function TierScreen() {
  const theme = useTheme();
  const router = useRouter();

  const select = (_t: Tier) => {
    // TODO(integrate-stripe-rn): open Stripe Checkout in a webview / external
    // browser via /api/stripe/checkout on @fa/web. For now record tier locally
    // and continue.
    router.push("/(onboarding)/done");
  };

  return (
    <ScrollView contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.base }}>
      <Badge label="Founder pricing — first 100 get $9.99/mo forever" tone="accent" />
      <Text variant="3xl" weight="semibold">
        Pick a plan.
      </Text>
      <Text variant="base" tone="muted">
        7-day free trial. One-tap cancel. Refund on any agent failure.
      </Text>
      {TIERS.map((t) => (
        <View
          key={t.id}
          style={{
            backgroundColor: theme.colors.bgElevated,
            borderRadius: theme.radii.lg,
            borderWidth: 1,
            borderColor: t.highlight ? theme.colors.accent : theme.colors.borderDefault,
            padding: theme.spacing.base,
            gap: theme.spacing.sm
          }}
        >
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text variant="xl" weight="semibold">
              {t.name}
            </Text>
            {t.founder && <Badge label="$9.99/mo lifetime" tone="accent" />}
          </View>
          <Text variant="2xl" weight="bold">
            {t.monthly}
            <Text variant="sm" tone="muted">
              {" "}
              /mo
            </Text>
          </Text>
          <Text variant="base" tone="muted">
            {t.blurb}
          </Text>
          <View style={{ gap: theme.spacing.xs }}>
            {t.features.map((f) => (
              <Text key={f} variant="sm">
                ✓ {f}
              </Text>
            ))}
          </View>
          <Button
            testID={`tier-select-${t.id}`}
            label={t.highlight ? "Start free trial" : `Choose ${t.name}`}
            variant={t.highlight ? "primary" : "outline"}
            onPress={() => select(t)}
          />
        </View>
      ))}
    </ScrollView>
  );
}
