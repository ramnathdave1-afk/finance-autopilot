import { describe, it, expect, vi } from "vitest";
import { stubFeed } from "@/lib/feed-stub";

vi.mock("server-only", () => ({}));

describe("Feed stub data", () => {
  it("contains showcase cards", () => {
    expect(stubFeed.find((c) => c.title.includes("Planet Fitness"))).toBeTruthy();
    expect(stubFeed.find((c) => c.title.includes("Uber Eats"))).toBeTruthy();
  });
});
