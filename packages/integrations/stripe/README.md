# @fa/stripe

Stripe Billing surface for Finance Autopilot. Owns:

- `PRICE_TABLE` — sticker prices in cents for `autopilot` / `pro` / `premium`, monthly + annual (PRD §7)
- `computeFounderPrice` — first-100 lifetime $9.99/mo + first-500 annual 50%-off coupon (PRD §7)
- `createCheckoutSession` / `createPortalSession` — Stripe Checkout + Customer Portal entry points
- `handleWebhook` — idempotent dispatch for `customer.subscription.{created,updated,deleted}` and `invoice.payment_{succeeded,failed}` (PRD §13)
- `enforceTier` — middleware that gates agents by `pricing_tier` and enforces the free-tier 1-action-per-month quota (PRD §8.1)
- `issueFailureRefund` — pro-rated current-month refund when an agent_action fails with `refund_eligible=true` (PRD §16)
- `oneClickCancel` — single tap, no retention prompts (PRD §9 Story 4, anti-Cleo)

## How testing works

All Stripe SDK calls flow through `StripeAdapter` (`src/adapter.ts`). The default
adapter (`StubAdapter`) throws — production must install a real adapter, tests
install a `MockAdapter`. Database calls flow through `DbPort` (`src/db-port.ts`)
for the same reason.

```ts
import { setAdapter, setDbPort } from '@fa/stripe';
import { MockAdapter, makeMockDb } from './tests/_helpers';

setAdapter(new MockAdapter());
setDbPort(makeMockDb().db);
```

## Run

```bash
pnpm --filter @fa/stripe test
pnpm --filter @fa/stripe typecheck
```

## What's stubbed

| Stub | Why | TODO |
|---|---|---|
| `StubAdapter` throws on every call | We don't have Stripe keys yet | `TODO(integrate-stripe-sdk)` — implement `RealStripeAdapter` wrapping `import Stripe from 'stripe'` |
| `price_*_stub` ids in `PRICE_TABLE` | Real ids come from the Stripe dashboard | Same |
| `stripe_events` dedup is in-memory | T2 hasn't built the table | `TODO(integrate-t2-migration: add stripe_events table)` |
| `stripe_refunds` dedup is in-memory | Same | `TODO(integrate-t2-migration: add stripe_refunds table)` |
| `countAnnualSubscribers` uses `subscription_status='active'` proxy | No `billing_cycle` column yet | `TODO(integrate-t2-migration: add billing_cycle column to users)` |
| `stripe_charge_id` / `stripe_subscription_id` on rows | Not yet in schema | Will land in T2 migration adding billing columns |

## Tier → agents

`enforceTier` reads `TIER_AGENTS` from `@fa/db` (the source of truth for the
DB enum, which uses `round_up_investor` / `bill_negotiation` / etc.). Pass the
same string the DB knows about.
