import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("to=pro")
}));

import UpgradePage from "@/app/upgrade/page";

describe("Upgrade page", () => {
  it("renders selected tier with billing toggle", () => {
    render(<UpgradePage />);
    expect(screen.getByRole("heading", { name: /^Pro$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Monthly/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Annual/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Start trial/i })).toBeInTheDocument();
  });
});
