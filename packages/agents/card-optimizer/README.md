# @fa/agent-card-optimizer

Agent 9 — Credit Card Optimizer (PRD §8.3). **Recommend mode only.** The agent
joins the user's real spending profile (`@fa/plaid` `buildSpendingProfile`)
against the seeded cards catalog (`cards` + `user_cards` tables) and writes a
recommendation to `agent_actions` with status `awaiting_approval`:

1. **Per-category best card** — the optimal card to use for each spend
   category, ranked by annual reward (cap-aware), ties broken by lower fee.
2. **Apply-for** — high-value cards the user does NOT hold, ranked by **net
   annual value** = incremental reward over their currently-held cards minus
   the annual fee. Negative-net cards are never recommended.

**No money moves and no card is ever opened.** The user reviews the proposal in
the web UI and applies for cards themselves (`autonomousApplication: false`).

## Surface

```ts
import { cardOptimizerAgent, runCardOptimizer, recommendCards } from '@fa/agent-card-optimizer';

await runCardOptimizer({
  userId,
  agentId,
  input: { windowMonths: 6, maxApplyFor: 3 },
});
```

## Honesty / external calls

There are **no** external quote/rate/scraper calls. Inputs are (a) the user's
own already-synced transactions via `@fa/plaid` and (b) the static seeded
catalog. DB reads sit behind `cards-catalog.ts` (mocked in tests); the math
lives in the pure, unit-tested `recommend.ts`.

## Idempotency

Key = `card_recommendation` — one standing recommendation per user; re-running
refreshes the same `agent_actions` row.

## ROI

ROI = the **net annual value of the top apply-for card** (incremental reward
over held cards, net of fee), or `null` when the user is already optimal. We
never count money the user has not actually captured.

## Cards catalog seed

The catalog is seeded by `packages/db/migrations/phase3_T2_cards_seed.sql`
(28 popular US rewards cards in the `CardRewardRule` JSONB shape). No new seed
file is needed.

## Tests

```bash
pnpm --filter @fa/agent-card-optimizer test
```
