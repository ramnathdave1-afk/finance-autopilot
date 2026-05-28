import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { LoanType } from '@fa/db/types';

// Capture upserts written to rate_snapshots.
const upserts: Array<Record<string, unknown>[]> = [];

vi.mock('@fa/db', () => ({
  createServiceClient: () => ({
    from(table: string) {
      if (table === 'rate_snapshots') {
        return {
          upsert: async (rows: Record<string, unknown>[], _opts: unknown) => {
            upserts.push(rows);
            return { error: null };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

import { MockRatePort, HttpRatePort, type RateQuote } from '../src/rate-port';
import { refreshRates, WATCHED_LOAN_TYPES } from '../src/refresh-rates';

const quote = (loanType: LoanType, aprAvg: number): RateQuote => ({
  loanType,
  source: 'mock',
  aprLow: aprAvg - 0.0025,
  aprAvg,
  aprHigh: aprAvg + 0.0025,
  capturedOn: '2026-05-28',
});

describe('refreshRates', () => {
  beforeEach(() => {
    upserts.length = 0;
  });

  it('fetches via the port and persists to rate_snapshots', async () => {
    const port = new MockRatePort([
      quote('mortgage', 0.055),
      quote('auto', 0.06),
    ]);
    const res = await refreshRates({ port, loanTypes: ['mortgage', 'auto'] });
    expect(res.fetched).toBe(2);
    expect(res.written).toBe(2);
    expect(res.skipped).toBeUndefined();
    expect(upserts).toHaveLength(1);
    expect(upserts[0]?.map((r) => r.loan_type).sort()).toEqual(['auto', 'mortgage']);
  });

  it('defaults to all watched loan types', async () => {
    const port = new MockRatePort(WATCHED_LOAN_TYPES.map((t) => quote(t, 0.05)));
    const res = await refreshRates({ port });
    expect(res.fetched).toBe(WATCHED_LOAN_TYPES.length);
    expect(res.written).toBe(WATCHED_LOAN_TYPES.length);
  });

  it('skips (does NOT write fabricated rates) when the port is unconfigured', async () => {
    const port = new MockRatePort([quote('mortgage', 0.05)]);
    port.configured = false;
    const res = await refreshRates({ port });
    expect(res.skipped).toBe('not_configured');
    expect(res.written).toBe(0);
    expect(upserts).toHaveLength(0);
  });
});

describe('HttpRatePort (live impl, no network in test)', () => {
  it('is unconfigured without env keys and refuses to fetch', async () => {
    const port = new HttpRatePort({ baseUrl: undefined, apiKey: undefined });
    expect(port.isConfigured()).toBe(false);
    await expect(port.fetchRates(['mortgage'])).rejects.toThrow(/not configured/);
  });

  it('fetches + parses through an injected fetch when configured', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ apr_low: 0.052, apr_avg: 0.0545, apr_high: 0.057 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ) as unknown as typeof fetch;
    const port = new HttpRatePort({
      baseUrl: 'https://rates.example.com',
      apiKey: 'k',
      source: 'bankrate',
      fetchImpl,
    });
    expect(port.isConfigured()).toBe(true);
    const quotes = await port.fetchRates(['mortgage']);
    expect(quotes).toHaveLength(1);
    expect(quotes[0]?.aprAvg).toBe(0.0545);
    expect(quotes[0]?.source).toBe('bankrate');
  });

  it('throws on a non-OK response (never fakes success)', async () => {
    const fetchImpl = vi.fn(async () => new Response('nope', { status: 503 })) as unknown as typeof fetch;
    const port = new HttpRatePort({ baseUrl: 'https://x', apiKey: 'k', fetchImpl });
    await expect(port.fetchRates(['mortgage'])).rejects.toThrow(/503/);
  });
});
