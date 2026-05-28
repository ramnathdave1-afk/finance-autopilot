import { describe, it, expect, vi, beforeEach } from "vitest";

// The hourly Plaid cron must fan out one `plaid.user.sync` event per active
// user, otherwise the per-user incremental sync function never runs. This test
// captures the function the route registers for the hourly cron and drives it
// with a fake Inngest `step` to assert the fan-out happens.

vi.mock("server-only", () => ({}));

// Agent side-effect imports — registering them needs nothing here.
vi.mock("@fa/agent-daily-brief", () => ({}));
vi.mock("@fa/agent-spending-coach", () => ({}));
vi.mock("@fa/agent-subscription-killer", () => ({}));
vi.mock("@fa/agent-auto-saver", () => ({}));
vi.mock("@fa/agent-round-up", () => ({}));
vi.mock("@fa/goal-funder", () => ({}));

// Tier-2 agents. The route imports these for their defineAgent side effects;
// the fan-out cron under test doesn't touch them, so empty stubs suffice. The
// refinance + insurance modules also expose named functions the route calls at
// module scope (refreshRates, getInsuranceShopperAgent), so stub those too.
vi.mock("@fa/agent-bill-negotiation", () => ({}));
vi.mock("@fa/agent-charge-dispute", () => ({}));
vi.mock("@fa/agent-card-optimizer", () => ({}));
vi.mock("@fa/agent-missing-money", () => ({}));
vi.mock("@fa/agent-refinance-watcher", () => ({
  refreshRates: vi.fn().mockResolvedValue({ source: "mock", fetched: 0, written: 0, skipped: "not_configured" }),
}));
vi.mock("@fa/agent-insurance-shopper", () => ({
  getInsuranceShopperAgent: vi.fn(),
}));

vi.mock("@fa/inngest", () => ({ runAgent: vi.fn() }));
vi.mock("@fa/inngest/src/define-agent", () => ({
  _getRegistry: () => new Map(),
}));

const hourlyHandler = vi.fn();
vi.mock("@fa/plaid", () => ({
  hourlySyncUserHandler: vi.fn(),
  cronSpecs: {
    nightly: { id: "plaid-nightly-sync", cron: "0 3 * * *", handler: vi.fn() },
    hourly: {
      id: "plaid-hourly-sync",
      cron: "0 * * * *",
      eventName: "plaid.user.sync",
      handler: hourlyHandler,
    },
  },
}));

// Capture every (config, trigger, handler) the route registers.
type Registered = {
  config: { id: string };
  trigger: { cron?: string; event?: string };
  handler: (arg: unknown) => unknown;
};
const registered: Registered[] = [];

vi.mock("inngest", () => ({
  Inngest: class {
    createFunction(config: Registered["config"], trigger: Registered["trigger"], handler: Registered["handler"]) {
      registered.push({ config, trigger, handler });
      return { config, trigger, handler };
    }
  },
}));

vi.mock("inngest/next", () => ({
  serve: () => ({ GET: vi.fn(), POST: vi.fn(), PUT: vi.fn() }),
}));

beforeEach(() => {
  registered.length = 0;
  hourlyHandler.mockReset();
  // The route registers functions at module load; reset so each test
  // re-evaluates it and repopulates `registered`.
  vi.resetModules();
});

describe("Plaid hourly cron fan-out", () => {
  it("emits one plaid.user.sync event per active user", async () => {
    hourlyHandler.mockResolvedValue({ fanOut: 2, userIds: ["u1", "u2"] });

    await import("@/app/api/inngest/route");

    const hourly = registered.find((r) => r.config.id === "plaid-hourly-sync");
    expect(hourly, "hourly cron function should be registered").toBeTruthy();
    expect(hourly!.trigger.cron).toBe("0 * * * *");

    const sendEvent = vi.fn();
    const step = {
      run: (_id: string, fn: () => unknown) => fn(),
      sendEvent,
    };
    const result = (await hourly!.handler({ step })) as { fanOut: number };

    expect(hourlyHandler).toHaveBeenCalledTimes(1);
    expect(result.fanOut).toBe(2);
    expect(sendEvent).toHaveBeenCalledTimes(1);
    const [, events] = sendEvent.mock.calls[0];
    expect(events).toEqual([
      { name: "plaid.user.sync", data: { userId: "u1" } },
      { name: "plaid.user.sync", data: { userId: "u2" } },
    ]);

    // The per-user sync function listens on the same event name.
    const userSync = registered.find((r) => r.config.id === "plaid-user-sync");
    expect(userSync!.trigger.event).toBe("plaid.user.sync");

    // The refinance-watcher daily rate-refresh cron is registered alongside.
    const refiRefresh = registered.find((r) => r.config.id === "refi-rate-refresh");
    expect(refiRefresh, "refi-rate-refresh cron should be registered").toBeTruthy();
    expect(refiRefresh!.trigger.cron).toContain("6 * * *");
  });

  it("sends no events when there are no active users", async () => {
    hourlyHandler.mockResolvedValue({ fanOut: 0, userIds: [] });

    await import("@/app/api/inngest/route");
    const hourly = registered.find((r) => r.config.id === "plaid-hourly-sync");

    const sendEvent = vi.fn();
    const step = { run: (_id: string, fn: () => unknown) => fn(), sendEvent };
    const result = (await hourly!.handler({ step })) as { fanOut: number };

    expect(result.fanOut).toBe(0);
    expect(sendEvent).not.toHaveBeenCalled();
  });
});
