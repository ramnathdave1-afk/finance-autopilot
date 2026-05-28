import { afterEach, describe, expect, it } from 'vitest';
import { oneClickCancel } from '../src/cancel';
import { setAdapter, _resetAdapter } from '../src/adapter';
import { setDbPort, _resetDbPort } from '../src/db-port';
import { MockAdapter, makeMockDb, makeUser } from './_helpers';

afterEach(() => {
  _resetAdapter();
  _resetDbPort();
});

describe('oneClickCancel', () => {
  it('cancels at period end and returns no retention prompts', async () => {
    const adapter = new MockAdapter();
    setAdapter(adapter);
    const user = makeUser({
      id: 'u1',
      pricing_tier: 'autopilot',
      stripe_customer_id: 'cus_1',
      stripe_subscription_id: 'sub_1',
      subscription_status: 'active',
    });
    const { db, state } = makeMockDb({ users: new Map([['u1', user]]) });
    setDbPort(db);

    const res = await oneClickCancel('u1');

    // Anti-Cleo positioning: the response shape MUST carry no retention
    // prompts at all. This test fails if anyone ever adds them.
    expect(res.retentionPrompts).toEqual([]);
    expect(res.retentionPrompts.length).toBe(0);
    expect(res.cancelled).toBe(true);
    expect(res.subscriptionId).toBe('sub_1');
    expect(typeof res.effectiveAt).toBe('number');

    // The adapter was called with the subscription id — single call, no loops,
    // no "win-back offer" calls.
    expect(adapter.cancelSubscriptionAtPeriodEnd).toHaveBeenCalledOnce();
    expect(adapter.cancelSubscriptionAtPeriodEnd).toHaveBeenCalledWith('sub_1');

    // Tier is NOT downgraded immediately — user keeps access until period end.
    expect(state.users.get('u1')!.pricing_tier).toBe('autopilot');
    expect(state.users.get('u1')!.subscription_status).toBe('cancelled');
  });

  it('throws when user has no active subscription', async () => {
    setAdapter(new MockAdapter());
    const user = makeUser({ id: 'u1', stripe_subscription_id: null });
    const { db } = makeMockDb({ users: new Map([['u1', user]]) });
    setDbPort(db);
    await expect(oneClickCancel('u1')).rejects.toThrow(/no active subscription/);
  });
});
