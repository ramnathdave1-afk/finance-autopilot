# @fa/agent-tax-prep

Agent 13 — Tax Prep (PRD §8.4, Tier-3). Year-round, scans the user's
categorized `transactions` to (1) flag likely deductibles and (2) aggregate
1099-type income (Stripe / Cash App / Patreon / YouTube / …), then writes a
**running tax summary** to the `agent_actions` audit log.

**Recommend-only.** Per PRD §8.4, Tier-3 agents are lighter, recommendation-mode
strategy agents. This agent never files a return and never moves money. The
summary is informational; the optional filing-software **handoff** (TurboTax /
H&R Block) is gated behind explicit user approval and only fires when the input
carries a `handoff` directive. Because the action can touch an external
provider, `requiresApproval` is `true`.

## Surface

```ts
import { taxPrepAgent, runTaxPrep } from '@fa/agent-tax-prep';

// Year-round running summary (recommend-only):
await runTaxPrep({ userId, agentId, input: { taxYear: 2025 } });

// Approved filing handoff (optional):
await runTaxPrep({
  userId,
  agentId,
  input: { taxYear: 2025, handoff: { provider: 'turbotax' } },
});
```

`runTaxPrep` (and any fresh `runAgent`) halts at `awaiting_approval` because
`requiresApproval: true`. The approved-action path (router / `existingActionId`)
runs the body.

## Classification (pure, unit-tested)

`src/classify.ts` is pure — no DB, no network:

- `detectDeductibles` — flags outflows whose `ai_category ?? category` maps to a
  Schedule-C / itemized bucket (home office, software, travel, supplies,
  professional services, education, charitable, health insurance, retirement).
  Skips inflows and pending txns.
- `aggregate1099Income` — sums **inflows** per 1099-issuing payer (Stripe, Cash
  App, Patreon, YouTube/AdSense, PayPal, Venmo, Etsy, Upwork, Fiverr) and flags
  the `$600` reporting threshold.
- `buildTaxSummary` — scopes to a tax year and produces the running summary
  (`total1099Income`, `totalDeductions`, per-bucket / per-payer breakdowns, and
  a `netSelfEmploymentEstimate` — context only, NOT a liability calculation).

## Honesty contract — live-ready, mock-tested

The filing-software handoff goes through `TaxFilingPort`:

- **Live** (`createHttpTaxFilingPortFromEnv`): reads `TAX_FILING_BASE_URL` and
  `TAX_FILING_API_KEY` from env, POSTs the summary to the provider, and
  **throws** on a missing key, non-OK response, or a malformed payload. It never
  fabricates a "handed off" result.
- **Mock** (`createMockTaxFilingPort`): deterministic for tests + dev. Installed
  via `setTaxFilingPortFactory`; never touches the network.

A handoff against an uncredentialed live port throws — which propagates through
`runAgent`'s retry path and **escalates** rather than faking success.

## ROI

`roi` is `null` — recommendation mode. No dollars are recovered or moved; any
savings materialize later when the user files.

## Tests

```bash
pnpm --filter @fa/agent-tax-prep test
```

Covers: deductible detection (incl. ai/category fallback, inflow/pending
exclusion), 1099 aggregation (threshold inclusivity, no-income edge, mixed
categories, outflow/unknown-payer exclusion), the running summary, the port
honesty contract, and the agent (approval gate, approved run + audit log,
zeroed summary, handoff success, uncredentialed escalation).
