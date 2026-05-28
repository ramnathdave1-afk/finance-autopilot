// PRD §8.3 Agent 9 — Credit Card Optimizer: pure recommendation engine.
//
// Given a spending profile (annualized $/category from @fa/plaid's
// buildSpendingProfile) and the cards catalog (CardRow[] from the `cards`
// table), compute:
//   1. The optimal card to use per spend category (category -> best card).
//   2. High-value cards worth APPLYING for, ranked by net incremental annual
//      reward over what the user's currently-held cards already earn.
//
// This module is PURE. No DB, no network, no Claude. Everything it needs is
// passed in. The agent (agent.ts) wires the live data sources; tests exercise
// this engine directly with fixtures.

import type { CardRow, CardRewardRule } from '@fa/db/types';
import type { SpendingProfile } from '@fa/plaid';

/** A card's reward value, in reward-units, for a single category of spend. */
export interface CategoryCardValue {
  cardId: string;
  cardName: string;
  issuer: string;
  multiplier: number;
  /** Annual reward-units this card yields on this category's spend. */
  annualReward: number;
  /** Annual fee of the card (informational; not netted at the per-category level). */
  annualFee: number;
}

/** Best card to use for one spend category. */
export interface CategoryRecommendation {
  category: string;
  annualSpend: number;
  best: CategoryCardValue | null;
  /** Runners-up (already excludes `best`), descending by annualReward. */
  alternatives: CategoryCardValue[];
}

/** A card the user does NOT hold, surfaced as worth applying for. */
export interface ApplyRecommendation {
  cardId: string;
  cardName: string;
  issuer: string;
  annualFee: number;
  applicationUrl: string | null;
  /** Total annual reward-units this card would earn across the user's spend. */
  grossAnnualReward: number;
  /**
   * Incremental annual reward-units over the BEST card the user already holds,
   * per category, summed. This is the honest "what you'd gain" number.
   */
  incrementalAnnualReward: number;
  /** incrementalAnnualReward minus annualFee — the bottom-line net gain. */
  netAnnualValue: number;
  signupBonus: Record<string, unknown> | null;
}

export interface OptimizerResult {
  /** Per-category best-card mapping, descending by category annualSpend. */
  perCategory: CategoryRecommendation[];
  /**
   * Cards worth applying for, descending by netAnnualValue. Only positive-net
   * cards are included — we never recommend a card that loses money.
   */
  applyFor: ApplyRecommendation[];
  /** Total annual reward-units the user currently earns with held cards. */
  currentAnnualReward: number;
  /** Total annual reward-units under the optimal held-card mix per category. */
  optimizedHeldAnnualReward: number;
}

const WILDCARD_CATEGORY = 'Other';

/**
 * Resolve the multiplier a card applies to a given category. Falls back to the
 * card's wildcard ("Other") rule, else 0 (card earns nothing on this category).
 * Rules are matched case-insensitively on the canonical category label.
 */
export function multiplierFor(card: CardRow, category: string): number {
  const rules: CardRewardRule[] = card.rewards ?? [];
  const want = category.trim().toLowerCase();
  let wildcard = 0;
  for (const r of rules) {
    const cat = r.category.trim().toLowerCase();
    if (cat === want) return r.multiplier;
    if (cat === WILDCARD_CATEGORY.toLowerCase()) wildcard = r.multiplier;
  }
  return wildcard;
}

/**
 * Annual reward-units a card yields on a given annual spend in a category.
 * Respects an optional annual cap (cap_annual is in DOLLARS of spend, so the
 * capped portion earns the multiplier and the remainder earns the wildcard).
 */
function annualRewardFor(card: CardRow, category: string, annualSpend: number): number {
  if (annualSpend <= 0) return 0;
  const rule = (card.rewards ?? []).find(
    (r) => r.category.trim().toLowerCase() === category.trim().toLowerCase(),
  );
  const mult = multiplierFor(card, category);

  if (rule?.cap_annual != null && annualSpend > rule.cap_annual) {
    const wildcard = wildcardMultiplier(card);
    const cappedSpend = rule.cap_annual;
    const overflow = annualSpend - rule.cap_annual;
    return cappedSpend * mult + overflow * wildcard;
  }
  return annualSpend * mult;
}

