import { describe, expect, it } from 'vitest';
import { roundUpBreakdown, roundUpTotal } from '../src/roundup-calc';

describe('roundUpTotal', () => {
  it('rounds each debit up to the next whole dollar', () => {
    const total = roundUpTotal([
      { id: '1', amountCents: 347, date: '2026-05-01', isDebit: true }, // +53
      { id: '2', amountCents: 1299, date: '2026-05-01', isDebit: true }, // +1
      { id: '3', amountCents: 500, date: '2026-05-02', isDebit: true }, // +0
    ]);
    expect(total).toBe(54);
  });

  it('ignores inflows', () => {
    const total = roundUpTotal([
      { id: 'a', amountCents: 250_000, date: '2026-05-01', isDebit: false },
      { id: 'b', amountCents: 347, date: '2026-05-01', isDebit: true },
    ]);
    expect(total).toBe(53);
  });

  it('handles negative-signed debits', () => {
    const total = roundUpTotal([
      { id: '1', amountCents: -347, date: '2026-05-01', isDebit: true },
    ]);
    expect(total).toBe(53);
  });

  it('returns 0 when no debits', () => {
    expect(roundUpTotal([])).toBe(0);
  });

  it('breakdown lists only round-up-eligible debits', () => {
    const bd = roundUpBreakdown([
      { id: '1', amountCents: 347, date: '2026-05-01', isDebit: true },
      { id: '2', amountCents: 500, date: '2026-05-02', isDebit: true },
      { id: '3', amountCents: 1299, date: '2026-05-02', isDebit: true },
    ]);
    expect(bd).toEqual([
      { id: '1', roundUpCents: 53 },
      { id: '3', roundUpCents: 1 },
    ]);
  });
});
