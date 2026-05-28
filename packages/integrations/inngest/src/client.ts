// Thin Inngest client wrapper. We keep the surface minimal so we can swap
// transports (Inngest cloud vs local dev) without touching agent code.
//
// At runtime, agents are registered via defineAgent. Until the real Inngest
// SDK is wired in apps/web's API route, the local runner is used end-to-end
// (tests + dev). See runAgent() in define-agent.ts.

export interface InngestClient {
  /** Enqueue an event by name. Real impl will hit Inngest cloud. */
  send(event: { name: string; data: Record<string, unknown> }): Promise<{ ids: string[] }>;
}

class LocalInngestClient implements InngestClient {
  async send(_event: { name: string; data: Record<string, unknown> }): Promise<{ ids: string[] }> {
    // Local no-op. Tests use runAgent() directly.
    return { ids: [crypto.randomUUID()] };
  }
}

let _client: InngestClient = new LocalInngestClient();

export function getInngestClient(): InngestClient {
  return _client;
}

export function setInngestClient(client: InngestClient): void {
  _client = client;
}
