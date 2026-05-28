# @fa/agent-subscription-killer

PRD §8.2 Agent 1. Cancels subscriptions on the user's behalf via a curated
merchant registry + Browserbase/Stagehand automation, with a Computer Use
fallback for unknown merchants and a Twilio voice-call path for merchants
that block web cancellation (Equinox, etc.).

## Surface

```ts
import { subscriptionKillerAgent } from '@fa/agent-subscription-killer';
import { runAgent } from '@fa/inngest';

await runAgent(subscriptionKillerAgent, {
  userId,
  agentId,                              // pulled from `agents` table
  input: {
    subscriptionId: '...',              // row in `subscriptions`
    merchantKey: 'netflix',             // matches registry
    credentials: { username, password } // SESSION-ONLY
  },
});
```

The agent registers with `requiresApproval: true` — the row lands in
`awaiting_approval`, the web app flips it to `pending` after user consent,
and the next `runAgent` invocation runs the cancellation.

## Registry format

Each merchant lives in `src/registry/<merchant>.ts`:

```ts
export const merchant: MerchantCancelSpec = {
  merchantKey: 'merchant',            // snake_case, must be unique
  displayName: 'Display Name',
  cancelMethod: 'web' | 'voice',
  loginUrl: 'https://...',
  billingUrl: 'https://...',
  steps: [{ action, target?, value? }, ...],
  successSelector: 'css-or-text',     // confirms cancellation
  monthlyAmountEstimate: 15.49,       // roi = amount * 12 on success
};
```

Then import it in `src/registry/index.ts`. The registry asserts no
duplicate `merchantKey` at load time.

## Adding merchant 51+

1. `src/registry/<merchant>.ts` — author the spec. Manually QA the
   selectors in Chrome devtools first.
2. Import + push into `_all` in `src/registry/index.ts`.
3. Add a HAR fixture under `tests/fixtures/` if the cancellation flow
   diverges from `generic-web-success`. Otherwise the existing fixture
   covers it.
4. Add the merchant to the scenario loop in `tests/agent.test.ts` if you
   want it included in the success-rate metric.

## Security model

- **Credentials are session-only.** They're passed inline into
  `BrowserSession.act(...)` natural-language instructions; the adapter
  is contractually forbidden from logging them. They never touch DB
  rows, audit logs, or screenshots metadata.
- **Audit log is the system of record.** Every step — login, click,
  confirm, claude-verify, refund-eligible-set — is appended via
  `stepRecorder` with the screenshot URL. PRD §16 trust surface reads
  from `agent_actions.audit_log`.
- **Subscription idempotency.** Before doing any work, the agent reads
  the `subscriptions` row; if `status === 'cancelled'`, it's a no-op
  (`roi: 0`, `data.alreadyCancelled: true`). Combined with the Inngest
  `idempotencyKey: cancel:${subscriptionId}`, you cannot double-cancel.

## refund_eligible behavior (PRD §16)

If the cancellation fails after 3 retries, `defineAgent`'s `onFailure`
hook runs `setRefundEligible(actionId)` → updates the `agent_actions`
row to `refund_eligible = true`. T5's nightly billing job picks these
up and credits the user one month of autopilot fees on Stripe.

The agent's terminal status (`escalated`) is set **regardless** of
whether the refund-eligible write succeeded — that flag is bookkeeping,
not a precondition. If the column isn't present yet (T2 migration
pending), the audit log gets a `refund-eligible:set: false` step with
the TODO marker as the reason.

## TODO markers

- `TODO(integrate-browserbase-sdk)` — in `@fa/browserbase`. Default
  adapter throws; tests inject mocks.
- `TODO(integrate-twilio)` — voice merchants short-circuit with a
  stub audit step. T-future wires RKV voice stack.
- `TODO(integrate-t2-migration: add refund_eligible bool to
  agent_actions, default false)` — column lives in `@fa/types` but
  the SQL migration is owned by T2.
- `TODO(integrate-claude-computer-use)` — Computer Use fallback uses
  a single `call()` to evaluate the page; real tool-use loop pending.
