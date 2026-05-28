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

import { runAgent } from "@fa/inngest";
import { _getRegistry } from "@fa/inngest/src/define-agent";

const inngest = new Inngest({
  id: "fa-pilot",
  eventKey: process.env.INNGEST_EVENT_KEY,
});

const registry = _getRegistry();

const functions = Array.from(registry.values()).map((def) =>
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

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions,
});

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
