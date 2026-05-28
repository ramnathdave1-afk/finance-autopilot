import { describe, it, expect, vi, afterEach } from 'vitest';

// We mock the service client at the module-graph level so getStreaks runs
// against in-memory data without needing Supabase.

const txns: Array<{ amount: number; date: string; ai_category: string | null; category: string | null }> = [];
const rules: Array<{ trigger: { kind?: string; cap?: number }; enabled: boolean }> = [];

function reset() {
  txns.length = 0;
  rules.length = 0;
}

vi.mock('../src/client', () => {
  return {
    createServiceClient: () => ({
      from: (table: string) => {
        const builder: Record<string, unknown> = {};
        const ret = (data: unknown) => Promise.resolve({ data, error: null });
        builder.select = () => builder;
        builder.eq = () => builder;
        builder.gte = () => builder;
        builder.order = () => builder;
        builder.then = (resolve: (v: { data: unknown; error: null }) => unknown) => {
          if (table === 'transactions') return ret(txns).then(resolve);
          if (table === 'rules') return ret(rules).then(resolve);
          return ret([]).then(resolve);
        };
        return builder;
      },
    }),
  };
});

import { getStreaks } from '../src/streaks';

afterEach(() => reset());

function isoDaysAgo(n: number): string {
  return new Date(Date.now() - n * 86400_000).toISOString().slice(0, 10);
}

describe('getStreaks', () => {
  it('returns zeros when there is no activity', async () => {
    const s = await getStreaks('u1');
    expect(s.no_uber_eats_days).toBeGreaterThanOrEqual(0);
    expect(s.savings_days).toBe(0);
    expect(s.daily_cap).toBeNull();
    expect(s.under_cap_days).toBe(0);
  });

  it('counts no_uber_eats_days correctly across N idle days', async () => {
    // 3 days ago: a coffee charge. No food delivery anywhere.
    txns.push({ amount: 4.5, date: isoDaysAgo(3), ai_category: 'Coffee', category: null });
    const s = await getStreaks('u1', 10);
    expect(s.no_uber_eats_days).toBeGreaterThanOrEqual(1);
  });

  it('breaks no_uber_eats_days streak on a Food Delivery charge', async () => {
    txns.push({ amount: 22, date: isoDaysAgo(1), ai_category: 'Food Delivery', category: null });
    const s = await getStreaks('u1', 5);
    expect(s.no_uber_eats_days).toBe(0);
  });

  it('counts savings_days when daily inflow ≥ outflow', async () => {
    txns.push({ amount: -1000, date: isoDaysAgo(1), ai_category: 'Income', category: null }); // inflow
    txns.push({ amount: 50, date: isoDaysAgo(1), ai_category: 'Groceries', category: null });   // outflow
    const s = await getStreaks('u1', 5);
    expect(s.savings_days).toBeGreaterThanOrEqual(1);
  });

  it('honors daily_outflow_cap rule for under_cap_days', async () => {
    rules.push({ trigger: { kind: 'daily_outflow_cap', cap: 100 }, enabled: true });
    txns.push({ amount: 40, date: isoDaysAgo(1), ai_category: 'Groceries', category: null });
    const s = await getStreaks('u1', 5);
    expect(s.daily_cap).toBe(100);
    expect(s.under_cap_days).toBeGreaterThanOrEqual(1);
  });

  it('breaks under_cap_days when outflow exceeds cap', async () => {
    rules.push({ trigger: { kind: 'daily_outflow_cap', cap: 30 }, enabled: true });
    txns.push({ amount: 100, date: isoDaysAgo(1), ai_category: 'Shopping', category: null });
    const s = await getStreaks('u1', 5);
    expect(s.under_cap_days).toBe(0);
  });
});
