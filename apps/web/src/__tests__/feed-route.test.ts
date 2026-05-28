import { describe, it, expect, vi, beforeEach } from "vitest";

// The feed route authenticates via requireUser(req). Mobile sends the session
// as `Authorization: Bearer <access_token>` with no cookies, so the server
// client's getUser() must be called WITH the token. These tests pin that
// behavior end-to-end (bearer -> user -> { items }), which previously 401'd.

vi.mock("server-only", () => ({}));

// next/headers cookies() is only reached on the cookie fallback path.
vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => [], set: () => {} }),
}));

const getUser = vi.fn();
const serviceRows = vi.fn();

// SSR cookie client — getUser(token) validates a bearer token; getUser()
// (no arg) reads cookies. We capture the argument to assert the token is used.
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getUser } }),
}));

// Service-role client used to read agent_actions for the resolved user.
vi.mock("@fa/db", () => ({
  createServiceClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: () => serviceRows(),
          }),
        }),
      }),
    }),
  }),
}));

import { GET } from "@/app/api/feed/route";

function req(headers: Record<string, string> = {}) {
  return new Request("http://localhost:3000/api/feed?limit=50", { headers });
}

describe("GET /api/feed — bearer auth", () => {
  beforeEach(() => {
    getUser.mockReset();
    serviceRows.mockReset();
  });

  it("resolves a user from the Authorization: Bearer token and returns { items }", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-123" } }, error: null });
    serviceRows.mockResolvedValue({
      data: [
        {
          id: "a1",
          agent_type: "subscription_killer",
          action_type: "cancel",
          target: "Planet Fitness",
          status: "awaiting_approval",
          roi_amount: 240,
          requested_at: "2026-05-28T00:00:00.000Z",
          completed_at: null,
        },
      ],
      error: null,
    });

    const res = await GET(req({ authorization: "Bearer access-token-abc" }));
    expect(res.status).toBe(200);

    // The token (not cookies) must have been used to resolve the user.
    expect(getUser).toHaveBeenCalledWith("access-token-abc");

    const body = (await res.json()) as { items: Array<{ id: string; kind: string }> };
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({ id: "a1", kind: "agent_action" });
  });

  it("returns an empty items array (not an error) when the user has no actions", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-123" } }, error: null });
    serviceRows.mockResolvedValue({ data: [], error: null });

    const res = await GET(req({ authorization: "Bearer access-token-abc" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[] };
    expect(body.items).toEqual([]);
  });

  it("401s on an invalid bearer token without falling back to cookies", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { message: "bad jwt" } });

    const res = await GET(req({ authorization: "Bearer expired" }));
    expect(res.status).toBe(401);
    // getUser is called exactly once (with the token) — no cookie fallback.
    expect(getUser).toHaveBeenCalledTimes(1);
    expect(getUser).toHaveBeenCalledWith("expired");
  });

  it("401s when no auth is present at all", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });

    const res = await GET(req());
    expect(res.status).toBe(401);
    // No bearer header -> cookie path -> getUser() called with no argument.
    expect(getUser).toHaveBeenCalledWith();
  });
});
