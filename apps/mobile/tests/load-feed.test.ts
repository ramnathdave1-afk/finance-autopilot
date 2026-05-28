// Deterministic test for the feed-loading state machine (src/lib/load-feed).
// Runs on the cheap node-env "ts" jest project — no jest-expo / RN rendering,
// no real network. Covers the ready / empty / error transitions that the
// feed screen renders, which previously had zero coverage.
//
// NOTE: the RN component suite (tests/*.test.tsx) is NOT run by the default
// `pnpm --filter @fa/mobile test` — see jest.config.js. This test exists so
// the feed wiring is still verified while the jest-expo project is disabled.

const mockGetSession = jest.fn();
const mockApiGet = jest.fn();

jest.mock("../src/lib/supabase", () => ({
  supabase: { auth: { getSession: (...a: unknown[]) => mockGetSession(...a) } },
}));
jest.mock("../src/lib/api", () => ({
  apiGet: (...a: unknown[]) => mockApiGet(...a),
}));

import { loadFeed } from "../src/lib/load-feed";

beforeEach(() => {
  mockGetSession.mockReset();
  mockApiGet.mockReset();
});

describe("loadFeed", () => {
  test("ready: passes the access token to apiGet and returns items", async () => {
    mockGetSession.mockResolvedValue({ data: { session: { access_token: "tok-123" } } });
    mockApiGet.mockResolvedValue({
      items: [{ id: "a1", kind: "win", agent: "auto_saver", agentLabel: "Auto-Saver", timestamp: "t", title: "Saved", roiAmount: 12 }],
    });

    const state = await loadFeed();

    expect(mockApiGet).toHaveBeenCalledWith("/api/feed", "tok-123");
    expect(state).toEqual({
      status: "ready",
      items: [{ id: "a1", kind: "win", agent: "auto_saver", agentLabel: "Auto-Saver", timestamp: "t", title: "Saved", roiAmount: 12 }],
    });
  });

  test("empty: a ready state with no items (caught-up screen)", async () => {
    mockGetSession.mockResolvedValue({ data: { session: { access_token: "tok-123" } } });
    mockApiGet.mockResolvedValue({ items: [] });

    const state = await loadFeed();
    expect(state).toEqual({ status: "ready", items: [] });
  });

  test("error: apiGet rejection (e.g. 401) becomes an error state, never throws", async () => {
    mockGetSession.mockResolvedValue({ data: { session: { access_token: "tok-123" } } });
    mockApiGet.mockRejectedValue(new Error("GET /api/feed failed: 401"));

    const state = await loadFeed();
    expect(state).toEqual({ status: "error", message: "GET /api/feed failed: 401" });
  });

  test("no session: token is undefined and a failed fetch still yields error state", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockApiGet.mockRejectedValue(new Error("GET /api/feed failed: 401"));

    const state = await loadFeed();
    expect(mockApiGet).toHaveBeenCalledWith("/api/feed", undefined);
    expect(state.status).toBe("error");
  });
});
