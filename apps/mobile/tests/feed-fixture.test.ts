import { mockFeed } from "../src/fixtures/feed";

describe("feed fixture", () => {
  test("contains all four card kinds so the feed renderer is exercised", () => {
    const kinds = new Set(mockFeed.map((f) => f.kind));
    expect(kinds.has("agent_action")).toBe(true);
    expect(kinds.has("win")).toBe(true);
    expect(kinds.has("insight")).toBe(true);
    expect(kinds.has("alert")).toBe(true);
  });

  test("every item has a stable id and an agent label", () => {
    for (const item of mockFeed) {
      expect(item.id).toMatch(/.+/);
      expect(item.agentLabel.length).toBeGreaterThan(0);
    }
  });
});
