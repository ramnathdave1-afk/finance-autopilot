import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types';

let cachedService: SupabaseClient<Database> | null = null;

/**
 * Service-role client. Bypasses RLS. Use only inside trusted server code
 * (cron jobs, webhooks, sync workers). Never expose to the browser.
 */
export function createServiceClient(): SupabaseClient<Database> {
  if (cachedService) return cachedService;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE service env vars missing (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)');
  }
  cachedService = createSupabaseClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedService;
}
