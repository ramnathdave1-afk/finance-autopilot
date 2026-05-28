// Centralized check — when Supabase env vars are missing, fetchers gracefully
// fall back to stub data. Lets the app run without a DB during local dev and
// during prerender (no env in build sandbox).

export function hasSupabaseEnv(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}
