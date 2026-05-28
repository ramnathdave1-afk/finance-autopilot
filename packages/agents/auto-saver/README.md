# @fa/agent-auto-saver

Agent 2 — Auto-Saver. **Recommend mode only** at launch (PRD §5 non-goal #2,
§8.2 Agent 2). The agent detects a paycheck, computes an allocation across
buckets per the user's rules (or a sensible default), and writes the proposal
to `agent_actions` with status `awaiting_approval`. **No money moves.** The
user one-taps to execute via the T1 UI (Phase 2 wires actual transfers).

## Surface

```ts
import { autoSaverAgent, runAutoSaver, detectPaychecks, computeAllocation } from '@fa/agent-auto-saver';

await runAutoSaver({
  userId,
  agentId,
  input: { paycheckTxnId, amountCents, depositedAt },
});
```

## Default rules (PRD §8.2)

20% emergency / 10% debt / 5% invest / 65% spend.

## Idempotency

Key = `allocation:${paycheckTxnId}`. Same paycheck txn → same proposal row,
no duplicates on retry.

## What's stubbed

- Actual transfers — Phase 2 work (`TODO(integrate-plaid-transfer)`).
- The DB-side `rules` table lookup is not done here; pass `rules` on the input
  or it falls back to `DEFAULT_RULES`. The T1/T2 caller is responsible for
  hydrating the user's saved rules before invoking the agent.

## Tests

```bash
pnpm --filter @fa/agent-auto-saver test
```
