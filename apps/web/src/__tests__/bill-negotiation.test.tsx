import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the server actions the page calls so we can assert the exact wiring:
//   createBillForNegotiation → yields { billId, providerPhone }
//   dispatchAction           → must receive input { billId, providerPhone, targetAmount }
//   approveActionAction      → must be called to satisfy the approval gate
const createBillForNegotiation = vi.fn(async () => ({
  ok: true,
  billId: "bill-123",
  providerPhone: "+18009346489",
}));
const dispatchAction = vi.fn(async (_input: { requiresApproval?: boolean; input?: Record<string, unknown> }) => ({ ok: true, actionId: "act-1" }));
const approveActionAction = vi.fn(async () => ({ ok: true }));
const getActionStatus = vi.fn(async () => ({ status: "pending", roi: null }));

vi.mock("@/app/actions/bills", () => ({
  createBillForNegotiation: (...a: unknown[]) => createBillForNegotiation(...(a as [])),
}));
vi.mock("@/app/actions/agents", () => ({
  dispatchAction: (...a: unknown[]) => dispatchAction(...(a as [Parameters<typeof dispatchAction>[0]])),
  approveActionAction: (...a: unknown[]) => approveActionAction(...(a as [])),
  getActionStatus: (...a: unknown[]) => getActionStatus(...(a as [])),
}));

import BillNegotiation from "@/app/app/agents/bill-negotiation/page";
import type { BillNegotiationInput } from "@fa/agent-bill-negotiation";

beforeEach(() => {
  createBillForNegotiation.mockClear();
  dispatchAction.mockClear();
  approveActionAction.mockClear();
  getActionStatus.mockClear();
});

describe("Bill negotiation", () => {
  it("walks from idle to authorize step", async () => {
    render(<BillNegotiation />);
    await userEvent.type(screen.getByLabelText(/Provider/i), "Comcast");
    await userEvent.type(screen.getByLabelText(/Current \$\/mo/i), "120");
    await userEvent.type(screen.getByLabelText(/Target \$\/mo/i), "80");
    await userEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(await screen.findByText(/Authorize the call/i)).toBeInTheDocument();
  });

  it("dispatches the EXACT BillNegotiationInput keys and approves the row", async () => {
    render(<BillNegotiation />);
    await userEvent.type(screen.getByLabelText(/Provider/i), "Comcast");
    await userEvent.type(screen.getByLabelText(/Current \$\/mo/i), "120");
    await userEvent.type(screen.getByLabelText(/Target \$\/mo/i), "80");
    await userEvent.click(screen.getByRole("button", { name: /continue/i }));
    await screen.findByText(/Authorize the call/i);
    await userEvent.click(screen.getByRole("button", { name: /^Authorize$/i }));

    await waitFor(() => expect(dispatchAction).toHaveBeenCalledTimes(1));

    // A real bill row + provider phone were resolved first.
    expect(createBillForNegotiation).toHaveBeenCalledWith({
      provider: "Comcast",
      currentAmount: 120,
    });

    // The dispatched input must carry EXACTLY the agent's BillNegotiationInput
    // fields — billId, providerPhone, targetAmount — not provider/currentMonthly/
    // targetMonthly. This is the contract that the router passes through verbatim.
    const dispatched = dispatchAction.mock.calls[0][0];
    expect(dispatched.requiresApproval).toBe(true);
    expect(dispatched.input).toEqual({
      billId: "bill-123",
      providerPhone: "+18009346489",
      targetAmount: 80,
    });

    // Every seeded key must be a real field on BillNegotiationInput (compile-time
    // + runtime contract guard against drift).
    const allowed: Array<keyof BillNegotiationInput> = [
      "billId",
      "providerPhone",
      "targetAmount",
      "voiceId",
      "poll",
    ];
    for (const key of Object.keys(dispatched.input ?? {})) {
      expect(allowed).toContain(key as keyof BillNegotiationInput);
    }

    // The approval gate is satisfied — the row is approved so the router runs.
    await waitFor(() =>
      expect(approveActionAction).toHaveBeenCalledWith("act-1"),
    );
  });
});
