import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import Landing from "@/app/page";

describe("Landing", () => {
  it("renders headline and CTA", () => {
    render(<Landing />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/AI agents/i);
    expect(screen.getByRole("link", { name: /get started/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /sign in/i })).toBeInTheDocument();
  });
});
