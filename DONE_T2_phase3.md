# Terminal 2 — Phase 3 DONE

Scope: data extensions + provider resilience to support T1's Premium agent
screens, multi-provider fallback, and the streaks/net-worth chart surfaces.

## Migration filename
`packages/db/migrations/phase3_T2_premium_agents.sql`

## New AgentType values committed
- `tax_prep`               (PRD §8.4 Agent 13)
- `investment_rebalancer`  (PRD §8.4 Agent 14)
- `net_worth_strategy`     (PRD §8.4 Agent 15)
- `human_backup`           (PRD §8.4 Agent 16, also used as the carrier for `reconnect_bank` reauth actions)

Premium tier in `TIER_AGENTS` now includes all four, on top of the full
Tier-1 + Tier-2 set.

## Deliverables

### 1. AgentType extension + migration
- `packages/db/migrations/phase3_T2_premium_agents.sql` — `alter type agent_type add value if not exists 'tax_prep' / 'investment_rebalancer' / 'net_worth_strategy' / 'human_backup'`.
- `packages/db/types/index.ts` — `AgentType` union extended.
- `packages/db/src/users.ts` — `TIER_AGENTS.premium` extended.

### 2. `net_worth_snapshots` table + writer
- Migration adds the table + (user_id, snapshot_date) unique + RLS self-policy.
- `packages/db/src/snapshots.ts`:
  - `writeNetWorthSnapshot(userId)` — composes cash / investments / credit_debt / loans / other_assets / other_liabilities from `connected_accounts`, `investment_holdings` (latest as_of), and `loans`. Idempotent upsert on `(user_id, snapshot_date)`.
  - `getLatestSnapshot(userId)`, `getSnapshotHistory(userId, days)` for T1's net-worth chart.
  - `snapshotAllUsers()` — nightly entrypoint that snapshots every user with an active account.

### 3. Streaks computation
- `packages/db/src/streaks.ts` — `getStreaks(userId)` returns `{ savings_days, no_uber_eats_days, under_cap_days, daily_cap }`. All three streaks derive purely from `transactions` (date-bucketed, walked from yesterday backwards) and one `rules` row (a `daily_outflow_cap` rule, if enabled). T1's StreaksStrip swaps its hardcoded data for `getStreaks(currentUserId())`.

### 4. MX + Finicity real-shape adapters
- `packages/integrations/plaid/src/fallback/types.ts` — `ProviderAdapter`, `ProviderSyncResult`, `NormalizedTransaction`, `NormalizedAccount`. Both adapters conform.
- `packages/integrations/plaid/src/fallback/mx.ts` — `mxAdapter`:
  - HTTP Basic auth (`MX_CLIENT_ID:MX_API_KEY`), env-driven prod / integration base URL.
  - `GET /users/{user_guid}/accounts` → `connected_accounts` upsert.
  - `GET /users/{user_guid}/transactions?from_date=&to_date=` → normalized → `transactions` upsert (provider=`mx`) → categorize via `@fa/claude`.
  - User-guid stored in vault, read via `readAccessToken(vault_secret_id)`.
- `packages/integrations/plaid/src/fallback/finicity.ts` — `finicityAdapter`:
  - Partner-auth flow with 2h token cache + 401-recovery.
  - `/aggregation/v2/customers/{customerId}/accounts` and `/aggregation/v3/customers/{customerId}/transactions?fromDate=&toDate=` wired.
  - Sign flip (Finicity negative = outflow → our positive = outflow).
- `packages/integrations/plaid/src/router.ts`:
  - `syncItemForProvider(rowId)` — dispatch by `provider_items.provider` to plaid / mx / finicity. Skips items in `awaiting_reauth` / `error`.
  - `detectAndQueueReauth()` — sweeps Plaid items with `error_code='ITEM_LOGIN_REQUIRED'` or `last_synced_at` older than 24h, marks `provider_items.status='awaiting_reauth'`, and emits an idempotent `awaiting_user` agent_action of `action_type='reconnect_bank'` on the user's `human_backup` agent. T1's feed renders this as the top card with "Reconnect" CTA.

