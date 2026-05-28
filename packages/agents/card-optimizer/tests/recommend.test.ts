import { describe, expect, it } from 'vitest';
import { recommendCards, multiplierFor } from '../src/recommend';
import type { CardRow } from '@fa/db/types';
import type { SpendingProfile } from '@fa/plaid';

function card(partial: Partial<CardRow> & Pick<CardRow, 'id' | 'name'>): CardRow {
  return {
    id: partial.id,
    name: partial.name,
    issuer: partial.issuer ?? 'TestBank',
    network: partial.network ?? 'visa',
    annual_fee: partial.annual_fee ?? 0,
    signup_bonus: partial.signup_bonus ?? null,
    rewards: partial.rewards ?? [{ category: 'Other', multiplier: 1 }],
    benefits: partial.benefits ?? [],
    application_url: partial.application_url ?? null,
    active: partial.active ?? true,
    created_at: partial.created_at ?? '2026-01-01T00:00:00Z',
  };
}

function profile(categorySpend: Record<string, number>): SpendingProfile {
  const total = Object.values(categorySpend).reduce((s, v) => s + v, 0);
  return {
    userId: 'u1',
    totalAnnualized: total,
    monthsObserved: 6,
    categorySpend,
    topCategories: Object.entries(categorySpend).map(([category, annualSpend]) => ({
      category,
      annualSpend,
      share: total === 0 ? 0 : annualSpend / total,
    })),
  };
}

const groceriesCard = card({
  id: 'c_groc',
  name: 'Grocery Hero',
  rewards: [
    { category: 'Groceries', multiplier: 6 },
    { category: 'Other', multiplier: 1 },
  ],
});
const diningCard = card({
  id: 'c_dine',
  name: 'Dining Star',
  rewards: [
    { category: 'Restaurants', multiplier: 4 },
    { category: 'Other', multiplier: 1 },
  ],
});
const flatCard = card({
  id: 'c_flat',
  name: 'Flat Two',
  rewards: [{ category: 'Other', multiplier: 2 }],
});

describe('multiplierFor', () => {
  it('matches category case-insensitively and falls back to Other', () => {
    expect(multiplierFor(groceriesCard, 'groceries')).toBe(6);
    expect(multiplierFor(groceriesCard, 'Restaurants')).toBe(1); // wildcard
    expect(multiplierFor(diningCard, 'Travel')).toBe(1); // wildcard
  });

  it('returns 0 when there is no matching rule and no wildcard', () => {
    const noWild = card({ id: 'c_x', name: 'X', rewards: [{ category: 'Travel', multiplier: 5 }] });
    expect(multiplierFor(noWild, 'Groceries')).toBe(0);
  });
});

describe('recommendCards — category to best-card mapping', () => {
  it('picks the highest-multiplier card per category', () => {
    const res = recommendCards(profile({ Groceries: 10000, Restaurants: 6000 }), [
      groceriesCard,
      diningCard,
      flatCard,
    ]);

    const groc = res.perCategory.find((c) => c.category === 'Groceries')!;
    const dine = res.perCategory.find((c) => c.category === 'Restaurants')!;

    expect(groc.best?.cardId).toBe('c_groc');
    expect(groc.best?.annualReward).toBe(60000); // 10000 * 6
    expect(dine.best?.cardId).toBe('c_dine');
    expect(dine.best?.annualReward).toBe(24000); // 6000 * 4
  });

  it('orders categories by descending annual spend', () => {
    const res = recommendCards(profile({ Restaurants: 3000, Groceries: 9000 }), [
      groceriesCard,
      diningCard,
    ]);
    expect(res.perCategory.map((c) => c.category)).toEqual(['Groceries', 'Restaurants']);
  });

  it('breaks reward ties by lower annual fee', () => {
    const cheap = card({ id: 'cheap', name: 'Cheap', annual_fee: 0, rewards: [{ category: 'Other', multiplier: 2 }] });
    const pricey = card({ id: 'pricey', name: 'Pricey', annual_fee: 95, rewards: [{ category: 'Other', multiplier: 2 }] });
    const res = recommendCards(profile({ Travel: 5000 }), [pricey, cheap]);
    expect(res.perCategory[0]!.best?.cardId).toBe('cheap');
  });

  it('respects an annual cap — overflow earns the wildcard rate', () => {
    const capped = card({
      id: 'capped',
      name: 'Capped Grocery',
      rewards: [
        { category: 'Groceries', multiplier: 6, cap_annual: 6000 },
        { category: 'Other', multiplier: 1 },
      ],
    });
    // 10000 grocery spend: 6000 @ 6x + 4000 @ 1x = 36000 + 4000 = 40000
    const res = recommendCards(profile({ Groceries: 10000 }), [capped]);
    expect(res.perCategory[0]!.best?.annualReward).toBe(40000);
  });
});

