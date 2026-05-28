// Inngest serve handler. Registers every agent's defineAgent side-effect by
// importing the agent packages, then exposes one Inngest function per
// registered (agentType, actionType) pair listening on
// `agent/<type>.<actionType>.requested`.
//
// PRD §10: 3 retries with exponential backoff is configured here.

import { serve } from "inngest/next";
import { Inngest } from "inngest";

// Side-effect imports — running these registers each agent in @fa/inngest's
// internal registry via defineAgent().
import "@fa/agent-daily-brief";
import "@fa/agent-spending-coach";
import "@fa/agent-subscription-killer";
import "@fa/agent-auto-saver";
import "@fa/agent-round-up";
import "@fa/goal-funder";

// Tier-2 agents. The first five register their AgentDefinition via
// defineAgent() at module load, so a bare side-effect import is enough.
import "@fa/agent-bill-negotiation";
import "@fa/agent-charge-dispute";
import "@fa/agent-card-optimizer";
import "@fa/agent-missing-money";
import "@fa/agent-refinance-watcher";

// Tier-3 agents. Each registers its (type, actionType) tuple via defineAgent()
// at module load, so a bare side-effect import is sufficient (none are
// dependency-injected like insurance-shopper).
import "@fa/agent-tax-prep";
import "@fa/agent-investment-rebalancer";
import "@fa/agent-net-worth-strategy";
import "@fa/agent-human-backup";

// Insurance shopper is dependency-injected (its agent is built lazily around a
// QuotePort), so importing the module does NOT register it. We must call the
// singleton builder once to register the ('insurance_shopper','requote') tuple.
//
// IMPORTANT: httpQuotePortFromEnv() throws at CONSTRUCTION when the aggregator
// env keys are missing (honesty contract — it never fabricates a port). Calling
// it at module scope would crash Next.js's build-time page-data collection.
// Instead we hand the builder a lazy port that defers env resolution to the
// first fetchQuotes() call — so an unconfigured env still throws HONESTLY at
// run time (never faking a quote), but module load / build stay clean.
import {
  getInsuranceShopperAgent,
  httpQuotePortFromEnv,
  type QuotePort,
  type QuoteRequest,
} from "@fa/agent-insurance-shopper";
import { refreshRates } from "@fa/agent-refinance-watcher";

import { runAgent } from "@fa/inngest";
import { _getRegistry } from "@fa/inngest/src/define-agent";
import { cronSpecs, hourlySyncUserHandler } from "@fa/plaid";

// Lazy QuotePort: resolves the env-driven HTTP port on first use. Still throws
// (does not fake) when INSURANCE_AGGREGATOR_URL/_API_KEY are unset — just at
// call time rather than module-load time.
const lazyQuotePort: QuotePort = {
  fetchQuotes: (req: QuoteRequest) => httpQuotePortFromEnv().fetchQuotes(req),
};

// Register the insurance-shopper agent exactly once (defineAgent throws on a
// duplicate tuple, and getInsuranceShopperAgent memoizes the single instance).
getInsuranceShopperAgent(lazyQuotePort);

const inngest = new Inngest({
  id: "fa-pilot",
  eventKey: process.env.INNGEST_EVENT_KEY,
});

const registry = _getRegistry();

const agentFunctions = Array.from(registry.values()).map((def) =>
  inngest.createFunction(
    { id: `agent-${def.type}-${def.actionType}`, retries: 3 },
    { event: `agent/${def.type}.${def.actionType}.requested` },
    async ({ event }) => {
      const data = event.data as {
        userId: string;
        agentId: string;
        input: Record<string, unknown>;
        target?: string | null;
      };
      return runAgent(def, {
        userId: data.userId,
        agentId: data.agentId,
        input: data.input,
        ...(data.target !== undefined ? { target: data.target } : {}),
      });
    },
  ),
);

// Plaid sync cron jobs + the per-user fan-out handler. Wiring lives in
// @fa/plaid's cronSpecs so schedule changes don't require app-layer edits.
const plaidFunctions = [
  inngest.createFunction(
    { id: cronSpecs.nightly.id },
    { cron: cronSpecs.nightly.cron },
    cronSpecs.nightly.handler,
  ),
  // Hourly cron: list active users, then fan out one `plaid.user.sync` event
  // per user. The fan-out lives here (not in @fa/plaid) because only the route
  // owns the Inngest client/step. Without this, the per-user sync function
  // below would never receive events. (cron.ts §120 returns { fanOut, userIds }.)
  inngest.createFunction(
    { id: cronSpecs.hourly.id },
    { cron: cronSpecs.hourly.cron },
    async ({ step }) => {
      const { userIds } = await step.run("list-active-users", () =>
        cronSpecs.hourly.handler(),
      );
      if (userIds.length > 0) {
        await step.sendEvent(
          "fan-out-user-sync",
          userIds.map((userId) => ({
            name: cronSpecs.hourly.eventName,
            data: { userId },
          })),
        );
      }
      return { fanOut: userIds.length };
    },
  ),
  inngest.createFunction(
    { id: "plaid-user-sync" },
    { event: cronSpecs.hourly.eventName },
    ({ event }) =>
      hourlySyncUserHandler((event.data as { userId: string }).userId),
  ),
];

// Refinance-watcher daily rate ingestion. Pulls today's published rates through
// the env-driven HttpRatePort and writes them to rate_snapshots before per-user
// evaluation runs. refreshRates() no-ops cleanly (returns skipped:'not_configured')
// when REFI_RATE_API_URL / REFI_RATE_API_KEY are unset — it never fabricates a
// rate, so this is safe to schedule even before credentials are provisioned.
// (Per-user runRefinanceWatcher fan-out is dispatched via the UI / a future
// pro-tier scan once a "list enabled users" helper exists — see integration notes.)
const refinanceFunctions = [
  inngest.createFunction(
    { id: "refi-rate-refresh", retries: 3 },
    { cron: "TZ=America/New_York 0 6 * * *" },
    () => refreshRates(),
  ),
];

// Investment-rebalancer quarterly trigger. Fires at 09:00 UTC on the 1st of
// Jan/Apr/Jul/Oct (the quarter boundaries). The rebalancer is recommend-only and
// requires a PER-USER target allocation + taxable-account set as
// InvestmentRebalancerInput — neither of which is fabricable from a cron alone.
// Like the refinance-watcher per-user fan-out, the per-user dispatch is deferred
// until a "list enabled users + their target allocations" helper exists; today
// the real run path is the Rebalancer page (UI dispatch with a default target +
// the user's resolved taxable-account ids). This cron computes the canonical
// quarter tag (e.g. "2026-Q2") used as
// the idempotency key so a future fan-out has a stable period to key on, and
// records that the quarter boundary fired. It never invents a target or emits a
// rebalance off fabricated numbers.
function currentQuarterTag(now = new Date()): string {
  const q = Math.floor(now.getUTCMonth() / 3) + 1;
  return `${now.getUTCFullYear()}-Q${q}`;
}
const rebalancerFunctions = [
  inngest.createFunction(
    { id: "rebalancer-quarterly", retries: 3 },
    { cron: "0 9 1 1,4,7,10 *" },
    () => ({ period: currentQuarterTag(), fanOut: 0, deferred: "no-enabled-users-helper" }),
  ),
];

const functions = [
  ...agentFunctions,
  ...plaidFunctions,
  ...refinanceFunctions,
  ...rebalancerFunctions,
];

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions,
});

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
