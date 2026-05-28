import { afterEach, describe, expect, it } from 'vitest';
import { issueFailureRefund } from '../src/refund';
import { setAdapter, _resetAdapter } from '../src/adapter';
import { setDbPort, _resetDbPort } from '../src/db-port';
import { MockAdapter, makeMockDb, makeUser } from './_helpers';
import type { AgentActionLite } from '../src/db-port';

afterEach(() => {
  _resetAdapter();
  _resetDbPort();
});

function action(over: Partial<AgentActionLite> = {}): AgentActionLite {
  return {
    id: 'a1',
    user_id: 'u1',
    status: 'failed',
    refund_eligible: true,
    stripe_charge_id: 'ch_1',
    ...over,
  };
}

describe('issueFailureRefund', () => {
  it('issues a pro-rated refund on a failed eligible action', async () => {
    const adapter = new MockAdapter();
    setAdapter(adapter);
    const user = makeUser({
      id: 'u1',
      pricing_tier: 'autopilot',
      subscription_status: 'active',
    });
    const { db } = makeMockDb({
      users: new Map([['u1', user]]),
      actions: new Map([['a1', action()]]),
    });
    setDbPort(db);
    // Mid-month: 2026-05-15 (UTC). 31 days in May, 17 days remaining (incl today).
    const res = await issueFailureRefund('a1', { now: new Date(Date.UTC(2026, 4, 15)) });
    expect(res.reason).toBe('issued');
    expect(res.refundId).toBeDefined();
    expect(res.amountCents).toBe(Math.ceil((17 / 31) * 1999));
    expect(adapter.refund).toHaveBeenCalledOnce();
    expect(adapter.refund.mock.calls[0]![0].idempotencyKey).toBe('refund:action:a1');
  });

  it('is idempotent — second call returns already_processed without hitting Stripe', async () => {
    const adapter = new MockAdapter();
    setAdapter(adapter);
    const user = makeUser({
      id: 'u1',
      pricing_tier: 'autopilot',
      subscription_status: 'active',
    });
    const { db } = makeMockDb({
      users: new Map([['u1', user]]),
      actions: new Map([['a1', action()]]),
    });
    setDbPort(db);
    await issueFailureRefund('a1', { now: new Date(Date.UTC(2026, 4, 15)) });
    const second = await issueFailureRefund('a1', { now: new Date(Date.UTC(2026, 4, 15)) });
    expect(second.reason).toBe('already_processed');
    expect(adapter.refund).toHaveBeenCalledTimes(1);
  });

  it('skips when action is not failed', async () => {
    setAdapter(new MockAdapter());
    const user = makeUser({
      id: 'u1',
      pricing_tier: 'autopilot',
      subscription_status: 'active',
    });
    const { db } = makeMockDb({
      users: new Map([['u1', user]]),
      actions: new Map([['a1', action({ status: 'succeeded' })]]),
    });
    setDbPort(db);
    const res = await issueFailureRefund('a1');
    expect(res.reason).toBe('action_not_failed');
  });

  it('skips when refund_eligible is false', async () => {
    setAdapter(new MockAdapter());
    const user = makeUser({
      id: 'u1',
      pricing_tier: 'autopilot',
      subscription_status: 'active',
    });
    const { db } = makeMockDb({
      users: new Map([['u1', user]]),
      actions: new Map([['a1', action({ refund_eligible: false })]]),
    });
    setDbPort(db);
    const res = await issueFailureRefund('a1');
    expect(res.reason).toBe('not_refund_eligible');
  });

  it('skips when subscription is not active', async () => {
    setAdapter(new MockAdapter());
    const user = makeUser({
      id: 'u1',
      pricing_tier: 'autopilot',
      subscription_status: 'cancelled',
    });
    const { db } = makeMockDb({
      users: new Map([['u1', user]]),
      actions: new Map([['a1', action()]]),
    });
    setDbPort(db);
    const res = await issueFailureRefund('a1');
    expect(res.reason).toBe('no_active_subscription');
  });

  it('skips when no charge id is recorded', async () => {
    setAdapter(new MockAdapter());
    const user = makeUser({
      id: 'u1',
      pricing_tier: 'autopilot',
      subscription_status: 'active',
    });
    const { db } = makeMockDb({
      users: new Map([['u1', user]]),
      actions: new Map([['a1', action({ stripe_charge_id: null })]]),
    });
    setDbPort(db);
    const res = await issueFailureRefund('a1');
    expect(res.reason).toBe('no_charge_id');
  });
});
