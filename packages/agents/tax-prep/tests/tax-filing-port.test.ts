import { describe, it, expect } from 'vitest';
import {
  createHttpTaxFilingPort,
  createHttpTaxFilingPortFromEnv,
  createMockTaxFilingPort,
} from '../src/tax-filing-port';
import { buildTaxSummary } from '../src/classify';

const SUMMARY = buildTaxSummary([], 2025);

describe('TaxFilingPort', () => {
  it('mock port echoes a synthetic reference + continue URL (never hits network)', async () => {
    const port = createMockTaxFilingPort();
    const res = await port.handoff({ provider: 'turbotax', taxYear: 2025, summary: SUMMARY });
    expect(res.provider).toBe('turbotax');
    expect(res.referenceId).toBe('mock-turbotax-2025');
    expect(res.continueUrl).toContain('turbotax');
  });

  it('env-driven factory throws loudly when credentials are absent (never fakes success)', () => {
    expect(() => createHttpTaxFilingPortFromEnv({} as NodeJS.ProcessEnv)).toThrow(/TAX_FILING_BASE_URL/);
  });

  it('http port posts to the provider and maps the handoff payload', async () => {
    let capturedUrl = '';
    let capturedAuth = '';
    const fakeFetch = (async (url: string | URL, init?: RequestInit) => {
      capturedUrl = String(url);
      capturedAuth = String((init?.headers as Record<string, string>)?.authorization ?? '');
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ referenceId: 'TT-42', continueUrl: 'https://turbotax.test/r/TT-42' }),
      } as Response;
    }) as unknown as typeof fetch;

    const port = createHttpTaxFilingPort({ baseUrl: 'https://api.tt.test/', apiKey: 'secret', fetchImpl: fakeFetch });
    const res = await port.handoff({ provider: 'turbotax', taxYear: 2025, summary: SUMMARY });
    expect(capturedUrl).toBe('https://api.tt.test/v1/handoff');
    expect(capturedAuth).toBe('Bearer secret');
    expect(res.referenceId).toBe('TT-42');
    expect(res.continueUrl).toBe('https://turbotax.test/r/TT-42');
  });

  it('http port throws on a non-OK response (does not swallow into a fake success)', async () => {
    const fakeFetch = (async () =>
      ({ ok: false, status: 502, statusText: 'Bad Gateway', json: async () => ({}) }) as Response) as unknown as typeof fetch;
    const port = createHttpTaxFilingPort({ baseUrl: 'https://api.tt.test', apiKey: 'k', fetchImpl: fakeFetch });
    await expect(port.handoff({ provider: 'hrblock', taxYear: 2025, summary: SUMMARY })).rejects.toThrow(/502/);
  });

  it('http port throws when the provider omits referenceId/continueUrl', async () => {
    const fakeFetch = (async () =>
      ({ ok: true, status: 200, statusText: 'OK', json: async () => ({}) }) as Response) as unknown as typeof fetch;
    const port = createHttpTaxFilingPort({ baseUrl: 'https://api.tt.test', apiKey: 'k', fetchImpl: fakeFetch });
    await expect(port.handoff({ provider: 'turbotax', taxYear: 2025, summary: SUMMARY })).rejects.toThrow(/missing referenceId/);
  });
});
