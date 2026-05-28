import { describe, it, expect } from 'vitest';
import { registry, registryList } from '../src/registry';

describe('merchant registry', () => {
  it('has at least 50 entries (PRD §8.2: top 50 services pre-mapped)', () => {
    expect(registryList.length).toBeGreaterThanOrEqual(50);
  });

  it('every entry conforms to the MerchantCancelSpec shape', () => {
    for (const spec of registryList) {
      expect(spec.merchantKey).toMatch(/^[a-z0-9_]+$/);
      expect(spec.displayName.length).toBeGreaterThan(0);
      expect(['web', 'voice']).toContain(spec.cancelMethod);
      expect(spec.loginUrl).toMatch(/^https?:|^tel:/);
      expect(spec.billingUrl.length).toBeGreaterThan(0);
      expect(spec.steps.length).toBeGreaterThan(0);
      expect(spec.successSelector.length).toBeGreaterThan(0);
      if (spec.monthlyAmountEstimate !== undefined) {
        expect(typeof spec.monthlyAmountEstimate).toBe('number');
        expect(spec.monthlyAmountEstimate).toBeGreaterThan(0);
      }
      for (const step of spec.steps) {
        expect(['navigate', 'click', 'type', 'wait', 'verify']).toContain(step.action);
        if (step.action === 'type') {
          expect(typeof step.value).toBe('string');
        }
        if (step.target !== undefined) {
          expect(typeof step.target).toBe('string');
        }
      }
    }
  });

  it('all merchantKeys are unique', () => {
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

  it('flags voice-method entries and uses a tel: login for them', () => {
    const voiceEntries = registryList.filter((s) => s.cancelMethod === 'voice');
    // At least the known phone-only services (equinox, 24-hour-fitness, sirius-xm).
    expect(voiceEntries.length).toBeGreaterThanOrEqual(3);
    for (const spec of voiceEntries) {
      const dialsPhone =
        spec.loginUrl.startsWith('tel:') ||
        spec.steps.some((step) => step.action === 'navigate' && step.target?.startsWith('tel:'));
      expect(dialsPhone).toBe(true);
    }
  });
});
