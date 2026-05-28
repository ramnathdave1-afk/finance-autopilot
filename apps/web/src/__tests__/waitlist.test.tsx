import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";

vi.mock("@/app/actions/waitlist", () => ({
  joinWaitlistAction: vi.fn(async () => ({ ok: true, founderLocked: true, rank: 3 }))
}));

import { WaitlistForm } from "@/components/waitlist-form";

describe("WaitlistForm", () => {
  it("locks founder pricing after a valid submit", async () => {
    render(<WaitlistForm />);
    await userEvent.type(screen.getByPlaceholderText(/you@email\.com/i), "dave@example.com");
    await userEvent.click(screen.getByRole("button", { name: /join/i }));
    expect(await screen.findByText(/Founder pricing locked/i)).toBeInTheDocument();
    expect(screen.getByText(/rank #3 of 100/i)).toBeInTheDocument();
  });
});
