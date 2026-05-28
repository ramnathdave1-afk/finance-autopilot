import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import NetWorth from "@/app/app/net-worth/page";
import Tax from "@/app/app/agents/tax/page";
import Rebalancer from "@/app/app/agents/rebalancer/page";
import Strategy from "@/app/app/agents/strategy/page";
import HumanBackup from "@/app/app/agents/human-backup/page";
import Roadmap from "@/app/roadmap/page";

describe("Phase 3 screens", () => {
  it("net worth renders trend + milestones", () => {
    render(<NetWorth />);
    expect(screen.getByText(/Milestones/i)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /trend chart/i })).toBeInTheDocument();
  });
  it("tax prep shows deductible categories", () => {
    render(<Tax />);
    expect(screen.getByText(/Home office/i)).toBeInTheDocument();
  });
  it("rebalancer shows portfolio drift", () => {
    render(<Rebalancer />);
    expect(screen.getByText(/Portfolio drift/i)).toBeInTheDocument();
  });
  it("strategy renders trajectory chart", () => {
    render(<Strategy />);
    expect(screen.getAllByText(/trajectory/i).length).toBeGreaterThan(0);
  });
  it("human backup submits a request", async () => {
    render(<HumanBackup />);
    await userEvent.type(screen.getByLabelText(/Topic/i), "Agent failed to cancel gym");
    await userEvent.click(screen.getByRole("button", { name: /^Send$/ }));
    expect(screen.getByText(/Request received/i)).toBeInTheDocument();
  });
  it("roadmap allows upvoting", async () => {
    render(<Roadmap />);
    const btn = screen.getByRole("button", { name: /Upvote Card Optimizer/i });
    await userEvent.click(btn);
    expect(btn).toBeDisabled();
  });
});
