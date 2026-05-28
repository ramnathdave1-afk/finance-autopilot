# @fa/agent-insurance-shopper

Agent 12 — Insurance Shopper (Pro tier, PRD §8.3). Annually re-quotes auto +
renters (and home/life/health) insurance: loads the user's current policy from
`insurance_policies`, fetches competitor quotes through the `QuotePort` seam,
ranks them by best deal, writes every quote to `insurance_quotes`, and surfaces
the best annual savings as the action's ROI. **Switching carriers requires
approval** — the action lands in `awaiting_approval`; the agent never binds a
policy autonomously.

## Surface

```ts
import {
  createInsuranceShopperAgent,
  runInsuranceShopper,
  httpQuotePortFromEnv,
  mockQuotePort,
  rankQuotes,
} from '@fa/agent-insurance-shopper';

// Production: env-driven live aggregator port.
await runInsuranceShopper({ userId, agentId, input: { policyId } });

// Or build the definition with an explicit port (DI for the Inngest route).
const agent = createInsuranceShopperAgent({ quotePort: httpQuotePortFromEnv() });
```

## QuotePort — honesty contract

External quote fetching sits behind `QuotePort` (`quote-port.ts`).

- `httpQuotePort` / `httpQuotePortFromEnv` — the **real** implementation. Makes
  genuine HTTP calls to the carrier/aggregator API using
  `INSURANCE_AGGREGATOR_URL` + `INSURANCE_AGGREGATOR_API_KEY`. Throws on a
  missing key or any non-OK response — it never fabricates a quote.
- `mockQuotePort` — **unit tests only**. Returns a deterministic spread of
  ≥ 5 competitor carriers per insurance kind. Never wired into production.

The agent calls whichever port it is handed and treats both identically. Code
is live-ready, mock-tested.

## Ranking (pure)

`rankQuotes(quotes, currentMonthlyPremium)` is pure and unit-tested:
ranks-by-price (cheapest monthly first, ties broken by carrier name), computes
`monthlyDeltaVsCurrent` / `annualSavingsVsCurrent` per quote, and reports
`hasBetterDeal` + `bestAnnualSavings`. No I/O.

## Idempotency

Key = `requote:${policyId}`. Same policy → same action row, no duplicates on
retry.

## ROI

`roi = bestAnnualSavings` when a competitor beats the current premium, else
`null` (no invented savings). Quotes are persisted either way for user review.

## Tests

```bash
pnpm --filter @fa/agent-insurance-shopper test
```
