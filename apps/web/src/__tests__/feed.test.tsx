import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import FeedPage from "@/app/app/page";

describe("Feed", () => {
  it("renders stub feed cards", () => {
    render(<FeedPage />);
    expect(screen.getByText(/Cancel Planet Fitness/i)).toBeInTheDocument();
    expect(screen.getByText(/Uber Eats up 80%/i)).toBeInTheDocument();
    expect(screen.getByText(/Yesterday: \$42 spent/i)).toBeInTheDocument();
  });
});
