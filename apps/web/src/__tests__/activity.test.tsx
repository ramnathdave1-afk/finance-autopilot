import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@fa/db", () => ({
  createServiceClient: () => ({ from: () => ({}) }),
  totalRoi: vi.fn(async () => 0)
}));

import { getActivityLog } from "@/lib/data/activity";
import { getTotalRoi } from "@/lib/data/roi";

describe("Activity fetchers (no env)", () => {
  it("returns empty activity when env missing", async () => {
    const rows = await getActivityLog("u1");
    expect(rows).toEqual([]);
  });
  it("returns stub ROI when env missing", async () => {
    const roi = await getTotalRoi("u1");
    expect(typeof roi).toBe("number");
  });
});
