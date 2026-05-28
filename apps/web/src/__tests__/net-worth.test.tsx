import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@fa/db", () => ({
  createServiceClient: () => ({ from: () => ({}) }),
  totalRoi: vi.fn(async () => 0)
}));

import { getNetWorth } from "@/lib/data/net-worth";

describe("Net worth fetcher", () => {
  it("returns a snapshot with trend of length 30", async () => {
    const snap = await getNetWorth("u1");
    expect(snap.trend.length).toBe(30);
    expect(typeof snap.current).toBe("number");
  });
});
