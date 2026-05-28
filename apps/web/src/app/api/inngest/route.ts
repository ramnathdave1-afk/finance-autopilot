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

import { runAgent } from "@fa/inngest";
import { _getRegistry } from "@fa/inngest/src/define-agent";
import { cronSpecs, hourlySyncUserHandler } from "@fa/plaid";

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

const functions = [...agentFunctions, ...plaidFunctions];

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions,
});

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
