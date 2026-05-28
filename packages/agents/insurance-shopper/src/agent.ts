// PRD §8.3 Agent 12 — Insurance Shopper (Pro tier).
//
// Annually re-quotes auto + renters (and other) insurance:
//   1. Load the user's current policy from insurance_policies.
//   2. Fetch competitor quotes through the QuotePort seam (live carrier /
//      aggregator API in prod; mock in tests — see quote-port.ts honesty note).
//   3. Rank quotes by best deal + compute savings vs current (pure logic).
//   4. Persist every quote to insurance_quotes via @fa/db.
//   5. Return roi = best annual savings (null when no quotes / no better deal),
//      surfacing the recommendation for the user to act on.
//
// requiresApproval: switching carriers is a real-money decision, so the action
// lands in awaiting_approval; the user one-taps to act (T1 UI). The agent never
// binds a policy autonomously.

import {
  defineAgent,
  type AgentDefinition,
  type AgentRunContext,
  type AgentRunResult,
} from '@fa/inngest';
import type { QuotePort } from './quote-port';
import { rankQuotes } from './ranking';
import { getPolicy, writeQuotes } from './insurance-store';

export interface InsuranceShopperInput {
  /** The insurance_policies row to re-quote. */
  policyId: string;
  /** Optional ZIP override; falls back to coverage.zip if present. */
  zip?: string;
}

export interface InsuranceShopperDeps {
  /** Injected so prod wires the live port and tests inject the mock. */
  quotePort: QuotePort;
}

export interface InsuranceShopperData {
  policyId: string;
  kind: string;
  currentCarrier: string;
  currentMonthlyPremium: number;
  quoteCount: number;
  best: {
    carrier: string;
    monthlyPremium: number;
    annualSavingsVsCurrent: number;
  } | null;
  hasBetterDeal: boolean;
}

/**
 * Build the agent definition bound to a specific QuotePort. Production passes
 * `httpQuotePortFromEnv()`; tests pass `mockQuotePort()`. The agent logic is
 * identical either way — it never fabricates a quote.
 */
export function createInsuranceShopperAgent(
  deps: InsuranceShopperDeps,
): AgentDefinition<InsuranceShopperInput> {
  const run = async (
    input: InsuranceShopperInput,
    ctx: AgentRunContext,
  ): Promise<AgentRunResult> => {
    await ctx.log('load-policy:start', true, { policyId: input.policyId });

    const policy = await getPolicy(input.policyId);
    if (!policy) {
      throw new Error(`insurance policy not found: ${input.policyId}`);
    }
    await ctx.log('load-policy:done', true, {
      kind: policy.kind,
      carrier: policy.carrier,
      monthlyPremium: policy.monthly_premium,
    });

    const zip =
      input.zip ??
      (typeof policy.coverage?.zip === 'string' ? (policy.coverage.zip as string) : undefined);

    const quotes = await deps.quotePort.fetchQuotes({
      kind: policy.kind,
      currentCarrier: policy.carrier,
      currentMonthlyPremium: policy.monthly_premium,
      coverage: policy.coverage,
      ...(zip ? { zip } : {}),
    });
    await ctx.log('fetch-quotes:done', true, { quoteCount: quotes.length });

    const ranking = rankQuotes(quotes, policy.monthly_premium);

    const written = await writeQuotes(policy.user_id, policy.id, ranking.ranked);
    await ctx.log('write-quotes:done', true, { written });

    const data: InsuranceShopperData = {
      policyId: policy.id,
      kind: policy.kind,
      currentCarrier: policy.carrier,
      currentMonthlyPremium: policy.monthly_premium,
      quoteCount: ranking.ranked.length,
      best: ranking.best
        ? {
            carrier: ranking.best.carrier,
            monthlyPremium: ranking.best.monthlyPremium,
            annualSavingsVsCurrent: ranking.best.annualSavingsVsCurrent,
          }
        : null,
      hasBetterDeal: ranking.hasBetterDeal,
    };

    await ctx.log('rank:done', true, {
      hasBetterDeal: ranking.hasBetterDeal,
      bestAnnualSavings: ranking.bestAnnualSavings,
    });

    // ROI = annual savings of the best deal. Null when no quotes or nothing
    // beats the current policy — we never invent savings.
    const roi = ranking.hasBetterDeal ? ranking.bestAnnualSavings : null;

    return { roi, data: data as unknown as Record<string, unknown> };
  };

  return defineAgent<InsuranceShopperInput>({
    type: 'insurance_shopper',
    actionType: 'requote',
    requiresApproval: true,
    idempotencyKey: (i) => `requote:${i.policyId}`,
    run,
  });
}
