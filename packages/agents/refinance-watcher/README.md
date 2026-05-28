# @fa/agent-refinance-watcher

Agent 11 — Refinance Watcher (PRD §8.3). **Recommend mode only** (PRD §5
non-goal #2, §16 trust). Daily, after the rate-refresh cron has updated
`rate_snapshots`, the agent compares each of the user's `loans` against the
freshest published rate for its `loan_type` and surfaces every loan where
refinancing would save at least the threshold (**$1000 over the loan's life**
by default). **No application is filed and no money moves** — the user requests
an actual offer from the web UI.

## Honesty contract

Rate ingestion sits behind the `RatePort` interface:

- `HttpRatePort` — the **live** implementation. Reads `REFI_RATE_API_URL` /
  `REFI_RATE_API_KEY` / `REFI_RATE_SOURCE` from env and fetches/parses the real
  rate source. If unconfigured it **refuses to fetch** — it never fabricates a
  rate.
- `MockRatePort` — the deterministic in-memory port used in unit tests.

The agent only ever sees `RatePort`, and only ever **reads** rates that were
already persisted to `rate_snapshots`. The savings math is pure and unit-tested
(`src/savings.ts`). Code is **live-ready, mock-tested** — we never pretend a
live call happened.

## Surface

```ts
import {
  refinanceWatcherAgent,
  runRefinanceWatcher,
  refreshRates,
  HttpRatePort,
  MockRatePort,
  computeRefinanceSavings,
  clearsThreshold,
} from '@fa/agent-refinance-watcher';

// Daily ingestion cron (live):
await refreshRates(); // uses HttpRatePort from env; skips if unconfigured

// Per-user evaluation (recommend-only, writes to agent_actions):
await runRefinanceWatcher({ userId, agentId, input: { userId } });
```

## defineAgent

- `type: 'refinance_watcher'`
- `actionType: 'refi_opportunity'`
- `requiresApproval: true`
- idempotency: `refi:<userId>:<evaluatedOn>` (one evaluation per user per day)

## Tables

Reads `loans` + `rate_snapshots`; writes `rate_snapshots` (ingestion) and
`agent_actions` (proposal). All tables already exist —
`packages/db/migrations/phase2_T2_tier2_tables.sql`. This package creates none.
