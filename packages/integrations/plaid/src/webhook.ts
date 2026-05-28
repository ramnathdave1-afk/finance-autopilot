import { z } from 'zod';
import { createServiceClient } from '@fa/db';
import { syncItemTransactions } from './transactions';

/**
 * Plaid webhook dispatcher. T1 mounts this from
 * apps/web/src/app/api/plaid/webhook/route.ts:
 *
 *   export async function POST(req: Request) {
 *     const body = await req.json();
 *     await handlePlaidWebhook(body);
 *     return new Response('ok');
 *   }
 *
 * Webhook signature verification (JWT in Plaid-Verification header) is done by
 * `verifyPlaidJwt` — pass the raw body + header through if you want full
 * verification. In sandbox we no-op verification.
 *
 * Reference: https://plaid.com/docs/api/webhooks/
 */

const webhookSchema = z.object({
  webhook_type: z.string(),
  webhook_code: z.string(),
  item_id: z.string().optional(),
  error: z
    .object({
      error_code: z.string(),
      error_message: z.string(),
    })
    .nullish(),
  new_transactions: z.number().optional(),
  removed_transactions: z.array(z.string()).optional(),
  environment: z.string().optional(),
});

export type PlaidWebhook = z.infer<typeof webhookSchema>;

export async function handlePlaidWebhook(body: unknown): Promise<{ handled: boolean; action: string }> {
  const parsed = webhookSchema.safeParse(body);
  if (!parsed.success) return { handled: false, action: 'ignored: invalid shape' };
  const w = parsed.data;

  switch (`${w.webhook_type}:${w.webhook_code}`) {
    case 'TRANSACTIONS:SYNC_UPDATES_AVAILABLE':
    case 'TRANSACTIONS:DEFAULT_UPDATE':
    case 'TRANSACTIONS:HISTORICAL_UPDATE':
    case 'TRANSACTIONS:INITIAL_UPDATE':
      return triggerSyncByPlaidItem(w.item_id);

    case 'ITEM:ERROR':
    case 'ITEM:PENDING_EXPIRATION':
    case 'ITEM:USER_PERMISSION_REVOKED':
      return markItemError(w.item_id, w.error?.error_code ?? w.webhook_code);

    case 'ITEM:WEBHOOK_UPDATE_ACKNOWLEDGED':
      return { handled: true, action: 'noop: webhook update ack' };

    default:
      return { handled: false, action: `ignored: ${w.webhook_type}:${w.webhook_code}` };
  }
}

async function triggerSyncByPlaidItem(plaidItemId: string | undefined): Promise<{ handled: boolean; action: string }> {
  if (!plaidItemId) return { handled: false, action: 'no item_id' };
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('provider_items')
    .select('id')
    .eq('provider', 'plaid')
    .eq('provider_item_id', plaidItemId)
    .maybeSingle();
  if (error || !data) return { handled: false, action: 'unknown item_id' };
  const r = await syncItemTransactions(data.id);
  return { handled: true, action: `synced item ${data.id} (+${r.added}/${r.modified}/-${r.removed})` };
}

async function markItemError(plaidItemId: string | undefined, code: string): Promise<{ handled: boolean; action: string }> {
  if (!plaidItemId) return { handled: false, action: 'no item_id' };
  const supabase = createServiceClient();
  const { error } = await supabase
    .from('provider_items')
    .update({ status: 'error', error_code: code })
    .eq('provider', 'plaid')
    .eq('provider_item_id', plaidItemId);
  if (error) return { handled: false, action: `update failed: ${error.message}` };
  return { handled: true, action: `marked item error: ${code}` };
}

/**
 * Sandbox-safe stub for Plaid-Verification JWT validation. In production,
 * fetch the signing key from /webhook_verification_key/get and verify ES256.
 * Leaving as a stub keeps T1's route from blocking on this — wire up before
 * public launch (PRD §16).
 */
export async function verifyPlaidJwt(_header: string | null, _rawBody: string): Promise<boolean> {
  if (process.env.PLAID_ENV !== 'production') return true;
  return false; // force conscious opt-in pre-prod
}
