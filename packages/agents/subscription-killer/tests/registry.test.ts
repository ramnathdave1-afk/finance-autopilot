import { describe, it, expect } from 'vitest';
import { registry, registryList } from '../src/registry';

describe('merchant registry', () => {
  it('has at least 10 entries', () => {
    expect(registryList.length).toBeGreaterThanOrEqual(10);
  });

  it('every entry has required non-empty fields', () => {
    for (const spec of registryList) {
      expect(spec.merchantKey).toMatch(/^[a-z0-9_]+$/);
      expect(spec.displayName.length).toBeGreaterThan(0);
      expect(['web', 'voice']).toContain(spec.cancelMethod);
      expect(spec.loginUrl).toMatch(/^https?:|^tel:/);
      expect(spec.billingUrl.length).toBeGreaterThan(0);
      expect(spec.steps.length).toBeGreaterThan(0);
      expect(spec.successSelector.length).toBeGreaterThan(0);
      for (const step of spec.steps) {
        expect(['navigate', 'click', 'type', 'wait', 'verify']).toContain(step.action);
      }
    }
  });

  it('no duplicate merchantKey', () => {
    const seen = new Set<string>();
    for (const spec of registryList) {
      expect(seen.has(spec.merchantKey)).toBe(false);
      seen.add(spec.merchantKey);
    }
    expect(seen.size).toBe(registryList.length);
  });

  it('registry record matches list', () => {
    expect(Object.keys(registry).sort()).toEqual(
      registryList.map((s) => s.merchantKey).sort(),
    );
  });
});
