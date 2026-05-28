import { createServiceClient } from '@fa/db';

/**
 * Store a Plaid access token in Supabase Vault and return the secret id.
 * The plaintext is never written to a normal table or logged.
 */
export async function storeAccessToken(
  userId: string,
  providerItemId: string,
  accessToken: string,
): Promise<string> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc('vault_store_access_token', {
    p_user_id: userId,
    p_provider_item_id: providerItemId,
    p_access_token: accessToken,
  });
  if (error) throw new Error(`vault_store_access_token failed: ${error.message}`);
  if (!data) throw new Error('vault_store_access_token returned no id');
  return data as string;
}

export async function readAccessToken(secretId: string): Promise<string> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc('vault_read_access_token', {
    p_secret_id: secretId,
  });
  if (error) throw new Error(`vault_read_access_token failed: ${error.message}`);
  if (!data) throw new Error('vault secret not found');
  return data as string;
}

export async function deleteAccessToken(secretId: string): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase.rpc('vault_delete_access_token', {
    p_secret_id: secretId,
  });
  if (error) throw new Error(`vault_delete_access_token failed: ${error.message}`);
}
