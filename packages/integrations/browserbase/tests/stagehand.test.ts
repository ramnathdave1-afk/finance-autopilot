import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import {
  createSession,
  setBrowserAdapterFactory,
  resetBrowserAdapterFactory,
} from '../src/session';
import { loginAndNavigate, clickCancelFlow, confirmCancellation } from '../src/stagehand';
import { replayFromHar } from '../src/test-harness';

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
});
