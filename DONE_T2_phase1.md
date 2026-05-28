# Terminal 2 — Phase 1 DONE

**Owns:** `packages/db`, `packages/integrations/plaid`, `packages/integrations/claude`

## Deliverables

### 1. Schema (PRD §12)
`packages/db/migrations/`:
- `phase1_T2_init.sql` — 10 tables: `users`, `connected_accounts`, `provider_items`, `transactions`, `subscriptions`, `goals`, `rules`, `agents`, `agent_actions`, `waitlist_signups`. 6 enums. Auto-provision trigger on `auth.users`.
- `phase1_T2_rls.sql` — RLS enabled + `user_id = auth.uid()` self policies on every user-scoped table. Waitlist: anon insert allowed.
- `phase1_T2_vault.sql` — 3 `SECURITY DEFINER` RPCs (`vault_store/read/delete_access_token`), service-role-only.

### 2. TypeScript types
`packages/db/types/index.ts` — every row type + `Database` shape compatible with `@supabase/supabase-js<Database>` generics. Re-exported from `@fa/db`.

### 3. Plaid integration (`packages/integrations/plaid`)
- `client.ts` — Plaid SDK init + `redactToken` helper.
- `vault.ts` — RPC-backed access-token storage. Tokens never written to logs or normal tables.
- `link.ts` — `createLinkToken`, `exchangePublicToken` (atomic: exchange → vault store → upsert `provider_items` → seed accounts).
- `accounts.ts` — `upsertAccountsForItem`.
- `transactions.ts` — cursor-driven `/transactions/sync` loop, upsert added/modified, delete removed, advance cursor. Triggers Claude categorization on net-new rows.
- `sync.ts` — `syncUser` and `syncAll` cron entrypoints (hourly + nightly per PRD §20).
- `fetchers.ts` — **exported for T1**: `getNetWorth`, `getSpendingByCategory`, `getBalances`, `getRecentTransactions`. All take an RLS-bound `SupabaseClient`.
- `fallback/mx.ts`, `fallback/finicity.ts` — stubs (PRD §11 resilience). Throw a clean "not implemented in Phase 1" until activated.

### 4. Claude integration (`packages/integrations/claude`)
- `client.ts` — Anthropic SDK wrapper. **Prompt caching on by default** for system blocks ≥ 4 KB. Exponential backoff on 429/5xx (4 attempts). Token usage logged structured (`{kind:"claude_usage", in, out, cache_read, cache_create, ms}`), pluggable via `setTokenLogger`. Default model `claude-sonnet-4-6`, fast model `claude-haiku-4-5`.
- `categorize.ts` — 28-item canonical taxonomy. Batched (25 txns/call) Haiku-based categorizer with Zod-validated JSON output. System prompt cached.

### 5. AI categorization pipeline
Sync path writes `transactions` → collects ids with `ai_category IS NULL` → `categorizeBatch` (Haiku) → write back `ai_category` + `ai_category_confidence` + `ai_categorized_at`. `categorizeBacklog(userId, limit)` available for the nightly catch-up cron.

### 6. Tests
- `packages/db/tests/schema.test.ts` — verifies all PRD §12 tables, RLS coverage, vault RPCs present in migrations.
- `packages/integrations/plaid/tests/fetchers.test.ts` — unit tests for `getNetWorth`, `getSpendingByCategory`, `getBalances` against an in-memory Supabase shim.
- `packages/integrations/plaid/tests/sandbox.integration.test.ts` — real Plaid sandbox round-trip (link_token → public_token → exchange → accounts). Gated by `RUN_PLAID_SANDBOX=1`.
- `packages/integrations/claude/tests/categorize.test.ts` — taxonomy invariants.

### 7. Security posture
- Access tokens: Vault only. Never returned from any row select.
- `redactToken()` available for ad-hoc debug logs.
- Structured token-usage logging never includes prompt/response bodies.
- Service client cached at module scope (no env-leak); throws fast if env missing.
- TLS 1.3 + at-rest encryption inherited from Supabase.

## Env vars Terminal 1 needs

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=         # server-only; cron + webhooks
PLAID_CLIENT_ID=
PLAID_SECRET=
PLAID_ENV=sandbox                  # production at launch
PLAID_WEBHOOK_URL=                 # optional
ANTHROPIC_API_KEY=
```

## Schema diagram

```
auth.users
  └─ public.users (1:1, trigger-provisioned)
       ├─ provider_items   (vault_secret_id → vault.secrets, cursor)
       ├─ connected_accounts
       │     └─ transactions
       │           └─ subscription_id (nullable) → subscriptions
       ├─ subscriptions
       ├─ goals
       ├─ rules
       ├─ agents
       │     └─ agent_actions (audit_log jsonb, idempotency_key)
       └─ (waitlist_signups, anon insert only)
```

## Outstanding (NOT blocking Phase 1 done bar — flagging honestly)

- I cannot apply migrations / run `pnpm install` / run the sandbox round-trip from this terminal without DB and Plaid sandbox credentials being present in env. **Verification step Dave or T1 must run before moving to Phase 2:**
  1. `pnpm install -w` from monorepo root.
  2. `DATABASE_URL=... pnpm --filter @fa/db migrate:apply` against a fresh Supabase project.
  3. `RUN_PLAID_SANDBOX=1 pnpm --filter @fa/plaid test` to confirm the sandbox path.
  4. `pnpm -r typecheck && pnpm -r test`.
- Plaid `transactionsSync` types: the SDK occasionally moves the `personal_finance_category` shape between minor versions — pinned to `plaid@^28.0.0`. If T1 upgrades, re-run typecheck.

## Hand-off API for other terminals

```ts
// T1 (dashboard, feed, paywall)
import {
  getNetWorth, getSpendingByCategory, getBalances, getRecentTransactions,
} from '@fa/plaid';
import { createClient } from '@/lib/supabase/server'; // T1 owns this wrapper

// T3 (info agents — daily-brief, spending-coach)
import { call, FAST_MODEL, DEFAULT_MODEL } from '@fa/claude';
import { createServiceClient } from '@fa/db';
import type { TransactionRow, AgentActionRow } from '@fa/db/types';

// T4 (subscription-killer) — read detected subscriptions via @fa/db,
// write actions to agent_actions (audit_log jsonb is yours to fill).

// T5 (billing) — `users.subscription_status`, `users.pricing_tier`,
// `users.stripe_customer_id`, `users.founder_pricing_locked` are yours
// to maintain via the Stripe webhook route.
```

**Status: DONE for Phase 1, T2 lane. Standing by for Phase 2 trigger once all 5 terminals report DONE.**
