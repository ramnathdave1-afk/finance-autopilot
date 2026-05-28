# @fa/agent-net-worth-strategy

Agent 15 — Net Worth Strategy (PRD §8.4, Premium / Tier-3). Reads the user's
`net_worth_snapshots` history, projects the trajectory ("$100K by Mar 2028 at
the current rate"), and asks Claude for ranked, **recommend-only** levers to hit
a user-set target ("$250K by 2030").

**Recommend-only.** Per PRD §8.4 (Tier-3 agents are lighter, strategy-mode),
this agent moves no money, places no trades, and takes no autonomous action — it
produces advice text rendered on the Strategy page. `requiresApproval` is
`true`: surfacing a plan to the user is a human-in-the-loop step.

## Surface

```ts
import { netWorthStrategyAgent, runNetWorthStrategy } from '@fa/agent-net-worth-strategy';

await runNetWorthStrategy({
  userId,
  agentId,
  input: {
    target: { amount: 250_000, date: '2030-01-01' },
    model: 'linear', // or 'cagr'; defaults to 'linear'
    historyDays: 365, // snapshot window to read; defaults to 365
  },
});
```

## Projection math is pure + unit-tested

`src/projection.ts` has no I/O — just deterministic arithmetic over
`(date, netWorth)` snapshots:

- `buildProjection` — linear ($/day slope) or CAGR (annualized rate) fit.
- `solveTargetDate` — when the current pace first reaches the target (or `null`
  if unreachable, or `alreadyMet`).
- `requiredDailyRate` — extra $/day needed to hit target by its date.
- `projectValue` — net worth projected `daysAhead` forward.

Edge cases covered by tests: insufficient history (< 2 distinct-date snapshots
throws `InsufficientHistoryError`), flat growth, negative growth, CAGR with a
non-positive start value (rate undefined → falls back to linear), and
unreachable targets.

Claude **never produces the numbers** — it only narrates the ones computed here.

## Honesty contract

The only external call is Claude, via the `@fa/claude` wrapper. `getClaude()`
throws when `ANTHROPIC_API_KEY` is unset, so an uncredentialed run **fails
loudly** and escalates through `runAgent`'s retry/escalation path rather than
emitting a fabricated plan. Tests mock `@fa/claude` and never hit the network.

Insufficient history is **not** a failure: the agent succeeds with
`insufficientHistory: true` and an empty recommendation (and skips the Claude
call), so the page can prompt the user to keep tracking.

## Idempotency

Key = `strategy:${target.amount}:${target.date}`. Re-running the same goal is
idempotent; changing the goal is a new action.

## ROI

`roi` is `null` — a recommendation moves no dollars. ROI accrues only if the
user later acts on a lever.

## Tests

```bash
pnpm --filter @fa/agent-net-worth-strategy test
```

Covers: pure projection math (linear/CAGR/solve/required-rate/edges), the
approval gate, a full run past approval, the insufficient-history path, strategy
JSON parsing (fenced JSON, malformed levers, cap at 4), and idempotency.
