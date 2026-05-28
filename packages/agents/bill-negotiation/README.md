# @fa/agent-bill-negotiation

PRD §8.3 Agent 7 — Voice bill negotiation (the killer feature).

`defineAgent` of type `bill_negotiation`, `actionType: 'negotiate'`,
`requiresApproval: true` (the user authorizes the call before we dial).

## Flow

1. Load the `bills` row (provider, current $) and the user's target $.
2. Insert a `bill_negotiations` row (`preparing_call`).
3. Generate a negotiation call script via `@fa/claude`.
4. Place the outbound call via `@fa/twilio` (`calling`).
5. Poll call status until terminal (tunable `poll.intervalMs` / `maxPolls` / `sleep`).
6. If the call did not connect+complete → **throw** → `defineAgent` retries 3×
   then escalates. The agent never fakes a completed call.
7. On completion: fetch recording + transcript, analyze the transcript with
   `@fa/claude` to confirm whether savings were actually agreed.
   - **savings**: store `achieved_amount` / `monthly_savings` / `voice_recording_url`,
     status `succeeded`, return `roi = (current - target) * 12`.
   - **no savings**: store recording, status `no_savings`, `roi = 0`.

## Honesty

All telephony + TTS go through `@fa/twilio`'s `TwilioPort`. Unit tests run
against a mock `TwilioPort`; production wires `RealTwilioAdapter`. Savings are
derived from the real call transcript, never assumed. Tables (`bills`,
`bill_negotiations`) already exist in
`packages/db/migrations/phase2_T2_tier2_tables.sql`.
