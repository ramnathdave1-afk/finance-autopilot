import { z } from 'zod';
import { createHash } from 'node:crypto';
import { importJWK, jwtVerify, decodeProtectedHeader, type JWK } from 'jose';
import { createServiceClient } from '@fa/db';
import { getPlaidClient } from './client';
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
 * Verify a Plaid-Verification JWT against /webhook_verification_key/get.
 *
 * Plaid signs each webhook delivery with ES256 over a header that includes
 * `kid` (the key id) and `request_body_sha256` (a hash of the raw POST body).
 * To verify we:
 *   1. Decode the protected header to read the `kid`.
 *   2. Call /webhook_verification_key/get for that `kid` to fetch the JWK.
 *      (Plaid caches keys server-side; rotation = a new kid in a future
 *      delivery.)
 *   3. Verify the JWT signature with the JWK using ES256.
 *   4. Compare the JWT's `request_body_sha256` claim against
 *      sha256(rawBody) we compute locally.
 *   5. Reject if the JWT is older than 5 minutes (replay protection).
 *
 * Returns `true` only when all checks pass. In sandbox we keep the loose
 * pass-through so local dev doesn't require the signing infra.
 */
export async function verifyPlaidJwt(header: string | null, rawBody: string): Promise<boolean> {
  if (process.env.PLAID_ENV !== 'production') return true;
  if (!header) return false;

  let kid: string;
  try {
    const protected_ = decodeProtectedHeader(header);
    if (protected_.alg !== 'ES256' || typeof protected_.kid !== 'string') return false;
    kid = protected_.kid;
  } catch {
    return false;
  }

  const jwk = await fetchPlaidJwk(kid);
  if (!jwk) return false;

  try {
    const key = await importJWK(jwk, 'ES256');
    const { payload } = await jwtVerify(header, key, {
      algorithms: ['ES256'],
      maxTokenAge: '5m',
    });
    const sha = createHash('sha256').update(rawBody, 'utf8').digest('hex');
    if (payload.request_body_sha256 !== sha) return false;
    return true;
  } catch {
    return false;
  }
}

const jwkCache = new Map<string, { jwk: JWK; cachedAt: number }>();
const JWK_TTL_MS = 24 * 60 * 60 * 1000;

async function fetchPlaidJwk(kid: string): Promise<JWK | null> {
  const cached = jwkCache.get(kid);
  if (cached && Date.now() - cached.cachedAt < JWK_TTL_MS) return cached.jwk;

  try {
    const plaid = getPlaidClient();
    const res = await plaid.webhookVerificationKeyGet({ key_id: kid });
    const key = res.data.key as unknown as JWK;
    jwkCache.set(kid, { jwk: key, cachedAt: Date.now() });
    return key;
  } catch {
    return null;
  }
}
