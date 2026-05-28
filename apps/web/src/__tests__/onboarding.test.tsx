import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import Welcome from "@/app/onboarding/page";
import Goals from "@/app/onboarding/goals/page";
import Connect from "@/app/onboarding/connect/page";
import Tier from "@/app/onboarding/tier/page";
import Demo from "@/app/onboarding/demo/page";

describe("Onboarding", () => {
  it("welcome step renders help options", () => {
    render(<Welcome />);
    expect(screen.getByText(/Cancel subscriptions/i)).toBeInTheDocument();
  });
  it("goals step renders 3 goal inputs", () => {
    render(<Goals />);
    expect(screen.getAllByLabelText(/Goal/i).length).toBeGreaterThanOrEqual(3);
  });
  it("connect step shows Plaid mount stub", () => {
    render(<Connect />);
    expect(screen.getByText(/Plaid Link mounts here/i)).toBeInTheDocument();
  });
  it("tier step links to paywall", () => {
    render(<Tier />);
    expect(screen.getByRole("link", { name: /see plans/i })).toBeInTheDocument();
  });
  it("demo step offers a scan", () => {
    render(<Demo />);
    expect(screen.getByRole("link", { name: /scan now/i })).toBeInTheDocument();
  });
});
