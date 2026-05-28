# @fa/goal-funder

Agent 5 — Goal Funder. **Recommend mode only** at launch (PRD §5 non-goal #2,
§8.2 Agent 5). The user sets goals (`target_amount`, `target_date`) in the
`goals` table. On each detected paycheck the agent computes the monthly funding
required per goal (`remaining / months_left`), routes a slice of the paycheck
toward each active goal (up to 5), and writes the proposal to `agent_actions`
with status `awaiting_approval`. **No money moves** and `goals.current_amount`
is only updated once the user approves + executes via the T1 UI.

Integrates with Auto-Saver: the same detected-paycheck signal
(`DetectedPaycheck` from `@fa/agent-auto-saver`) feeds this agent.

## Surface

```ts
import { goalFunderAgent, runGoalFunder, computeFunding, allocatePaycheckToGoals } from '@fa/goal-funder';

await runGoalFunder({
  userId,
  agentId,
  input: {
    paycheck: { id: paycheckTxnId, amountCents, date },
    goals, // active goals, amounts in cents
    fundingRate: 0.1, // optional — share of paycheck for goals (default 10%)
  },
});
```

## Funding math (PRD §8.2 Agent 5)

`monthly_funding = ceil(remaining / months_left)`. Status is one of `met`,
`on_track`, `behind`, `past_due`, `no_deadline`. Allocation prioritizes the
soonest deadline, never over-funds a goal past its remaining balance, and caps
at `MAX_ACTIVE_GOALS` (5).

## Idempotency

Key = `funding:${paycheck.id}`. Same paycheck txn → same proposal row, no
duplicates on retry.

## What's stubbed

- Actual transfers + `goals.current_amount` writes — happen on user execute
  (later phase). This agent only proposes.
- The `goals` table read is the caller's job: pass active goals (in cents) on
  the input. Amounts in `goals.*` are dollar-denominated; convert at the call
  site.

## Tests

```bash
pnpm --filter @fa/goal-funder test
```