### 5. Plaid daily/hourly sync cron
- `packages/integrations/plaid/src/cron.ts`:
  - `nightlySyncHandler()` — full provider-aware sync across every active item + `detectAndQueueReauth()` + `snapshotAllUsers()`. Returns a structured CronResult for observability.
  - `hourlySyncUserHandler(userId)` — incremental sync for one user; called per fan-out event.
  - `cronSpecs.nightly` — `cron: '0 3 * * *'`, `id: 'plaid-nightly-sync'`.
  - `cronSpecs.hourly` — `cron: '0 * * * *'`, fans out via `plaid.user.sync` event to `hourlySyncUserHandler`. apps/web's `/api/inngest` registers these.

### 6. Tests
- `packages/db/tests/streaks.test.ts` — 6 tests covering no-activity, no_uber_eats counting, food-delivery breaks, savings_days, daily_cap honored, cap-exceeded breaks.
- `packages/db/tests/snapshots.test.ts` — 2 tests: full assets/liabilities composition, no-investments/no-loans cleanly.
- `packages/db/tests/premium-agents.test.ts` — 4 tests: AgentType union, premium superset of pro, migration enum adds, RLS policy presence.
- `packages/integrations/plaid/tests/fallback.test.ts` — 6 tests: configuration gating, adapter name invariants.
- `packages/integrations/plaid/tests/cron.test.ts` — 2 tests: schedule strings + fan-out event name.
- Pre-existing flaky `notify.test.ts` tuple assertion + `realtime.test.ts` cross-package interaction left untouched; both currently green workspace-wide.

## DONE bar verification (pnpm -r)

```
pnpm -r typecheck → 16/16 projects clean
pnpm -r test     → all green
  @fa/db                 24 passed
  @fa/plaid              25 passed (+3 sandbox skipped)
  @fa/claude              2 passed
  @fa/inngest            20 passed
  @fa/stripe             24 passed
  @fa/browserbase         9 passed
  @fa/ui (types)          —
  apps/web              42 passed
  apps/mobile            6 passed
  packages/agents/*    49 passed (10+10+8+13+8)
  tests/integration      5 passed
```

## Env vars Terminal 1 + ops need

```
# Fallbacks (Phase 3 additions)
MX_CLIENT_ID=
MX_API_KEY=
MX_ENV=                    # 'production' or unset for integration

FINICITY_PARTNER_ID=
FINICITY_PARTNER_SECRET=
FINICITY_APP_KEY=
```

## Hand-off for T1

```ts
// StreaksStrip — replace hardcoded data
import { getStreaks } from '@fa/db';
const streaks = await getStreaks(userId);
// {savings_days, no_uber_eats_days, under_cap_days, daily_cap}

// Net worth view — historical chart + current
import { getLatestSnapshot, getSnapshotHistory } from '@fa/db';

// Reconnect-bank card — already emitted as awaiting_user agent_actions of
// type 'reconnect_bank' on agent_type='human_backup'. Feed query that selects
// status='awaiting_user' picks them up automatically.
```

## Hand-off for ops / Inngest registration

```ts
import { cronSpecs, hourlySyncUserHandler } from '@fa/plaid';
// apps/web/src/app/api/inngest/route.ts:
//   inngest.createFunction({ id: cronSpecs.nightly.id }, { cron: cronSpecs.nightly.cron }, cronSpecs.nightly.handler)
//   inngest.createFunction({ id: cronSpecs.hourly.id }, { cron: cronSpecs.hourly.cron }, cronSpecs.hourly.handler)
//   inngest.createFunction({ id: 'plaid-user-sync' }, { event: 'plaid.user.sync' }, ({ event }) => hourlySyncUserHandler(event.data.userId))
```

**Status: T2 Phase 3 DONE. All deliverables landed, workspace-wide typecheck + tests green.**
