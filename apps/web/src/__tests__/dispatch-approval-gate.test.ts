import { describe, it, expect, vi, beforeEach } from "vitest";

// Server-side approval gate (defense-in-depth for the irreversible charge-
// dispute filing). dispatchAction must FORCE approval for irreversible actions
// regardless of the client-supplied requiresApproval flag: the row must land in
// awaiting_approval and NO router event may fire until the user approves.

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const startActionMock = vi.fn(async (input: { requiresApproval?: boolean }) => ({
  id: "act-1",
  status: input.requiresApproval ? "awaiting_approval" : "pending",
}));
vi.mock("@fa/db", () => ({
  approveAction: vi.fn(async () => {}),
  markCancelled: vi.fn(async () => {}),
  startAction: (...a: unknown[]) => startActionMock(...(a as [{ requiresApproval?: boolean }])),
  upsertAgent: vi.fn(async () => "11111111-1111-1111-1111-111111111111"),
  logStep: vi.fn(async () => {}),
  createServiceClient: vi.fn(() => ({})),
  setPauseAll: vi.fn(async () => {}),
}));

// Env present so dispatchAction takes the real path (not the no-env no-op).
vi.mock("@/lib/data/env", () => ({ hasSupabaseEnv: () => true }));
vi.mock("@/lib/current-user", () => ({ currentUserId: async () => "22222222-2222-2222-2222-222222222222" }));
vi.mock("@/lib/analytics/posthog", () => ({ track: vi.fn() }));

const sendMock = vi.fn(async () => {});
vi.mock("@/lib/api/inngest-client", () => ({ getInngest: () => ({ send: sendMock }) }));

import { dispatchAction } from "@/app/actions/agents";

describe("dispatchAction — server-side approval gate", () => {
  beforeEach(() => {
    startActionMock.mockClear();
    sendMock.mockClear();
  });

  it("forces approval for charge_dispute:file_dispute even when client passes requiresApproval:false", async () => {
    const res = await dispatchAction({
      agentType: "charge_dispute",
      actionType: "file_dispute",
      target: "ACME",
      requiresApproval: false,
    });
    expect(res.ok).toBe(true);

    // startAction was called with requiresApproval forced TRUE → row lands
    // awaiting_approval, never pending.
    expect(startActionMock).toHaveBeenCalledTimes(1);
    expect(startActionMock.mock.calls[0]![0]!.requiresApproval).toBe(true);

    // CRITICAL: no router event fired — the dispute does NOT run until the user
    // approves it. An immediate send would file the chargeback unconfirmed.
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("a non-irreversible action with requiresApproval:false runs immediately (router event fires)", async () => {
    const res = await dispatchAction({
      agentType: "spending_coach",
      actionType: "insight",
      requiresApproval: false,
    });
    expect(res.ok).toBe(true);
    expect(startActionMock.mock.calls[0]![0]!.requiresApproval).toBe(false);
    // Not gated → router event is emitted so it runs.
    expect(sendMock).toHaveBeenCalledTimes(1);
  });
});
