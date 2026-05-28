# @fa/db

Owns Phase-1 Supabase schema, RLS policies, Vault helpers, and generated TS types
exported for every other terminal.

## Schema (Phase 1 / T2)

```
auth.users (Supabase)
   │
   └── public.users (1:1, auto-provisioned via trigger)
         │
         ├── connected_accounts ────┐
         │     ▲                    │
         │     │                    │
         ├── provider_items ────────┤    ← Plaid Item; vault_secret_id → vault.secrets
         │                          │
         ├── transactions ──────────┘    FK account_id → connected_accounts.id
         │     │
         │     └── subscription_id (nullable) → subscriptions.id
         │
         ├── subscriptions               (detected recurring charges)
         ├── goals
         ├── rules
         ├── agents                      (1 row per agent_type per user)
         │     │
         │     └── agent_actions         (audit log, audit_log jsonb)
         └── waitlist_signups            (anon insert allowed)
```

Enums: `pricing_tier`, `subscription_status`, `consent_mode`, `data_provider`,
`agent_type`, `action_status`.

## RLS

Every user-scoped table: `user_id = auth.uid()`. `users` table: `id = auth.uid()`.
Waitlist: insert-only for `anon` (no read).

Service role bypasses RLS — used inside cron + webhook routes only.

## Vault

Plaid access tokens are never stored in regular tables. Three SECURITY DEFINER RPCs:

- `vault_store_access_token(user_id, provider_item_id, access_token) → uuid`
- `vault_read_access_token(secret_id) → text`
- `vault_delete_access_token(secret_id) → void`

All three require `auth.role() = 'service_role'`. `provider_items.vault_secret_id`
holds the returned uuid.

## Applying migrations

```bash
DATABASE_URL=postgres://... pnpm --filter @fa/db migrate:apply
```

Or via Supabase CLI:

```bash
supabase db push   # uses supabase/migrations symlink (see apps/web)
```

## Env vars Terminal 1 needs

| Var | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Anon + service clients |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser + RLS-respecting server reads |
| `SUPABASE_SERVICE_ROLE_KEY` | T2 sync workers + webhook routes only — **never** ship to the browser |

## Imports for other terminals

```ts
import { createServiceClient } from '@fa/db';
import type {
  UserRow, ConnectedAccountRow, TransactionRow, SubscriptionRow,
  AgentRow, AgentActionRow, AgentType, ActionStatus, ConsentMode,
} from '@fa/db/types';
```
