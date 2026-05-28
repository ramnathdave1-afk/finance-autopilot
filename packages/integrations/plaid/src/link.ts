import { CountryCode, Products } from 'plaid';
import { z } from 'zod';
import { createServiceClient } from '@fa/db';
import { getPlaidClient } from './client';
import { storeAccessToken } from './vault';
import { upsertAccountsForItem } from './accounts';

const APP_NAME = 'Pilot';

/** Create a Plaid Link token bound to a specific user. */
export async function createLinkToken(userId: string): Promise<{ link_token: string; expiration: string }> {
  const plaid = getPlaidClient();
  const res = await plaid.linkTokenCreate({
    user: { client_user_id: userId },
    client_name: APP_NAME,
    products: [Products.Transactions],
    country_codes: [CountryCode.Us],
    language: 'en',
    webhook: process.env.PLAID_WEBHOOK_URL,
  });
  return { link_token: res.data.link_token, expiration: res.data.expiration };
}

const exchangeSchema = z.object({
  userId: z.string().uuid(),
  publicToken: z.string().min(1),
  institutionId: z.string().nullable().optional(),
  institutionName: z.string().nullable().optional(),
});

/**
 * Exchange a public_token for an access_token, persist the Plaid item with
 * the access_token in Supabase Vault, and seed the accounts table.
 *
 * Returns the internal provider_items row id.
 */
export async function exchangePublicToken(input: z.infer<typeof exchangeSchema>): Promise<string> {
  const { userId, publicToken, institutionId, institutionName } = exchangeSchema.parse(input);
  const plaid = getPlaidClient();
  const supabase = createServiceClient();

  const ex = await plaid.itemPublicTokenExchange({ public_token: publicToken });
  const accessToken = ex.data.access_token;
  const itemId = ex.data.item_id;

  const vaultSecretId = await storeAccessToken(userId, itemId, accessToken);

  const { data: row, error } = await supabase
    .from('provider_items')
    .upsert(
      {
        user_id: userId,
        provider: 'plaid',
        provider_item_id: itemId,
        institution_id: institutionId ?? null,
        institution_name: institutionName ?? null,
        vault_secret_id: vaultSecretId,
        status: 'active',
      },
      { onConflict: 'provider,provider_item_id' },
    )
    .select('id')
    .single();
  if (error || !row) throw new Error(`failed to persist provider_item: ${error?.message}`);

  await upsertAccountsForItem(userId, itemId, accessToken);
  return row.id;
}
