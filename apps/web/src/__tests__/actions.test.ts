import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@fa/db", () => ({
  approveAction: vi.fn(async () => {}),
  markCancelled: vi.fn(async () => {}),
  startAction: vi.fn(async () => ({ id: "act-1" })),
  setPauseAll: vi.fn(async () => {})
}));

import { approveActionAction, skipActionAction, dispatchAction } from "@/app/actions/agents";
import { setPauseAllAction } from "@/app/actions/pause";

describe("server actions (no env -> graceful no-op)", () => {
  it("approve returns ok", async () => {
    const r = await approveActionAction("a-1");
    expect(r.ok).toBe(true);
  });
  it("skip returns ok", async () => {
    const r = await skipActionAction("a-1");
    expect(r.ok).toBe(true);
  });
  it("dispatch returns ok with stub actionId", async () => {
    const r = await dispatchAction({
      agentId: "agent-1",
      agentType: "subscription_killer",
      actionType: "cancel"
    });
    expect(r.ok).toBe(true);
  });
  it("setPauseAll returns ok", async () => {
    const r = await setPauseAllAction(true);
    expect(r.ok).toBe(true);
  });
});
