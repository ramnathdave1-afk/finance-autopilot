import * as React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import { AgentActionCard } from "../src/components/AgentActionCard";
import type { AgentActionCardModel } from "../src/lib/feed-types";
import { ThemeProvider } from "../src/theme";

const wrap = (ui: React.ReactElement) => <ThemeProvider>{ui}</ThemeProvider>;

const make = (overrides: Partial<AgentActionCardModel> = {}): AgentActionCardModel => ({
  id: "x",
  kind: "agent_action",
  agent: "subscription_killer",
  agentLabel: "Subscription Killer",
  title: "Cancel Hulu?",
  estimatedRoiAmount: 17.99,
  timestamp: "now",
  ...overrides
});

describe("AgentActionCard", () => {
  test("calls onApprove when Approve is pressed", () => {
    const onApprove = jest.fn();
    const { getByTestId } = render(wrap(<AgentActionCard card={make({ onApprove })} />));
    fireEvent.press(getByTestId("approve-x"));
    expect(onApprove).toHaveBeenCalledTimes(1);
  });

  test("calls onSkip when Skip is pressed", () => {
    const onSkip = jest.fn();
    const { getByTestId } = render(wrap(<AgentActionCard card={make({ onSkip })} />));
    fireEvent.press(getByTestId("skip-x"));
    expect(onSkip).toHaveBeenCalledTimes(1);
  });
});
