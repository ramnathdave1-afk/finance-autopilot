import { logStep } from '@fa/db';

export async function writeAuditEntry(
  actionId: string,
  step: string,
  ok: boolean,
  detail?: Record<string, unknown>,
): Promise<void> {
  await logStep(actionId, { step, ok, detail: detail ?? {} });
}
