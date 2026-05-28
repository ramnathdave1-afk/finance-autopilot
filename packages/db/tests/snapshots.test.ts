import { describe, it, expect, vi, afterEach } from 'vitest';

interface AccountRow {
  account_type: string;
  current_balance: number;
  status?: string;
  user_id?: string;
}
interface HoldingRow {
  current_value: number | null;
  as_of: string;
  user_id?: string;
}
interface LoanRow {
  current_balance: number | null;
  principal: number | null;
  user_id?: string;
}

const accts: AccountRow[] = [];
const holdings: HoldingRow[] = [];
const loans: LoanRow[] = [];
const upserts: Array<Record<string, unknown>> = [];

function reset() {
  accts.length = 0;
  holdings.length = 0;
  loans.length = 0;
  upserts.length = 0;
}

vi.mock('../src/client', () => {
  return {
    createServiceClient: () => ({
      from: (table: string) => {
        const builder: Record<string, unknown> = {};
        builder.select = () => builder;
        builder.eq = () => builder;
        builder.order = () => builder;
        builder.limit = () => builder;
        builder.upsert = (rows: Record<string, unknown> | Array<Record<string, unknown>>) => {
          if (Array.isArray(rows)) upserts.push(...rows);
          else upserts.push(rows);
          return Promise.resolve({ error: null });
        };
        builder.then = (resolve: (v: { data: unknown; error: null }) => unknown) => {
          if (table === 'connected_accounts') return resolve({ data: accts, error: null });
          if (table === 'investment_holdings') return resolve({ data: holdings, error: null });
          if (table === 'loans') return resolve({ data: loans, error: null });
          return resolve({ data: [], error: null });
        };
        return builder;
      },
    }),
  };
});

import { writeNetWorthSnapshot } from '../src/snapshots';

afterEach(() => reset());

describe('writeNetWorthSnapshot', () => {
  it('computes assets = cash + investments and liabilities = credit + loans', async () => {
    accts.push({ account_type: 'depository', current_balance: 5000, status: 'active', user_id: 'u1' });
    accts.push({ account_type: 'credit', current_balance: 1200, status: 'active', user_id: 'u1' });
    accts.push({ account_type: 'loan', current_balance: 8000, status: 'active', user_id: 'u1' });
    holdings.push({ current_value: 25000, as_of: '2026-05-28', user_id: 'u1' });
    loans.push({ current_balance: 15000, principal: 20000, user_id: 'u1' });

    const res = await writeNetWorthSnapshot('u1');
    expect(res.cash).toBe(5000);
    expect(res.investments).toBe(25000);
    expect(res.credit_debt).toBe(1200);
    // loanDebt from loans (15000) + other_liabilities from accts.loan (8000) = 23200
    expect(res.totalAssets).toBe(30000);
    expect(res.totalLiabilities).toBe(1200 + 15000 + 8000);
    expect(res.netWorth).toBe(res.totalAssets - res.totalLiabilities);
    expect(upserts.length).toBe(1);
    expect(upserts[0].user_id).toBe('u1');
  });

  it('handles no investments / no loans cleanly', async () => {
    accts.push({ account_type: 'depository', current_balance: 200, status: 'active', user_id: 'u1' });
    const res = await writeNetWorthSnapshot('u1');
    expect(res.investments).toBe(0);
    expect(res.totalAssets).toBe(200);
    expect(res.totalLiabilities).toBe(0);
    expect(res.netWorth).toBe(200);
  });
});
