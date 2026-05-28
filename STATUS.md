# Finance Autopilot — Build Status

_Last updated after Phase A–C autonomous build. Verified locally: `pnpm -r typecheck`, `pnpm -r test` (442 passed), `pnpm -r lint`, `pnpm --filter @fa/web build` all zero-error._

## Agent roster — 16 of 16 code-complete

| # | Agent | Tier | Package | Status |
|---|---|---|---|---|
| 1 | Subscription Killer | Autopilot | `@fa/agent-subscription-killer` | ✅ + 50-service registry |
| 2 | Auto-Saver | Autopilot | `@fa/agent-auto-saver` | ✅ |
| 3 | Round-Up Investor | Autopilot | `@fa/agent-round-up` | ✅ |
| 4 | Spending Coach | Autopilot | `@fa/agent-spending-coach` | ✅ |
| 5 | Goal Funder | Autopilot | `@fa/agent-goal-funder` | ✅ (Phase A) |
| 6 | Daily Briefing | Autopilot | `@fa/agent-daily-brief` | ✅ |
| 7 | Bill Negotiation (voice) | Pro | `@fa/agent-bill-negotiation` + `@fa/twilio` | ✅ (Phase B) |
| 8 | Charge Dispute | Pro | `@fa/agent-charge-dispute` | ✅ (Phase B) |
| 9 | Credit Card Optimizer | Pro | `@fa/agent-card-optimizer` | ✅ (Phase B) |
| 10 | Missing Money Finder | Pro | `@fa/agent-missing-money` | ✅ (Phase B) |
| 11 | Refinance Watcher | Pro | `@fa/agent-refinance-watcher` | ✅ (Phase B) |
| 12 | Insurance Shopper | Pro | `@fa/agent-insurance-shopper` | ✅ (Phase B) |
| 13 | Tax Prep | Premium | `@fa/agent-tax-prep` | ✅ (Phase C) |
| 14 | Investment Rebalancer | Premium | `@fa/agent-investment-rebalancer` | ✅ (Phase C) |
| 15 | Net Worth Strategy | Premium | `@fa/agent-net-worth-strategy` | ✅ (Phase C) |
| 16 | Human Backup | Premium | `@fa/agent-human-backup` | ✅ (Phase C) |

## What "code-complete" means here

Every agent: builds, typechecks, lints, and is unit-tested. All external I/O
(Twilio/TTS, bank dispute APIs, unclaimed-property sources, insurance quote APIs,
brokerage/market data, tax-filing software) sits behind a typed **port** with:
- a **real, env-driven implementation** that fails loudly when uncredentialed, and
- a **mock** used by the tests.

No agent fakes a successful external call. Tests are **live-ready, mock-verified** —
they prove the logic, not a live integration.

## NOT done — requires YOUR accounts/keys (no subagent can do these)

These are the only remaining gaps to a live product. Each needs real credentials:

1. **Supabase** — create project, apply migrations:
   `DATABASE_URL=... pnpm --filter @fa/db migrate:apply` then confirm RLS.
2. **Plaid** — `PLAID_CLIENT_ID`/`PLAID_SECRET`, then
   `RUN_PLAID_SANDBOX=1 pnpm --filter @fa/plaid test` to confirm link→sync→categorize.
3. **Stripe** — create the 9 price IDs + founder coupon, run a real $1 test charge,
   confirm webhook flips `users.pricing_tier`.
4. **Inngest** — `INNGEST_EVENT_KEY`/`INNGEST_SIGNING_KEY`; crons already registered.
5. **Anthropic** — `ANTHROPIC_API_KEY` (already used by categorizer + agents).
6. **Twilio + ElevenLabs** (voice negotiation live path) — set the SID/token/phone +
   voice keys, host the TwiML/Media-Streams endpoint, then
   `setAdapter(new RealTwilioAdapter())` at boot.
7. **Per-bank dispute, unclaimed-property, insurance-quote, brokerage, tax-filing
   providers** — provision each provider's API keys to flip its port from stub→live.
8. **Deploy** — Vercel for web, EAS for mobile; run the 6 Playwright golden-path
   e2e tests against the deploy.
9. **Non-code** — lawyer review of TOS/privacy, pen-test, App Store submission.

See `.env.example` for the full key list.

## Branches

- `phase-a-completion` — Goal Funder, registry 10→50, mobile real-data, Inngest wiring
- `phase-b-completion` — voice backend + 5 Tier-2 agents
- `phase-c-completion` — 4 Tier-3 agents (this branch, current tip)

Merge order: a → b → c (each builds on the prior).
