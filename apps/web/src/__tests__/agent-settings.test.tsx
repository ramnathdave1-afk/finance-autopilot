import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import AgentSettings from "@/app/app/settings/agents/page";

describe("Agent permissions", () => {
  it("renders all consent modes", () => {
    render(<AgentSettings />);
    expect(screen.getAllByText(/Approve each/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Auto-do small stuff/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Full auto/i).length).toBeGreaterThan(0);
  });
  it("can toggle enable/disable", async () => {
    render(<AgentSettings />);
    const btn = screen.getAllByText(/^Disable$/)[0];
    await userEvent.click(btn);
    expect(screen.getAllByText(/^Enable$/).length).toBeGreaterThan(0);
  });
});
