import { describe, it, expect } from 'vitest';
import {
  createHttpPort,
  createHttpPortFromEnv,
  createMockPort,
  type UnclaimedHit,
} from '../src/unclaimed-property-port';

describe('UnclaimedPropertyPort', () => {
  it('mock port returns canned hits and never hits the network', async () => {
    const hits: UnclaimedHit[] = [
      { source: 'naupa', propertyId: 'X1', state: 'AZ', holder: 'H', amountEstimate: 'Under $50', claimUrl: null },
    ];
    const port = createMockPort(hits);
    const out = await port.search({ fullName: 'Anyone' });
    expect(out).toHaveLength(1);
    expect(out[0]!.propertyId).toBe('X1');
    // Returns copies — caller mutation must not leak back into the seed.
    out[0]!.holder = 'mutated';
    const again = await port.search({ fullName: 'Anyone' });
    expect(again[0]!.holder).toBe('H');
  });

  it('env-driven factory throws loudly when credentials are absent (never fakes success)', () => {
    expect(() => createHttpPortFromEnv({} as NodeJS.ProcessEnv)).toThrow(/UNCLAIMED_PROPERTY_BASE_URL/);
  });

  it('http port posts to the source and maps the hits payload', async () => {
    let capturedUrl = '';
    let capturedAuth = '';
    const fakeFetch = (async (url: string | URL, init?: RequestInit) => {
      capturedUrl = String(url);
      capturedAuth = String((init?.headers as Record<string, string>)?.authorization ?? '');
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ hits: [{ source: 'naupa', propertyId: 'P9', state: null, holder: null, amountEstimate: null, claimUrl: null }] }),
      } as Response;
    }) as unknown as typeof fetch;

    const port = createHttpPort({ baseUrl: 'https://api.example.com/', apiKey: 'secret', fetchImpl: fakeFetch });
    const out = await port.search({ fullName: 'Jane' });
    expect(capturedUrl).toBe('https://api.example.com/v1/search');
    expect(capturedAuth).toBe('Bearer secret');
    expect(out).toHaveLength(1);
    expect(out[0]!.propertyId).toBe('P9');
  });

  it('http port throws on a non-OK response (does not swallow into empty results)', async () => {
    const fakeFetch = (async () =>
      ({ ok: false, status: 503, statusText: 'Service Unavailable', json: async () => ({}) }) as Response) as unknown as typeof fetch;
    const port = createHttpPort({ baseUrl: 'https://api.example.com', apiKey: 'k', fetchImpl: fakeFetch });
    await expect(port.search({ fullName: 'Jane' })).rejects.toThrow(/503/);
  });
});
