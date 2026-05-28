import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import Tax from "@/app/app/agents/tax/page";
import Rebalancer from "@/app/app/agents/rebalancer/page";
import Strategy from "@/app/app/agents/strategy/page";
import HumanBackup from "@/app/app/agents/human-backup/page";
import Roadmap from "@/app/roadmap/page";

describe("Phase 3 screens", () => {
  // These Tier-3 pages are now wired to the real agents: each idle state offers
  // a dispatch that requires approval (recommend-only — no autonomous money
  // moves), rather than rendering a static shell.
  it("tax prep offers a running tax summary build", () => {
    render(<Tax />);
    expect(screen.getByText(/Running tax summary/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Build summary/i })).toBeInTheDocument();
  });
  it("rebalancer offers a recommend-only drift check", () => {
    render(<Rebalancer />);
    expect(screen.getAllByText(/Recommendation only/i).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Check drift/i })).toBeInTheDocument();
  });
  it("strategy offers a recommend-only projection run", () => {
    render(<Strategy />);
    expect(screen.getByText("Your trajectory")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Run strategy/i })).toBeInTheDocument();
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
