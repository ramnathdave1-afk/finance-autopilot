// Agent 14 — Investment Rebalancer (PRD §8.4, Tier-3 Premium).
//
// QUARTERLY: read the user's latest investment_holdings snapshot, compute the
// portfolio's drift away from their target asset allocation, RECOMMEND the
// rebalancing trades that would close that drift, and flag tax-loss-harvesting
// opportunities in taxable accounts.
//
// RECOMMENDATION ONLY (PRD §8.4 — Tier-3 agents are lighter, recommend-mode
// strategy agents). This agent:
//   - NEVER places a trade or moves money. The BrokeragePort has no execute
//     method; the only outward call is a read-only quote refresh.
//   - emits its recommendations into agent_actions awaiting approval.
// Hence requiresApproval: true.
//
// HONESTY: the optional price refresh goes through BrokeragePort. The live port
// reads credentials from env and throws if absent — it never fabricates a
// price. Tests install a mock and never touch the network. If a price refresh
// fails, the run throws and escalates (via runAgent's retry/escalate path); we
// never silently emit recommendations off fabricated numbers.

import { defineAgent, type AgentDefinition } from '@fa/inngest';
import {
  computeDrift,
  suggestRebalance,
  findHarvestCandidates,
  type Position,
  type TargetAllocation,
  type DriftEntry,
  type RebalanceTrade,
  type HarvestCandidate,
} from './rebalance';
import { getLatestHoldings, rowToPosition } from './holdings-store';
import { getBrokeragePort } from './brokerage-port';

export interface InvestmentRebalancerInput {
  /** Desired asset-class weights, summing to 1 (e.g. { equity: 0.7, fixed_income: 0.3 }). */
  target: TargetAllocation;
  /** connected_accounts ids that are TAXABLE — only these are harvest-eligible. */
  taxableAccountIds?: string[];
  /** Drift tolerance band (fraction). Classes within this band aren't traded. Default 0.05. */
  thresholdFraction?: number;
  /** Minimum unrealized loss (dollars) for a harvest candidate. Default 0. */
  minHarvestLoss?: number;
  /** When true, refresh live prices via the BrokeragePort before computing. Default false. */
  refreshPrices?: boolean;
  /** Quarter tag for idempotency (e.g. "2026-Q2"). */
  period: string;
}

export interface InvestmentRebalancerData {
  period: string;
  totalValue: number;
  drift: DriftEntry[];
  maxAbsDrift: number;
  /** RECOMMENDED trades — never executed by this system. */
  recommendedTrades: RebalanceTrade[];
  harvestCandidates: HarvestCandidate[];
  /** Marker: this agent NEVER places trades or moves money. */
  autonomousTrade: false;
}

export const investmentRebalancerAgent: AgentDefinition<InvestmentRebalancerInput> =
  defineAgent<InvestmentRebalancerInput>({
    type: 'investment_rebalancer',
    actionType: 'rebalance_recommendation',
    requiresApproval: true,
    idempotencyKey: (i) => `rebalance:${i.period}`,
    run: async (input, ctx) => {
      await ctx.log('holdings:load:start', true, { period: input.period });

      const rows = await getLatestHoldings(ctx.userId);
      const taxable = new Set(input.taxableAccountIds ?? []);
      let positions: Position[] = rows.map((r) => rowToPosition(r, taxable));

      await ctx.log('holdings:load:done', true, {
        holdingCount: positions.length,
        asOf: rows[0]?.as_of ?? null,
      });

      // Optional live price refresh. If it fails we throw — never recommend on
      // fabricated numbers. (HONESTY constraint.)
      if (input.refreshPrices && positions.length > 0) {
        const tickers = [...new Set(positions.map((p) => p.ticker).filter((t): t is string => !!t))];
        if (tickers.length > 0) {
          const port = await getBrokeragePort();
          const quotes = await port.refreshQuotes(tickers);
          const priceByTicker = new Map(quotes.map((q) => [q.ticker, q.price]));
          // Reprice using shares implied by the last snapshot (value/price would
          // be circular, so we use the row quantity captured at snapshot time).
          const qtyByHolding = new Map(rows.map((r) => [r.id, Number(r.quantity)]));
          positions = positions.map((p) => {
            if (!p.ticker) return p;
            const px = priceByTicker.get(p.ticker);
            const qty = qtyByHolding.get(p.holdingId);
            if (px === undefined || qty === undefined) return p;
            return { ...p, currentValue: px * qty };
          });
          await ctx.log('prices:refreshed', true, {
            requested: tickers.length,
            returned: quotes.length,
          });
        }
      }

      const report = computeDrift(positions, input.target);
      const recommendedTrades = suggestRebalance(report, input.thresholdFraction ?? 0.05);
      const harvestCandidates = findHarvestCandidates(positions, input.minHarvestLoss ?? 0);

      // Persist the FULL recommendation into the terminal audit step so the UI
      // can render the actual trades + harvest candidates (runAgent only stores
      // roi + audit_log — there is no result_data column). Counts are kept for
      // backwards-compatible callers; the arrays are the real deliverable.
      await ctx.log('analysis:done', true, {
        totalValue: report.totalValue,
        maxAbsDrift: report.maxAbsDrift,
        tradeCount: recommendedTrades.length,
        harvestCount: harvestCandidates.length,
        taxableAccountCount: taxable.size,
        drift: report.drift,
        recommendedTrades,
        harvestCandidates,
      });

      const data: InvestmentRebalancerData = {
        period: input.period,
        totalValue: report.totalValue,
        drift: report.drift,
        maxAbsDrift: report.maxAbsDrift,
        recommendedTrades,
        harvestCandidates,
        autonomousTrade: false,
      };

      // ROI is null: a rebalance recommendation hasn't realized any dollars —
      // nothing was traded. Like Auto-Saver's proposal, value lands only if the
      // user acts at their brokerage.
      return { roi: null, data: data as unknown as Record<string, unknown> };
    },
  });
