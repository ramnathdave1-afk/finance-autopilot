import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import { z } from 'zod';
import {
  createSession,
  setBrowserAdapterFactory,
  resetBrowserAdapterFactory,
} from '../src/session';
import { loginAndNavigate, clickCancelFlow, confirmCancellation } from '../src/stagehand';
import { replayFromHar, makeFakeAdapter } from '../src/test-harness';

const NETFLIX_HAR = path.join(__dirname, 'fixtures', 'netflix-success.har.json');
const PF_HAR = path.join(__dirname, 'fixtures', 'planet-fitness-failure.har.json');

describe('stagehand helpers', () => {
  afterEach(() => resetBrowserAdapterFactory());

  it('runs the full netflix happy path', async () => {
    setBrowserAdapterFactory(async () =>
      replayFromHar(NETFLIX_HAR, 'netflix-cancel-success'),
    );
    const s = await createSession('u1');

    const login = await loginAndNavigate(
      s,
      'https://www.netflix.com/login',
      { username: 'a@b.com', password: 'pw' },
    );
    expect(login.ok).toBe(true);
    expect(login.screenshot.url).toContain('netflix-1');

    // manually drive navigate(cancelplan) — the next entry in the HAR
    await s.navigate('https://www.netflix.com/cancelplan');
    const click = await clickCancelFlow(
      s,
      'Click the Finish Cancellation button at the bottom of the page.',
    );
    expect(click.ok).toBe(true);
  });

  it('reports failure with reason when click step throws', async () => {
    setBrowserAdapterFactory(async () =>
      replayFromHar(PF_HAR, 'planet-fitness-cancel-failure'),
    );
    const s = await createSession('u1');
    await loginAndNavigate(
      s,
      'https://www.planetfitness.com/account/login',
      { username: 'a@b.com', password: 'pw' },
    );
    await s.navigate('https://www.planetfitness.com/account');
    const click = await clickCancelFlow(s, 'Click the Cancel Membership link');
    expect(click.ok).toBe(false);
    expect(click.reason).toMatch(/in-person/);
  });

  it('confirmCancellation returns ok when extract.found is true', async () => {
    setBrowserAdapterFactory(async () =>
      replayFromHar(NETFLIX_HAR, 'netflix-cancel-success'),
    );
    const s = await createSession('u1');
    // burn through the script up to the confirm step
    await s.navigate('https://www.netflix.com/login');
    await s.act('Enter username "x" and password "y" then submit the login form.');
    await s.screenshot();
    // login-verify extract entry (loginAndNavigate would consume this)
    await s.extract(z.object({ loggedIn: z.boolean() }));
    await s.navigate('https://www.netflix.com/cancelplan');
    await s.act('Click the Finish Cancellation button');
    await s.screenshot();

    const result = await confirmCancellation(
      s,
      'Confirm the cancellation by clicking Yes.',
      '.confirmation-banner',
    );
    expect(result.ok).toBe(true);
  });

  it('confirmCancellation threads the successSelector into the extract instruction', async () => {
    // Spy adapter records the extract instruction so we can prove the merchant's
    // successSelector actually reaches the extractor (Fix 1: unanchored success).
    const extractCalls: Array<string | undefined> = [];
    setBrowserAdapterFactory(async () => ({
      navigate: async () => undefined,
      act: async () => undefined,
      extract: async (_schema: unknown, instruction?: string) => {
        extractCalls.push(instruction);
        return { found: true } as never;
      },
      observe: async () => ({ html: '', url: '' }),
      screenshot: async () => ({ url: 'https://x/s.png', pngBytes: 1 }),
      close: async () => undefined,
    }));
    const s = await createSession('u1');
    const result = await confirmCancellation(
      s,
      'Confirm the cancellation.',
      '[data-uia="cancellation-confirmation"]',
    );
    expect(result.ok).toBe(true);
    expect(extractCalls).toHaveLength(1);
    expect(extractCalls[0]).toContain('[data-uia="cancellation-confirmation"]');
  });

  it('loginAndNavigate returns ok:false when login is not confirmed', async () => {
    // Fix 3: a failed login must NOT silently report ok:true. The verify extract
    // returns loggedIn:false (e.g. still on the login form / 2FA wall).
    setBrowserAdapterFactory(async () =>
      makeFakeAdapter({
        name: 'login-fail',
        entries: [
          { kind: 'navigate' },
          { kind: 'act', match: 'Enter username' },
          { kind: 'screenshot', response: { screenshotUrl: 'https://x/login.png', pngBytes: 5 } },
          { kind: 'extract', response: { data: { loggedIn: false, reason: 'invalid credentials' } } },
        ],
      }),
    );
    const s = await createSession('u1');
    const login = await loginAndNavigate(s, 'https://x/login', {
      username: 'a@b.com',
      password: 'wrong',
    });
    expect(login.ok).toBe(false);
    expect(login.reason).toMatch(/login not confirmed/);
    expect(login.reason).toMatch(/invalid credentials/);
  });

  it('loginAndNavigate returns ok:true when login is confirmed', async () => {
    setBrowserAdapterFactory(async () =>
      makeFakeAdapter({
        name: 'login-ok',
        entries: [
          { kind: 'navigate' },
          { kind: 'act', match: 'Enter username' },
          { kind: 'screenshot', response: { screenshotUrl: 'https://x/login.png', pngBytes: 5 } },
          { kind: 'extract', response: { data: { loggedIn: true } } },
        ],
      }),
    );
    const s = await createSession('u1');
    const login = await loginAndNavigate(s, 'https://x/login', {
      username: 'a@b.com',
      password: 'pw',
    });
    expect(login.ok).toBe(true);
  });
});