function wildcardMultiplier(card: CardRow): number {
  for (const r of card.rewards ?? []) {
    if (r.category.trim().toLowerCase() === WILDCARD_CATEGORY.toLowerCase()) return r.multiplier;
  }
  return 0;
}

function toValue(card: CardRow, category: string, annualSpend: number): CategoryCardValue {
  return {
    cardId: card.id,
    cardName: card.name,
    issuer: card.issuer,
    multiplier: multiplierFor(card, category),
    annualReward: Number(annualRewardFor(card, category, annualSpend).toFixed(2)),
    annualFee: card.annual_fee,
  };
}

export interface RecommendOptions {
  /** card_ids the user currently holds (from user_cards). */
  heldCardIds?: string[];
  /** Max apply-for recommendations to surface. Default 3. */
  maxApplyFor?: number;
}

/**
 * The core engine. Pure: same inputs always yield the same result.
 */
export function recommendCards(
  profile: SpendingProfile,
  catalog: CardRow[],
  opts: RecommendOptions = {},
): OptimizerResult {
  const held = new Set(opts.heldCardIds ?? []);
  const maxApplyFor = opts.maxApplyFor ?? 3;
  const activeCatalog = catalog.filter((c) => c.active !== false);
  const heldCards = activeCatalog.filter((c) => held.has(c.id));

  // Spend categories, descending by annual spend. Empty profile => empty.
  const categories = Object.entries(profile.categorySpend)
    .filter(([, spend]) => spend > 0)
    .sort((a, b) => b[1] - a[1]);

  const perCategory: CategoryRecommendation[] = categories.map(([category, annualSpend]) => {
    const ranked = activeCatalog
      .map((c) => toValue(c, category, annualSpend))
      .filter((v) => v.annualReward > 0)
      .sort((a, b) => b.annualReward - a.annualReward || a.annualFee - b.annualFee);
    const [best, ...alternatives] = ranked;
    return {
      category,
      annualSpend: Number(annualSpend.toFixed(2)),
      best: best ?? null,
      alternatives: alternatives.slice(0, 3),
    };
  });

  // What the user earns today: best of their HELD cards per category.
  let currentAnnualReward = 0;
  const bestHeldRewardByCat = new Map<string, number>();
  for (const [category, annualSpend] of categories) {
    let bestHeld = 0;
    for (const card of heldCards) {
      bestHeld = Math.max(bestHeld, annualRewardFor(card, category, annualSpend));
    }
    bestHeldRewardByCat.set(category, bestHeld);
    currentAnnualReward += bestHeld;
  }

  // Optimal mix across HELD cards (cannot exceed perCategory best among held).
  const optimizedHeldAnnualReward = currentAnnualReward;

  // Apply-for: for each NOT-held active card, incremental reward over the best
  // held card per category, summed. Only positive-net cards survive.
  const applyFor: ApplyRecommendation[] = activeCatalog
    .filter((c) => !held.has(c.id))
    .map((card) => {
      let gross = 0;
      let incremental = 0;
      for (const [category, annualSpend] of categories) {
        const cardReward = annualRewardFor(card, category, annualSpend);
        gross += cardReward;
        const bestHeld = bestHeldRewardByCat.get(category) ?? 0;
        if (cardReward > bestHeld) incremental += cardReward - bestHeld;
      }
      const netAnnualValue = incremental - card.annual_fee;
      return {
        cardId: card.id,
        cardName: card.name,
        issuer: card.issuer,
        annualFee: card.annual_fee,
        applicationUrl: card.application_url,
        grossAnnualReward: Number(gross.toFixed(2)),
        incrementalAnnualReward: Number(incremental.toFixed(2)),
        netAnnualValue: Number(netAnnualValue.toFixed(2)),
        signupBonus: card.signup_bonus,
      };
    })
    .filter((r) => r.netAnnualValue > 0)
    .sort((a, b) => b.netAnnualValue - a.netAnnualValue)
    .slice(0, maxApplyFor);

  return {
    perCategory,
    applyFor,
    currentAnnualReward: Number(currentAnnualReward.toFixed(2)),
    optimizedHeldAnnualReward: Number(optimizedHeldAnnualReward.toFixed(2)),
  };
}
