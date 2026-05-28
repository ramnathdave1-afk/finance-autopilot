import { describe, it, expect, vi } from 'vitest';
import { aggregateDailyBrief, nextDueAt } from '../src/aggregator';

// Build a fake supabase that responds based on the table being queried.
function fakeClient(state: {
  transactions?: { amount: number }[];
  subscriptions?: { merchant: string; amount: number; frequency: string; last_charged_at: string | null }[];
  actions?: { agent_type: string; action_type: string; roi_amount: number | null; target: string | null }[];
  errOn?: 'transactions' | 'subscriptions' | 'agent_actions';
}) {
  const builder = (table: string) => {
    const chain: any = {
      _filters: [] as unknown[],
      select() {
        return chain;
      },
      eq() {
        return chain;
      },
      gt() {
        return chain;
      },
      gte() {
        return chain;
      },
      lte() {
        return chain;
      },
      then(resolve: (v: { data: unknown; error: unknown }) => unknown) {
        if (state.errOn === table) {
          return Promise.resolve(resolve({ data: null, error: { message: 'boom' } }));
        }
        const data =
          table === 'transactions' ? state.transactions ?? [] :
          table === 'subscriptions' ? state.subscriptions ?? [] :
          state.actions ?? [];
        return Promise.resolve(resolve({ data, error: null }));
      },
    };
    return chain;
  };
  return { from: vi.fn(builder) } as any;
}

describe('nextDueAt', () => {
  const now = new Date('2026-05-28T12:00:00Z');

  it('advances monthly subscriptions past now', () => {
    const due = nextDueAt('2026-04-01T00:00:00Z', 'monthly', now);
    expect(due).not.toBeNull();
    expect(due!.getTime()).toBeGreaterThanOrEqual(now.getTime());
  });

  it('returns null for unknown frequency or missing last_charged_at', () => {
    expect(nextDueAt(null, 'monthly', now)).toBeNull();
    expect(nextDueAt('2026-04-01T00:00:00Z', 'biennial', now)).toBeNull();
  });

  it('handles weekly cadence', () => {
    const due = nextDueAt('2026-05-20T00:00:00Z', 'weekly', now);
    expect(due!.toISOString().slice(0, 10)).toBe('2026-06-03');
  });
});

describe('aggregateDailyBrief', () => {
  const now = new Date('2026-05-28T12:00:00Z');

  it('sums yesterday spend, picks bills in 24h window, surfaces succeeded actions', async () => {
    const client = fakeClient({
      transactions: [{ amount: 12.5 }, { amount: 7.25 }, { amount: 0.01 }],
      subscriptions: [
        // Due within next 24h (last charged exactly 30 days before now).
        { merchant: 'Netflix', amount: 15.99, frequency: 'monthly', last_charged_at: new Date(now.getTime() - 30 * 24 * 3600 * 1000 + 60 * 60 * 1000).toISOString() },
        // Due far in future.
        { merchant: 'NYT', amount: 4, frequency: 'monthly', last_charged_at: new Date(now.getTime() - 5 * 24 * 3600 * 1000).toISOString() },
      ],
      actions: [
        { agent_type: 'subscription_killer', action_type: 'cancel', roi_amount: 15.99, target: 'Netflix' },
        { agent_type: 'spending_coach', action_type: 'insight', roi_amount: null, target: null },
      ],
    });

    const agg = await aggregateDailyBrief('u1', client, now);
    expect(agg.yesterdaySpend).toBeCloseTo(19.76, 2);
    expect(agg.upcomingBills.map((b) => b.merchant)).toEqual(['Netflix']);
    expect(agg.completedActions).toHaveLength(2);
    expect(agg.completedActions[0]!.roi).toBe(15.99);
  });

  it('returns zeros when no data', async () => {
    const client = fakeClient({});
    const agg = await aggregateDailyBrief('u1', client, now);
    expect(agg.yesterdaySpend).toBe(0);
    expect(agg.upcomingBills).toEqual([]);
    expect(agg.completedActions).toEqual([]);
  });

  it('throws on supabase error', async () => {
    const client = fakeClient({ errOn: 'transactions' });
    await expect(aggregateDailyBrief('u1', client, now)).rejects.toThrow(/aggregate:transactions/);
  });
});
