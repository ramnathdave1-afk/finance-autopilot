import { afterEach, describe, expect, it } from 'vitest';
import { enforceTier, PermissionError } from '../src/tier-enforcement';
import { setDbPort, _resetDbPort } from '../src/db-port';
import { makeMockDb, makeUser } from './_helpers';

afterEach(() => _resetDbPort());

describe('enforceTier', () => {
  it('allows autopilot user to run auto_saver', async () => {
    const user = makeUser({ id: 'u1', pricing_tier: 'autopilot' });
    const { db } = makeMockDb({ users: new Map([['u1', user]]) });
    setDbPort(db);
    const res = await enforceTier('u1', 'auto_saver');
    expect(res.allowed).toBe(true);
    expect(res.tier).toBe('autopilot');
  });

  it('throws tier_locked when free user requests auto_saver', async () => {
    const user = makeUser({ id: 'u1', pricing_tier: 'free' });
    const { db } = makeMockDb({ users: new Map([['u1', user]]) });
    setDbPort(db);
    await expect(enforceTier('u1', 'auto_saver')).rejects.toMatchObject({
      name: 'PermissionError',
      code: 'tier_locked',
    });
  });

  it('allows free user to run spending_coach within monthly quota', async () => {
    const user = makeUser({ id: 'u1', pricing_tier: 'free' });
    const { db } = makeMockDb({
      users: new Map([['u1', user]]),
      actionCounts: new Map([['u1', 0]]),
    });
    setDbPort(db);
    const res = await enforceTier('u1', 'spending_coach');
    expect(res.allowed).toBe(true);
    expect(res.freeQuotaRemaining).toBe(1);
  });

  it('throws free_quota_exhausted when free user is at cap', async () => {
    const user = makeUser({ id: 'u1', pricing_tier: 'free' });
    const { db } = makeMockDb({
      users: new Map([['u1', user]]),
      actionCounts: new Map([['u1', 1]]),
    });
    setDbPort(db);
    await expect(enforceTier('u1', 'spending_coach')).rejects.toMatchObject({
      name: 'PermissionError',
      code: 'free_quota_exhausted',
    });
  });

  it('throws no_user when user missing', async () => {
    const { db } = makeMockDb();
    setDbPort(db);
    const err = await enforceTier('nope', 'daily_brief').catch((e) => e);
    expect(err).toBeInstanceOf(PermissionError);
    expect(err.code).toBe('no_user');
  });
});
