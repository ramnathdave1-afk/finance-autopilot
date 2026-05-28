import { describe, it, expect } from 'vitest';
import { getNetWorth, getSpendingByCategory, getBalances } from '../src/fetchers';

/** Minimal in-memory Supabase shim — supports the chain calls our fetchers use. */
function makeShim(seed: {
  connected_accounts?: Array<{
    user_id: string;
    status: string;
    account_type: string;
    current_balance: number;
    institution_name: string;
    account_subtype?: string | null;
    mask?: string | null;
    available_balance?: number | null;
    id: string;
  }>;
  transactions?: Array<{
    user_id: string;
    date: string;
    amount: number;
    ai_category?: string | null;
    category?: string | null;
  }>;
}) {
  const tables: Record<string, unknown[]> = {
    connected_accounts: seed.connected_accounts ?? [],
    transactions: seed.transactions ?? [],
  };

  const builder = (table: string) => {
    let rows = [...(tables[table] ?? [])];
    const api: Record<string, unknown> = {};
    const eq = (k: string, v: unknown) => {
      rows = rows.filter((r) => (r as Record<string, unknown>)[k] === v);
      return api;
    };
    api.select = () => api;
    api.eq = eq;
    api.gte = (k: string, v: unknown) => {
      rows = rows.filter((r) => (r as Record<string, unknown>)[k]! >= (v as never));
      return api;
    };
    api.gt = (k: string, v: number) => {
      rows = rows.filter((r) => ((r as Record<string, unknown>)[k] as number) > v);
      return api;
    };
    api.order = () => api;
    api.limit = (n: number) => {
      rows = rows.slice(0, n);
      return api;
    };
    api.then = (resolve: (v: { data: unknown; error: null }) => unknown) =>
      Promise.resolve(resolve({ data: rows, error: null }));
    return api as unknown;
  };

  return { from: (t: string) => builder(t) } as unknown as Parameters<typeof getNetWorth>[0];
}

describe('fetchers', () => {
  it('getNetWorth sums assets minus liabilities', async () => {
    const supabase = makeShim({
      connected_accounts: [
        { id: '1', user_id: 'u1', status: 'active', account_type: 'depository', current_balance: 5000, institution_name: 'Chase' },
        { id: '2', user_id: 'u1', status: 'active', account_type: 'credit', current_balance: 1200, institution_name: 'Amex' },
        { id: '3', user_id: 'u1', status: 'active', account_type: 'loan', current_balance: 8000, institution_name: 'Nelnet' },
      ],
    });
    const nw = await getNetWorth(supabase, 'u1');
    expect(nw.assets).toBe(5000);
    expect(nw.liabilities).toBe(9200);
    expect(nw.net).toBe(-4200);
  });

  it('getSpendingByCategory aggregates outflows by ai_category', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const supabase = makeShim({
      transactions: [
        { user_id: 'u1', date: today, amount: 12, ai_category: 'Coffee' },
        { user_id: 'u1', date: today, amount: 8,  ai_category: 'Coffee' },
        { user_id: 'u1', date: today, amount: 40, ai_category: 'Groceries' },
        { user_id: 'u1', date: today, amount: -2000, ai_category: 'Income' }, // excluded by gt(0)
      ],
    });
    const out = await getSpendingByCategory(supabase, 'u1', 30);
    expect(out[0]).toEqual({ category: 'Groceries', amount: 40, count: 1 });
    expect(out[1]).toEqual({ category: 'Coffee', amount: 20, count: 2 });
  });

  it('getBalances returns active accounts', async () => {
    const supabase = makeShim({
      connected_accounts: [
        { id: '1', user_id: 'u1', status: 'active', account_type: 'depository', current_balance: 1000, institution_name: 'Chase', mask: '4321', available_balance: 950 },
      ],
    });
    const out = await getBalances(supabase, 'u1');
    expect(out).toEqual([
      { id: '1', institution: 'Chase', type: 'depository', subtype: null, mask: '4321', current: 1000, available: 950 },
    ]);
  });
});
