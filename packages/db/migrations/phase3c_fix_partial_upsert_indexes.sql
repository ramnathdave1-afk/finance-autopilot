-- Fix: PostgREST `.upsert(..., { onConflict })` cannot infer a PARTIAL unique
-- index. Two backing indexes were created partial (WHERE <col> IS NOT NULL),
-- so every upsert that targets them failed at runtime with
--   "there is no unique or exclusion constraint matching the ON CONFLICT specification"
-- This broke the core Plaid onboarding path (connected_accounts upsert in
-- exchangePublicToken / MX / Finicity) and investment-holdings sync — none of
-- which the mock unit tests exercised (they stubbed Supabase).
--
-- Replacing the partial indexes with full unique indexes. NULLs remain DISTINCT
-- in Postgres by default, so rows with a null provider_account_id / security_id
-- (manually-added accounts, cash holdings) are still permitted — the original
-- intent of the WHERE predicate is preserved.

drop index if exists public.connected_accounts_provider_account_uniq;
create unique index if not exists connected_accounts_provider_account_uniq
  on public.connected_accounts(provider, provider_account_id);

drop index if exists public.holdings_uniq;
create unique index if not exists holdings_uniq
  on public.investment_holdings(account_id, security_id, as_of);
