# @fa/agent-spending-coach

Agent 4 — Spending Coach (PRD §8.2). Free tier, read-only insights with one-tap
rule creation. No autonomous spending blocks.

## What it does

1. Pulls last 30 days of `transactions` for the user.
2. Computes month-over-month category deltas locally (`analyzer.ts`).
3. Sends the deltas to Claude (`FAST_MODEL`), which returns 1–3 insights as
   structured JSON: `{ title, body, impactDollars, suggestedRule? }`.
4. Writes one `agent_actions` row per insight via `startAction` + `logStep` +
   `markSucceeded`. T1's vertical feed renders them as cards.

Example insight (from PRD): *"You spent $340 on Uber Eats this month, up 80%
from last month. Want me to set a $200/mo cap and notify you when you approach
it?"*

## Schedule

Daily, after the morning transaction sync completes. Wired by T1 in
`apps/web/api/cron`. This package exports `runSpendingCoach()` for the route.

## Inputs

```ts
interface SpendingCoachInput {
  now?: string; // ISO; override for tests/cron
}
```

## Outputs

- Outer agent action: `{ roi: null, data: { insightsCount, insightActionIds } }`.
- One child `agent_actions` row per insight (also `agent_type='spending_coach'`,
  `action_type='insight'`) with the insight payload in its audit_log.

## Insight schema (frozen)

```ts
interface Insight {
  title: string;
  body: string;
  impactDollars: number;
  suggestedRule?: {
    trigger: 'monthly_spend_threshold' | 'transaction_categorized';
    condition: { field: string; op: 'gt'|'gte'|'lt'|'lte'; value: number };
    action: 'notify' | 'create_insight';
  };
}
```

## One-tap rule creation

When the user accepts a `suggestedRule` from an insight card, T1's web UI
hits an API route that calls `createRule({ userId, ... })` from this package.
Writes to `public.rules` via the service-role client.

## Idempotency

- Outer action key: `insight:<YYYY-MM-DD>`.
- Per-insight key: `insight:<YYYY-MM-DD>:<hash(title)>`.

Re-running the agent on the same day surfaces the same insights without
double-writing.

## Failure modes

| Failure | Behavior |
|---|---|
| Transactions read fails | retry up to 3x → escalate |
| Claude returns non-JSON | `safeParseInsights` returns `[]`, run still succeeds with 0 insights |
| Per-insight persist fails | bubbles → retry the whole run |

## Stubs

- None for the agent itself — `@fa/db`, `@fa/claude`, `@fa/inngest` are all
  real-but-mocked-in-tests. `TODO(integrate-t1)`: T1's API route must wire
  `createRule()` into a `/api/rules` endpoint behind auth.

## Tests

```bash
pnpm --filter @fa/agent-spending-coach test
```
