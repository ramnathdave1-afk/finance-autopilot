import * as React from "react";
import { render } from "@testing-library/react-native";
import { FeedCard } from "../src/components/FeedCard";
import { ThemeProvider } from "../src/theme";

const wrap = (ui: React.ReactElement) => <ThemeProvider>{ui}</ThemeProvider>;

describe("FeedCard", () => {
  test("renders title, body, agent label, and timestamp", () => {
    const { getByText } = render(
      wrap(
        <FeedCard
          agentLabel="Subscription Killer"
          title="Cancel Hulu?"
          body="You haven't used it in 47 days."
          timestamp="2m ago"
        />
      )
    );
    expect(getByText("Subscription Killer")).toBeTruthy();
    expect(getByText("Cancel Hulu?")).toBeTruthy();
    expect(getByText("You haven't used it in 47 days.")).toBeTruthy();
    expect(getByText("2m ago")).toBeTruthy();
  });

  test("renders ROI badge when badgeRight is provided", () => {
    const { getByText } = render(
      wrap(<FeedCard agentLabel="Auto-Saver" title="Saved $42" badgeRight="$42/mo" />)
    );
    expect(getByText("$42/mo")).toBeTruthy();
  });
});