describe('recommendCards — apply-for (missing-card) recommendations', () => {
  it('recommends a not-held card that beats held cards, net of fee', () => {
    // User holds only the flat 2x card. Grocery Hero (6x groceries) should be
    // recommended because the incremental on heavy grocery spend dwarfs $0 fee.
    const res = recommendCards(profile({ Groceries: 10000 }), [flatCard, groceriesCard], {
      heldCardIds: ['c_flat'],
    });

    expect(res.applyFor.map((a) => a.cardId)).toContain('c_groc');
    const groc = res.applyFor.find((a) => a.cardId === 'c_groc')!;
    // held best on groceries = 10000 * 2 = 20000; new card = 60000; incremental = 40000
    expect(groc.incrementalAnnualReward).toBe(40000);
    expect(groc.netAnnualValue).toBe(40000); // $0 fee
    // never re-recommends a card the user already holds
    expect(res.applyFor.map((a) => a.cardId)).not.toContain('c_flat');
  });

  it('excludes cards whose fee exceeds their incremental value (never lose money)', () => {
    const feeHog = card({
      id: 'feehog',
      name: 'Fee Hog',
      annual_fee: 100000,
      rewards: [{ category: 'Groceries', multiplier: 6 }, { category: 'Other', multiplier: 1 }],
    });
    const res = recommendCards(profile({ Groceries: 1000 }), [flatCard, feeHog], {
      heldCardIds: ['c_flat'],
    });
    expect(res.applyFor.map((a) => a.cardId)).not.toContain('feehog');
  });

  it('honors maxApplyFor', () => {
    const res = recommendCards(profile({ Groceries: 10000, Restaurants: 8000, Travel: 6000 }), [
      groceriesCard,
      diningCard,
      flatCard,
      card({ id: 'travel', name: 'Travel Ace', rewards: [{ category: 'Travel', multiplier: 5 }, { category: 'Other', multiplier: 1 }] }),
    ], { heldCardIds: [], maxApplyFor: 2 });
    expect(res.applyFor.length).toBeLessThanOrEqual(2);
  });

  it('ignores inactive cards entirely', () => {
    const dead = card({ id: 'dead', name: 'Dead', active: false, rewards: [{ category: 'Groceries', multiplier: 99 }] });
    const res = recommendCards(profile({ Groceries: 5000 }), [dead, flatCard]);
    expect(res.perCategory[0]!.best?.cardId).toBe('c_flat');
    expect(res.applyFor.map((a) => a.cardId)).not.toContain('dead');
  });
});

describe('recommendCards — empty / edge cases', () => {
  it('empty spending profile yields no recommendations', () => {
    const res = recommendCards(profile({}), [groceriesCard, diningCard, flatCard]);
    expect(res.perCategory).toEqual([]);
    expect(res.applyFor).toEqual([]);
    expect(res.currentAnnualReward).toBe(0);
    expect(res.optimizedHeldAnnualReward).toBe(0);
  });

  it('empty catalog yields null best card per category', () => {
    const res = recommendCards(profile({ Groceries: 5000 }), []);
    expect(res.perCategory[0]!.best).toBeNull();
    expect(res.applyFor).toEqual([]);
  });

  it('zero-spend categories are dropped', () => {
    const res = recommendCards(profile({ Groceries: 0, Restaurants: 3000 }), [diningCard]);
    expect(res.perCategory.map((c) => c.category)).toEqual(['Restaurants']);
  });
});
