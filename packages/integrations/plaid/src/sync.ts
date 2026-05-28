import { createServiceClient } from '@fa/db';
import { syncItemTransactions } from './transactions';

/** Sync every active provider_item for a user. */
export async function syncUser(userId: string): Promise<{ items: number; added: number }> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('provider_items')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'active');
  if (error) throw new Error(error.message);
  let added = 0;
  for (const row of data ?? []) {
    const r = await syncItemTransactions(row.id);
    added += r.added;
  }
  return { items: (data ?? []).length, added };
}

/** Hourly cron entrypoint — sync everyone. */
export async function syncAll(): Promise<{ users: number; items: number; added: number }> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('provider_items')
    .select('id, user_id')
    .eq('status', 'active');
  if (error) throw new Error(error.message);
  const users = new Set<string>();
  let added = 0;
  for (const row of data ?? []) {
    users.add(row.user_id);
    const r = await syncItemTransactions(row.id);
    added += r.added;
  }
  return { users: users.size, items: (data ?? []).length, added };
}
