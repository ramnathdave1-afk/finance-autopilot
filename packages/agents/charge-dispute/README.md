# @fa/agent-charge-dispute

Agent 8 — Charge Dispute (PRD §8.3). Surfaces disputable charges, presents them
to the user for confirmation, and files the dispute with the cardholder's bank.

1. **Surface candidates** — reuses the EXISTING `@fa/plaid` detectors
   (`detectAnomalies` + `detectChargesAfterCancellation`). This agent does NOT
   re-implement anomaly logic; it consumes those flags, maps each onto a dispute
   reason, and de-dupes by transaction (see `surfaceCandidates`).
2. **User confirmation** — `requiresApproval: true`. The action lands in
   `awaiting_approval`; the web UI shows the candidate and the user confirms.
3. **File** — on the approved run the agent opens a row in the existing
   `disputes` table (migration `phase2_T2_tier2_tables.sql`), transitions
   `detected → filing → filed`, and files with the bank through
   `BankDisputePort`. Bank success → `filed` + `bank_case_id`, `roi` = disputed
   amount. Bank failure → throw → `defineAgent` retries 3× → `onFailure`
   transitions the dispute to `cancelled` so it never dangles in `filing`.

`DisputeStatus` transitions: `detected → awaiting_user → filing → filed →
resolved_won | resolved_lost`, and any state → `cancelled`.

## Surface

```ts
import {
  chargeDisputeAgent,
  surfaceCandidates,
  setBankDisputePort,
} from '@fa/agent-charge-dispute';
import { runAgent } from '@fa/inngest';

const candidates = await surfaceCandidates(userId);
await runAgent(chargeDisputeAgent, {
  userId,
  agentId,
  input: { transactionId, reason: 'duplicate', bank: 'chase' },
});
```

## Honesty / external calls

All outbound contact with a bank goes through `BankDisputePort` — the single
typed seam. There are two implementations:

- **`envBankDisputePort` (production)** — reads the per-bank dispute credential
  from env (PRD §13: `CHASE_DISPUTE_API_KEY`, `BOA_DISPUTE_API_KEY`,
  `WELLS_DISPUTE_API_KEY`, `CITI_DISPUTE_API_KEY`, `AMEX_DISPUTE_API_KEY`,
  `CAPITAL_ONE_DISPUTE_API_KEY`). The actual per-bank API/web call is a
  `TODO(integrate-bank-api)` stub: missing credential → honest typed failure;
  credential present → throws `BankNotConfiguredError`. **It never returns a
  fake success.** Code is live-ready, mock-tested.
- **`mockBankDisputePort` (tests)** — records every request and returns a
  synthetic `bankCaseId`, or simulates failure via `{ failAll: true }`.

Tests inject the mock via `setBankDisputePort(...)` (reset with
`resetBankDisputePort()`), mirroring `@fa/browserbase`'s adapter-factory pattern.

## Tested

- anomaly → dispute happy path (status `filed`, `roi` = amount, bank case id)
- duplicate-charge path (reason `duplicate`, evidence carried to the bank call)
- bank-failure escalation (dispute `cancelled`, action `escalated`, retries used)
- idempotent re-entry (existing open dispute by another action short-circuits)
- unsupported-bank guard

## Stubbed / TODO

- `TODO(integrate-bank-api)` in `bank-port.ts` — wire each bank's real dispute
  API / web flow using the env credential, return the real `bankCaseId`.
- Realized recovery (`disputes.recovered_amount`, `resolved_won/lost`) is
  reconciled by a later bank-status webhook/poller, not this agent.
