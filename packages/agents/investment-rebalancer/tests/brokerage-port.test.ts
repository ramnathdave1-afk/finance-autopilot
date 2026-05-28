import { describe, it, expect, vi } from 'vitest';
import {
  createHttpQuotePort,
  createHttpQuotePortFromEnv,
  createMockQuotePort,
} from '../src/brokerage-port';

describe('createMockQuotePort', () => {
  it('returns canned quotes for known tickers and omits unknown ones', async () => {
    const port = createMockQuotePort([
      { ticker: 'VTI', price: 250 },
      { ticker: 'BND', price: 72 },
    ]);
    const quotes = await port.refreshQuotes(['VTI', 'NOPE', 'BND']);
    expect(quotes).toEqual([
      { ticker: 'VTI', price: 250 },
      { ticker: 'BND', price: 72 },
    ]);
  });

  it('never reaches the network (empty request -> empty result)', async () => {
    const port = createMockQuotePort([{ ticker: 'VTI', price: 250 }]);
    expect(await port.refreshQuotes([])).toEqual([]);
  });
});

describe('createHttpQuotePortFromEnv (honesty contract)', () => {
  it('throws loudly when credentials are absent', () => {
    expect(() => createHttpQuotePortFromEnv({})).toThrow(
      /live quote port not configured/,
    );
  });

  it('builds a port when env is set', () => {
    const port = createHttpQuotePortFromEnv({
      BROKERAGE_QUOTE_BASE_URL: 'https://quotes.example.com',
      BROKERAGE_QUOTE_API_KEY: 'k',
    } as NodeJS.ProcessEnv);
    expect(typeof port.refreshQuotes).toBe('function');
  });
});

describe('createHttpQuotePort', () => {
  it('posts tickers and parses the quotes array', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ quotes: [{ ticker: 'VTI', price: 250 }] }),
    })) as unknown as typeof fetch;
    const port = createHttpQuotePort({
      baseUrl: 'https://quotes.example.com/',
      apiKey: 'k',
      fetchImpl,
    });
    const quotes = await port.refreshQuotes(['VTI']);
    expect(quotes).toEqual([{ ticker: 'VTI', price: 250 }]);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://quotes.example.com/v1/quotes',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('throws on a non-OK response — never fabricates prices', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
    })) as unknown as typeof fetch;
    const port = createHttpQuotePort({
      baseUrl: 'https://quotes.example.com',
      apiKey: 'k',
      fetchImpl,
    });
    await expect(port.refreshQuotes(['VTI'])).rejects.toThrow(/503/);
  });

  it('short-circuits an empty ticker list without calling fetch', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const port = createHttpQuotePort({
      baseUrl: 'https://quotes.example.com',
      apiKey: 'k',
      fetchImpl,
    });
    expect(await port.refreshQuotes([])).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
