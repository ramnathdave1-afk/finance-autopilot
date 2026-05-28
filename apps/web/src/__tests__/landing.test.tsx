import { describe, it, expect, vi } from "vitest";

vi.mock("@/app/actions/waitlist", () => ({
  joinWaitlistAction: vi.fn(),
  getWaitlistCount: vi.fn(async () => 12)
}));

import { getWaitlistCount } from "@/app/actions/waitlist";

describe("Landing", () => {
  it("reads waitlist count from server action", async () => {
    expect(await getWaitlistCount()).toBe(12);
  });
});
