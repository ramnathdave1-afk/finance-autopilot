import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams()
}));

// Plaid Link button hits fetch — stub the global fetch to avoid network.
vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ link_token: "sandbox-x" }), { headers: { "content-type": "application/json" } })));

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
  it("connect step shows the Plaid CTA", () => {
    render(<Connect />);
    expect(screen.getByRole("button", { name: /Connect bank/i })).toBeInTheDocument();
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
