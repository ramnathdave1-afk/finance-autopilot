# Terminal 2 — Phase 2 DONE

Phase 2 scope (per AGENT_ASSIGNMENTS conventions): data layer to unblock the
Tier-2 agents owned by T4 (PRD §8.3 + §21 Phase 4).

## Deliverables

### 1. Schema (`packages/db/migrations/`)
- `phase2_T2_tier2_tables.sql` — 11 new tables:
  - `bills`, `bill_negotiations` → Agent 7 (Voice Negotiation)
  - `disputes` → Agent 8 (Charge Dispute)
  - `cards` (catalog), `user_cards` → Agent 9 (Credit Card Optimizer)
  - `unclaimed_finds` → Agent 10 (Missing Money)
  - `loans`, `rate_snapshots` (catalog) → Agent 11 (Refinance Watcher)
  - `insurance_policies`, `insurance_quotes` → Agent 12 (Insurance Shopper)
  - `investment_holdings` → Pro-tier net worth (PRD §13)
- 4 new enums: `dispute_status`, `bill_negotiation_status`, `loan_type`, `insurance_kind`
- `phase2_T2_tier2_rls.sql` — user_id self-policies on all user-scoped tables;
  `cards` + `rate_snapshots` read-only for any authenticated user (shared catalog).

### 2. TypeScript types (`packages/db/types/index.ts`)
Added Row types + Database table entries for every new table. New enum unions
exported: `DisputeStatus`, `BillNegotiationStatus`, `LoanType`, `InsuranceKind`,
plus `CardRewardRule` for the rewards JSONB shape.

### 3. Anomaly detection (`@fa/plaid`)
- `detectAnomalies(userId, lookbackDays)` — duplicate-charge detection (same
  merchant + amount within 3 days) + outlier-amount detection (≥3× user's
  median for that merchant). Returns `AnomalyFlag[]` with `score`, `reason`,
  human-readable `detail`. T4's Charge Dispute Agent feeds these into the
  user's pending-decisions inbox.
- `detectChargesAfterCancellation(userId)` — charges hitting a subscription
  whose status is `cancelled`. Highest-confidence dispute candidate.

### 4. Plaid Investments (`@fa/plaid`)
- `syncHoldingsForItem(providerItemRowId)` — pulls `/investments/holdings/get`,
  upserts (account, security_id, as_of) into `investment_holdings`. Cleanly
  no-ops on items without Investments products (cash-only banks).
- `investmentNetWorth(userId)` — sums latest-day current_value. T1's net-worth
  view sums this with `getNetWorth` from Phase 1 for a complete picture.

### 5. Spending profile (`@fa/plaid`)
- `buildSpendingProfile(userId, windowMonths)` — annualized $/category from
  last N months of categorized transactions, with `topCategories` ranked by
  share. T4's Credit Card Optimizer joins this against the `cards` catalog
  to recommend the user's optimal card mix.

### 6. Tests
- `packages/db/tests/schema-phase2.test.ts` — verifies all 11 tables, all 4
  enums, RLS coverage, catalog table read policies.
- `packages/integrations/plaid/tests/anomaly.test.ts` — heuristic invariants.
- All other Phase 1 tests still green.

## Verified locally
```
pnpm --filter @fa/db --filter @fa/plaid --filter @fa/claude typecheck → clean
pnpm --filter @fa/db --filter @fa/plaid --filter @fa/claude test
  → @fa/db:     12/12 passed (schema + schema-phase2 + tier-gating)
  → @fa/plaid:  15/15 passed (+3 sandbox skipped)
  → @fa/claude:  2/2 passed
```

## Hand-off API for Tier-2 agents (T4)

```ts
// Charge Dispute Agent
import { detectAnomalies, detectChargesAfterCancellation } from '@fa/plaid';
import type { DisputeRow, DisputeStatus } from '@fa/db/types';

// Credit Card Optimizer
import { buildSpendingProfile } from '@fa/plaid';
import type { CardRow, UserCardRow, CardRewardRule } from '@fa/db/types';

// Bill Negotiation
import type { BillRow, BillNegotiationRow, BillNegotiationStatus } from '@fa/db/types';

// Missing Money
import type { UnclaimedFindRow } from '@fa/db/types';

// Refinance Watcher
import type { LoanRow, LoanType, RateSnapshotRow } from '@fa/db/types';

// Insurance Shopper
import type { InsurancePolicyRow, InsuranceQuoteRow, InsuranceKind } from '@fa/db/types';

// Pro-tier net worth completeness
import { syncHoldingsForItem, investmentNetWorth } from '@fa/plaid';
import type { InvestmentHoldingRow } from '@fa/db/types';
```

All Tier-2 agents already use the Phase-1 helpers from T2 too: `startAction`,
`logStep`, `markSucceeded`, `markFailed`, `canAct` from `@fa/db`.

## Outstanding (not blocking Phase 2 sign-off)

- `cards` catalog is empty — T4 needs to seed top-50 cards (PRD §8.3 Agent 9).
  Schema is ready; seed migration belongs in T4's lane since it owns the
  optimizer.
- `rate_snapshots` empty — fed by a daily cron T4 owns.
- Real Plaid Investments verification requires `RUN_PLAID_SANDBOX=1` against
  an item that supports Investments products.
- Bank dispute API integrations (PRD §13: Chase / BoA / Wells / Citi / Amex /
  Capital One) — partly T4 (the agent flow) and partly future T2 work (the
  per-bank adapter modules).

**Status: T2 Phase 2 DONE.**
