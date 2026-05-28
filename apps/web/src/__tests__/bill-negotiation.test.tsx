import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import BillNegotiation from "@/app/app/agents/bill-negotiation/page";

describe("Bill negotiation", () => {
  it("walks from idle to authorize step", async () => {
    render(<BillNegotiation />);
    await userEvent.type(screen.getByLabelText(/Provider/i), "Comcast");
    await userEvent.type(screen.getByLabelText(/Current \$\/mo/i), "120");
    await userEvent.type(screen.getByLabelText(/Target \$\/mo/i), "80");
    await userEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(await screen.findByText(/Authorize the call/i)).toBeInTheDocument();
  });
});
