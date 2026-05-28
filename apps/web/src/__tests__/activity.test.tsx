import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import ActivityPage from "@/app/app/activity/page";

describe("Activity", () => {
  it("renders empty state when no actions", () => {
    render(<ActivityPage />);
    expect(screen.getByText(/No actions yet/i)).toBeInTheDocument();
  });
});
