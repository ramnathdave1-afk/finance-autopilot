import "server-only";
import { Inngest } from "inngest";
import type { AgentType } from "@fa/db";

let _client: Inngest | null = null;

/** Lazily-constructed Inngest client shared by the API routes that need to send events. */
export function getInngest(): Inngest {
  if (_client) return _client;
  _client = new Inngest({
    id: "fa-pilot",
    eventKey: process.env.INNGEST_EVENT_KEY,
  });
  return _client;
}

/**
 * Trigger an agent execution by emitting the event the inngest serve handler
 * is bound to (see /api/inngest/route.ts). All registered agents listen on
 * `agent/<type>.<actionType>.requested`.
 */
export async function sendAgentEvent(
  type: AgentType,
  actionType: string,
  data: Record<string, unknown>,
): Promise<void> {
  const name = `agent/${type}.${actionType}.requested`;
  await getInngest().send({ name, data });
}
