import { describe, expect, it } from 'vitest';
import { detectPaychecks } from '../src/paycheck-detector';

describe('detectPaychecks', () => {
  it('detects biweekly paychecks of similar amount', () => {
    const found = detectPaychecks([
      { id: 'a', amountCents: 250_000, date: '2026-05-01' },
      { id: 'b', amountCents: 252_000, date: '2026-05-15' },
      { id: 'c', amountCents: 251_000, date: '2026-05-29' },
    ]);
    expect(found.length).toBe(3);
    expect(found[0]!.cadenceDays).toBe(14);
  });

  it('rejects single inflows', () => {
    expect(
      detectPaychecks([{ id: 'a', amountCents: 250_000, date: '2026-05-01' }]),
    ).toEqual([]);
  });

  it('rejects inflows below the $500 threshold', () => {
    const found = detectPaychecks([
      { id: 'a', amountCents: 40_000, date: '2026-05-01' },
      { id: 'b', amountCents: 40_000, date: '2026-05-15' },
    ]);
    expect(found).toEqual([]);
  });

  it('rejects irregular cadence', () => {
    const found = detectPaychecks([
      { id: 'a', amountCents: 250_000, date: '2026-05-01' },
      { id: 'b', amountCents: 250_000, date: '2026-05-09' }, // 8 days, invalid
    ]);
    expect(found).toEqual([]);
  });

  it('separates two distinct paycheck sources', () => {
    const found = detectPaychecks([
      { id: 'a', amountCents: 250_000, date: '2026-05-01' },
      { id: 'b', amountCents: 250_000, date: '2026-05-15' },
      { id: 'c', amountCents: 80_000, date: '2026-05-07' },
      { id: 'd', amountCents: 80_000, date: '2026-05-21' },
    ]);
    expect(found.length).toBe(4);
  });
});
