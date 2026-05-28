# @fa/agent-round-up

Agent 3 — Round-Up Investor (PRD §8.2). **Proposal-only at launch.** Each week
we sum the round-ups from the user's debits, look up their chosen strategy
(`sp500` / `btc` / `custom`), and write a sweep proposal to `agent_actions`
with `awaiting_approval`. No actual transfer.

## Surface

```ts
import { roundUpAgent, runRoundUp, roundUpTotal, STRATEGY_REGISTRY } from '@fa/agent-round-up';

await runRoundUp({
  userId,
  agentId,
  input: {
    transactions,    // RoundUpTxn[] from the past week
    strategyId,      // 'sp500' | 'btc' | 'custom'
    weekStart,       // '2026-05-25' — drives idempotency
  },
});
```

## Idempotency

Key = `sweep:${weekStart}`. Same week → same proposal.

## Note on agent type naming

`@fa/db`'s enum names this agent `round_up_investor`. The PRD-level
`AgentType` in `@fa/types` calls it `round_up`. This package uses the DB
spelling so `canAct()` / `TIER_AGENTS` lookups in `@fa/db` work without a
mapping shim. Reconcile in a future T2 migration if desired.

## What's stubbed

- Real brokerage transfers — Phase 2 (`TODO(integrate-brokerage)`).
- Strategy account lookup — caller is responsible for resolving the user's
  brokerage account id before showing them the proposal.

## Tests

```bash
pnpm --filter @fa/agent-round-up test
```
