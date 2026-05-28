// PRD §8.3 Agent 9 — Credit Card Optimizer.
//
// RECOMMEND-ONLY. This agent never opens a card or moves money. It joins the
// user's real spending profile (@fa/plaid buildSpendingProfile) against the
// seeded cards catalog (`cards` + `user_cards` tables) and produces:
//   - the optimal card to use per spend category, and
//   - high-value cards worth applying for (ranked by net annual value).
// The recommendation lands in agent_actions awaiting approval; the user
// reviews it in the web UI and applies for cards themselves.
//
// HONESTY: no external quote/rate/scraper API is involved. All inputs are the
// user's own transactions (already synced by @fa/plaid) and the static seeded
// catalog. The math engine (recommend.ts) is pure and unit-tested against the
// catalog fetched through the mockable cards-catalog.ts wrapper.

import { canAct } from '@fa/db';
import { defineAgent, type AgentDefinition } from '@fa/inngest';
import { buildSpendingProfile } from '@fa/plaid';
import { fetchCardCatalog, fetchHeldCardIds } from './cards-catalog';
import { recommendCards, type OptimizerResult } from './recommend';

export interface CardOptimizerInput {
  /** Trailing window of transactions to profile. Defaults to 6 months. */
  windowMonths?: number;
  /** Max apply-for cards to surface. Defaults to 3. */
  maxApplyFor?: number;
}

export interface CardOptimizerData {
  result: OptimizerResult;
  windowMonths: number;
  /** Marker: this agent NEVER opens cards or moves money. */
  autonomousApplication: false;
}

export const cardOptimizerAgent: AgentDefinition<CardOptimizerInput> =
  defineAgent<CardOptimizerInput>({
    type: 'credit_card_optimizer',
    actionType: 'card_recommendation',
    requiresApproval: true,
    // One standing recommendation per user — re-running refreshes the same row.
    idempotencyKey: () => 'card_recommendation',
    run: async (input, ctx) => {
      // Gate: tier + pause + agent-enabled. (PRD §10 — every run checks canAct.)
      const permit = await canAct(ctx.userId, 'credit_card_optimizer');
      if (!permit.allowed) {
        await ctx.log('gate:denied', false, { reason: permit.reason ?? 'unknown' });
        throw new Error(`card_optimizer not permitted: ${permit.reason ?? 'unknown'}`);
      }

      const windowMonths = input.windowMonths ?? 6;
      await ctx.log('profile:start', true, { windowMonths });
      const profile = await buildSpendingProfile(ctx.userId, windowMonths);
      await ctx.log('profile:done', true, {
        totalAnnualized: profile.totalAnnualized,
        categoryCount: Object.keys(profile.categorySpend).length,
        monthsObserved: profile.monthsObserved,
      });

      const [catalog, heldCardIds] = await Promise.all([
        fetchCardCatalog(),
        fetchHeldCardIds(ctx.userId),
      ]);
      await ctx.log('catalog:loaded', true, {
        catalogSize: catalog.length,
        heldCount: heldCardIds.length,
      });

      const result = recommendCards(profile, catalog, {
        heldCardIds,
        ...(input.maxApplyFor != null ? { maxApplyFor: input.maxApplyFor } : {}),
      });
      await ctx.log('recommend:done', true, {
        perCategoryCount: result.perCategory.length,
        applyForCount: result.applyFor.length,
        currentAnnualReward: result.currentAnnualReward,
      });

      // ROI = net annual value of the best apply-for recommendation. This is the
      // honest realizable gain over what the user already earns, net of fees.
      // null when there's nothing worth applying for (empty profile / already
      // optimal). We never count money the user hasn't actually captured.
      const roi = result.applyFor.length > 0 ? result.applyFor[0]!.netAnnualValue : null;

      const data: CardOptimizerData = {
        result,
        windowMonths,
        autonomousApplication: false,
      };
      await ctx.log('proposal:built', true, { roi });
      return { roi, data: data as unknown as Record<string, unknown> };
    },
  });
