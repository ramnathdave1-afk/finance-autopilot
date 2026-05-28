# @fa/agent-investment-rebalancer

Agent 14 — Investment Rebalancer (PRD §8.4, Tier-3 Premium). Runs **quarterly**:
reads the user's latest `investment_holdings` snapshot, computes how far the
portfolio has drifted from their target asset allocation, **recommends** the
rebalancing trades that would close that drift, and flags
tax-loss-harvesting opportunities in taxable accounts.

**Recommendation only.** Tier-3 agents are lighter, recommend-mode strategy
agents (PRD §8.4). This agent **never places a trade or moves money** — the
`BrokeragePort` has no execute method; its only outward call is a read-only
quote refresh. Recommendations land in `agent_actions` awaiting approval
(`requiresApproval: true`, `actionType: 'rebalance_recommendation'`).

## Surface

```ts
import { runInvestmentRebalancer } from '@fa/agent-investment-rebalancer';

await runInvestmentRebalancer({
  userId,
  agentId,
  input: {
    target: { equity: 0.6, fixed_income: 0.3, cash: 0.1 }, // weights sum to 1
    taxableAccountIds: ['acct-brokerage'],                  // harvest-eligible only
    thresholdFraction: 0.05,                                // tolerance band
    minHarvestLoss: 0,
    refreshPrices: false,                                   // optional live reprice
    period: '2026-Q2',                                      // idempotency tag
  },
});
```

## Pure math (`src/rebalance.ts`)

All side-effect-free and unit-tested:

- `classifyAllocation` — collapse holdings into per-asset-class weights.
- `computeDrift` — current vs target weights (union of held + targeted classes).
- `suggestRebalance` — buy/sell deltas for classes outside the tolerance band.
- `findHarvestCandidates` — taxable positions trading below cost basis.

Edge cases covered: empty portfolio, already-balanced, targeted-but-missing
class, held-but-untargeted class, malformed target (throws).

## Honesty contract

Any brokerage / market-data access goes through `BrokeragePort`
(`src/brokerage-port.ts`):

- `createHttpQuotePortFromEnv` reads `BROKERAGE_QUOTE_BASE_URL` /
  `BROKERAGE_QUOTE_API_KEY` and **throws loudly** when uncredentialed — a
  missing key can never be mistaken for "no price data".
- Tests install `createMockQuotePort` and never touch the network.
- A failed price refresh **throws** → the run escalates. We never emit
  recommendations off fabricated prices.

## Integration (owned by the integration step, not this package)

- Register `investmentRebalancerAgent` in the Inngest API route with a
  **quarterly** cron trigger (e.g. `0 9 1 1,4,7,10 *`).
- Add `@fa/agent-investment-rebalancer` to `apps/web`'s deps.
- Hook recommendations up at `apps/web/src/app/app/agents/rebalancer/page.tsx`.
