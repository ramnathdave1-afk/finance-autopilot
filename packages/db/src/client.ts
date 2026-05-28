import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';

// Service client: fully untyped so downstream packages (agents, stripe,
// browserbase) can do `.from('x').insert(...)` without the schema-less
// `SupabaseClient` collapsing inserts to `never` under strict tsconfig.
// Rich row types still live in `@fa/db/types` for callers that want them.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, any, any>;

let cachedService: AnyClient | null = null;

/**
 * Service-role client. Bypasses RLS. Use only inside trusted server code
 * (cron jobs, webhooks, sync workers). Never expose to the browser.
 */
export function createServiceClient(): AnyClient {
  if (cachedService) return cachedService;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE service env vars missing (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)');
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cachedService = createSupabaseClient<any, any, any>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedService;
}
