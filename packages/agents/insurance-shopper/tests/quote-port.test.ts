import { describe, expect, it } from 'vitest';
import { mockQuotePort } from '../src/mock-quote-port';
import { httpQuotePort, httpQuotePortFromEnv } from '../src/quote-port';
import type { QuoteRequest } from '../src/quote-port';

const baseReq = (overrides: Partial<QuoteRequest> = {}): QuoteRequest => ({
  kind: 'auto',
  currentCarrier: 'Nationwide',
  currentMonthlyPremium: 120,
  coverage: { bodily_injury: '100/300', deductible: 500 },
  ...overrides,
});

describe('mockQuotePort', () => {
  it('returns at least 5 competitor quotes for auto', async () => {
    const port = mockQuotePort();
    const quotes = await port.fetchQuotes(baseReq());
    expect(quotes.length).toBeGreaterThanOrEqual(5);
    quotes.forEach((q) => {
      expect(q.carrier).toBeTruthy();
      expect(q.monthlyPremium).toBeGreaterThan(0);
      expect(q.annualPremium).toBeGreaterThan(0);
    });
  });

  it('returns at least 5 competitor quotes for renters', async () => {
    const quotes = await mockQuotePort().fetchQuotes(baseReq({ kind: 'renters' }));
    expect(quotes.length).toBeGreaterThanOrEqual(5);
  });

  it('excludes the incumbent carrier by default', async () => {
    const quotes = await mockQuotePort().fetchQuotes(
      baseReq({ kind: 'auto', currentCarrier: 'Geico' }),
    );
    expect(quotes.some((q) => q.carrier.toLowerCase() === 'geico')).toBe(false);
  });

  it('is deterministic across runs', async () => {
    const a = await mockQuotePort().fetchQuotes(baseReq());
    const b = await mockQuotePort().fetchQuotes(baseReq());
    expect(a).toEqual(b);
  });

  it('honors a forced no-better-quote multiplier spread', async () => {
    const quotes = await mockQuotePort({ multipliers: [1.1, 1.2, 1.3] }).fetchQuotes(baseReq());
    quotes.forEach((q) => expect(q.monthlyPremium).toBeGreaterThan(120));
  });
});

describe('httpQuotePortFromEnv — honesty: refuses to fake', () => {
  it('throws when aggregator URL is missing', () => {
    expect(() => httpQuotePortFromEnv({ INSURANCE_AGGREGATOR_API_KEY: 'k' } as NodeJS.ProcessEnv)).toThrow(
      /INSURANCE_AGGREGATOR_URL/,
    );
  });

  it('throws when API key is missing', () => {
    expect(() =>
      httpQuotePortFromEnv({ INSURANCE_AGGREGATOR_URL: 'https://x' } as NodeJS.ProcessEnv),
    ).toThrow(/INSURANCE_AGGREGATOR_API_KEY/);
  });
});

describe('httpQuotePort — real transport shape (injected fetch)', () => {
  it('POSTs to /v1/quotes with bearer auth and normalizes the payload', async () => {
    let capturedUrl = '';
    let capturedInit: RequestInit | undefined;
    const fakeFetch: typeof fetch = (async (url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedInit = init;
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          quotes: [
            { carrier: 'Geico', monthly_premium: 95, annual_premium: 1140, quote_url: 'https://q/g' },
            { carrier: 'Progressive', monthlyPremium: 110 },
          ],
        }),
      } as Response;
    }) as unknown as typeof fetch;

    const port = httpQuotePort({ baseUrl: 'https://agg.example/', apiKey: 'secret', fetchImpl: fakeFetch });
    const quotes = await port.fetchQuotes(baseReq());

    expect(capturedUrl).toBe('https://agg.example/v1/quotes');
    expect((capturedInit?.headers as Record<string, string>).authorization).toBe('Bearer secret');
    expect(quotes).toEqual([
      { carrier: 'Geico', monthlyPremium: 95, annualPremium: 1140, quoteUrl: 'https://q/g' },
      { carrier: 'Progressive', monthlyPremium: 110 },
    ]);
  });

  it('throws on a non-OK response rather than returning fake data', async () => {
    const fakeFetch: typeof fetch = (async () =>
      ({ ok: false, status: 503, statusText: 'Service Unavailable' }) as Response) as unknown as typeof fetch;
    const port = httpQuotePort({ baseUrl: 'https://agg.example', apiKey: 'k', fetchImpl: fakeFetch });
    await expect(port.fetchQuotes(baseReq())).rejects.toThrow(/503/);
  });
});
