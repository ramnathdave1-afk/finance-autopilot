import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';
import {
  createSession,
  setBrowserAdapterFactory,
  resetBrowserAdapterFactory,
} from '../src/session';
import { makeFakeAdapter } from '../src/test-harness';

const scenario = {
  name: 'basic',
  entries: [
    { kind: 'navigate' as const, match: 'example.com' },
    { kind: 'act' as const, match: 'Click login' },
    { kind: 'extract' as const, response: { data: { title: 'Hello' } } },
    { kind: 'observe' as const, response: { html: '<p>ok</p>', url: 'https://example.com' } },
    { kind: 'screenshot' as const, response: { screenshotUrl: 'https://test/s.png', pngBytes: 2048 } },
  ],
};

describe('BrowserSession', () => {
  beforeEach(() => {
    setBrowserAdapterFactory(async () => makeFakeAdapter(scenario));
  });
  afterEach(() => resetBrowserAdapterFactory());

  it('walks happy path via injected adapter', async () => {
    const s = await createSession('user-1');
    await s.navigate('https://example.com');
    await s.act('Click login');
    const data = await s.extract(z.object({ title: z.string() }));
    expect(data.title).toBe('Hello');
    const obs = await s.observe();
    expect(obs.url).toBe('https://example.com');
    const shot = await s.screenshot();
    expect(shot.pngBytes).toBe(2048);
    await s.close();
  });

  it('throws on use after close', async () => {
    const s = await createSession('user-1');
    await s.close();
    await expect(s.navigate('https://x')).rejects.toThrow(/closed/);
  });

  it('default adapter throws with TODO marker', async () => {
    resetBrowserAdapterFactory();
    const s = await createSession('user-1');
    await expect(s.navigate('x')).rejects.toThrow(/integrate-browserbase-sdk/);
  });
});
