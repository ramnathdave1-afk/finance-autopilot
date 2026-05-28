import { describe, it, expect, vi } from 'vitest';

vi.mock('@fa/claude', () => ({
  DEFAULT_MODEL: 'sonnet',
  call: vi.fn(async () => ({
    text: '```json\n{"headline":"On track","levers":[{"title":"A","rationale":"because","effort":"low"}]}\n```',
    inputTokens: 1,
    outputTokens: 1,
    cacheReadTokens: 0,
    cacheCreateTokens: 0,
    model: 'sonnet',
    latencyMs: 1,
  })),
}));

import { safeParseStrategy, generateStrategy } from '../src/strategy';
import { buildProjection } from '../src/projection';

describe('safeParseStrategy', () => {
  it('parses well-formed JSON', () => {
    const r = safeParseStrategy(
      JSON.stringify({
        headline: 'h',
        levers: [{ title: 't', rationale: 'r', effort: 'high' }],
      }),
    );
    expect(r.headline).toBe('h');
    expect(r.levers[0]!.effort).toBe('high');
  });

  it('defaults invalid effort to medium and drops malformed levers', () => {
    const r = safeParseStrategy(
      JSON.stringify({
        headline: 'h',
        levers: [
          { title: 't', rationale: 'r', effort: 'wild' },
          { title: 42, rationale: 'r' },
          'nope',
        ],
      }),
    );
    expect(r.levers).toHaveLength(1);
    expect(r.levers[0]!.effort).toBe('medium');
  });

  it('returns empty on unparseable text', () => {
    const r = safeParseStrategy('not json at all');
    expect(r).toEqual({ headline: '', levers: [] });
  });

  it('caps levers at 4', () => {
    const r = safeParseStrategy(
      JSON.stringify({
        headline: 'h',
        levers: Array.from({ length: 9 }).map((_, i) => ({
          title: `t${i}`,
          rationale: 'r',
          effort: 'low',
        })),
      }),
    );
    expect(r.levers).toHaveLength(4);
  });
});

describe('generateStrategy', () => {
  it('tolerates fenced JSON from the model', async () => {
    const projection = buildProjection([
      { date: '2025-01-01', netWorth: 10_000 },
      { date: '2026-01-01', netWorth: 50_000 },
    ]);
    const rec = await generateStrategy({
      projection,
      targetSolve: { date: '2030-01-01', daysAway: 1000, alreadyMet: false },
      requiredExtraPerDay: 12.5,
      target: { amount: 250_000, date: '2030-01-01' },
    });
    expect(rec.headline).toBe('On track');
    expect(rec.levers).toHaveLength(1);
  });
});
