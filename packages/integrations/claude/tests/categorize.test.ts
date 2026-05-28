import { describe, it, expect } from 'vitest';
import { CATEGORIES } from '../src/categorize';

describe('categorize taxonomy', () => {
  it('has a stable set of canonical categories', () => {
    // If you add/remove a category, update the dashboard chart legend in T1
    // and the spending-coach prompt in T3.
    expect(CATEGORIES).toContain('Coffee');
    expect(CATEGORIES).toContain('Subscriptions');
    expect(CATEGORIES).toContain('Income');
    expect(CATEGORIES.length).toBeGreaterThanOrEqual(20);
  });

  it('has no duplicates', () => {
    expect(new Set(CATEGORIES).size).toBe(CATEGORIES.length);
  });
});
