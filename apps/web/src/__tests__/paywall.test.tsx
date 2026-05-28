import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import Paywall from "@/app/paywall/page";

describe("Paywall", () => {
  it("renders all 3 tiers and founder pricing badge", () => {
    render(<Paywall />);
    expect(screen.getByRole("heading", { name: /^Autopilot$/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^Pro$/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^Premium$/ })).toBeInTheDocument();
    expect(screen.getAllByText(/\$9\.99/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/\$19\.99/)).toBeInTheDocument();
    expect(screen.getByText(/\$29\.99/)).toBeInTheDocument();
    expect(screen.getByText(/\$49\.99/)).toBeInTheDocument();
  });
});
