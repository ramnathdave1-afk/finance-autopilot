import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AnomalyFlag } from '@fa/plaid';

const detectAnomaliesMock = vi.fn(
  async (_userId: string, _lookbackDays?: number): Promise<AnomalyFlag[]> => [],
);
const detectChargesAfterCancellationMock = vi.fn(
  async (_userId: string): Promise<AnomalyFlag[]> => [],
);

vi.mock('@fa/plaid', () => ({
  detectAnomalies: (...a: [string, number?]) => detectAnomaliesMock(...a),
  detectChargesAfterCancellation: (...a: [string]) => detectChargesAfterCancellationMock(...a),
}));

import { surfaceCandidates } from '../src/candidates';

describe('surfaceCandidates', () => {
  beforeEach(() => {
    detectAnomaliesMock.mockReset();
    detectChargesAfterCancellationMock.mockReset();
  });

  it('maps each anomaly reason onto a dispute reason', async () => {
    detectAnomaliesMock.mockResolvedValue([
      { transactionId: 't1', reason: 'duplicate', score: 0.85, detail: 'dup' },
      { transactionId: 't2', reason: 'unusual_amount', score: 0.7, detail: 'outlier' },
    ]);
    detectChargesAfterCancellationMock.mockResolvedValue([
      { transactionId: 't3', reason: 'subscription_after_cancel', score: 0.9, detail: 'after cancel' },
    ]);

    const candidates = await surfaceCandidates('user-1');
    const byTxn = Object.fromEntries(candidates.map((c) => [c.transactionId, c.reason]));
    expect(byTxn.t1).toBe('duplicate');
    expect(byTxn.t2).toBe('incorrect_amount');
    expect(byTxn.t3).toBe('subscription_cancelled');
    // Sorted highest score first.
    expect(candidates[0]!.transactionId).toBe('t3');
  });

  it('de-dupes the same transaction, keeping the highest score', async () => {
    detectAnomaliesMock.mockResolvedValue([
      { transactionId: 'tx', reason: 'duplicate', score: 0.6, detail: 'low' },
    ]);
    detectChargesAfterCancellationMock.mockResolvedValue([
      { transactionId: 'tx', reason: 'subscription_after_cancel', score: 0.9, detail: 'high' },
    ]);

    const candidates = await surfaceCandidates('user-1');
    expect(candidates.length).toBe(1);
    expect(candidates[0]!.reason).toBe('subscription_cancelled');
    expect(candidates[0]!.score).toBe(0.9);
  });

  it('returns empty when no detectors flag anything', async () => {
    detectAnomaliesMock.mockResolvedValue([]);
    detectChargesAfterCancellationMock.mockResolvedValue([]);
    expect(await surfaceCandidates('user-1')).toEqual([]);
  });
});
