import { afterEach, describe, expect, it } from 'vitest';
import { handleWebhook } from '../src/webhook';
import { setAdapter, _resetAdapter } from '../src/adapter';
import { setDbPort, _resetDbPort } from '../src/db-port';
import { PRICE_TABLE } from '../src/products';
import { MockAdapter, makeMockDb, makeUser } from './_helpers';

afterEach(() => {
  _resetAdapter();
  _resetDbPort();
});

function event(type: string, id: string, object: Record<string, unknown>) {
  return JSON.stringify({ id, type, data: { object }, created: 1 });
}

describe('handleWebhook', () => {
  it('updates tier + status on customer.subscription.created', async () => {
    setAdapter(new MockAdapter());
    const user = makeUser({
      id: 'u1',
      stripe_customer_id: 'cus_1',
      subscription_status: 'inactive',
    });
    const { db, state } = makeMockDb({ users: new Map([['u1', user]]) });
    setDbPort(db);
    const body = event('customer.subscription.created', 'evt_1', {
      id: 'sub_1',
      customer: 'cus_1',
      status: 'active',
      items: {
        data: [{ price: { id: PRICE_TABLE.pro.monthly.stripePriceId } }],
      },
    });
    const res = await handleWebhook(body, 'sig', 'secret');
    expect(res.processed).toBe(true);
    expect(state.users.get('u1')!.pricing_tier).toBe('pro');
    expect(state.users.get('u1')!.subscription_status).toBe('active');
    expect(state.users.get('u1')!.stripe_subscription_id).toBe('sub_1');
  });

  it('downgrades to free on customer.subscription.deleted', async () => {
    setAdapter(new MockAdapter());
    const user = makeUser({
      id: 'u1',
      pricing_tier: 'pro',
      stripe_customer_id: 'cus_1',
      stripe_subscription_id: 'sub_1',
      subscription_status: 'active',
    });
    const { db, state } = makeMockDb({ users: new Map([['u1', user]]) });
    setDbPort(db);
    const body = event('customer.subscription.deleted', 'evt_del', {
      id: 'sub_1',
      customer: 'cus_1',
      status: 'canceled',
    });
    await handleWebhook(body, 'sig', 'secret');
    expect(state.users.get('u1')!.pricing_tier).toBe('free');
    expect(state.users.get('u1')!.subscription_status).toBe('cancelled');
    expect(state.users.get('u1')!.stripe_subscription_id).toBeNull();
  });

  it('flips to past_due on invoice.payment_failed', async () => {
    setAdapter(new MockAdapter());
    const user = makeUser({
      id: 'u1',
      pricing_tier: 'autopilot',
      stripe_customer_id: 'cus_1',
      subscription_status: 'active',
    });
    const { db, state } = makeMockDb({ users: new Map([['u1', user]]) });
    setDbPort(db);
    const body = event('invoice.payment_failed', 'evt_fail', {
      id: 'in_1',
      customer: 'cus_1',
      subscription: 'sub_1',
    });
    await handleWebhook(body, 'sig', 'secret');
    expect(state.users.get('u1')!.subscription_status).toBe('past_due');
  });

  it('flips back to active on invoice.payment_succeeded', async () => {
    setAdapter(new MockAdapter());
    const user = makeUser({
      id: 'u1',
      pricing_tier: 'autopilot',
      stripe_customer_id: 'cus_1',
      subscription_status: 'past_due',
    });
    const { db, state } = makeMockDb({ users: new Map([['u1', user]]) });
    setDbPort(db);
    const body = event('invoice.payment_succeeded', 'evt_ok', {
      id: 'in_2',
      customer: 'cus_1',
      subscription: 'sub_1',
    });
    await handleWebhook(body, 'sig', 'secret');
    expect(state.users.get('u1')!.subscription_status).toBe('active');
  });

  it('is idempotent on event.id', async () => {
    setAdapter(new MockAdapter());
    const user = makeUser({
      id: 'u1',
      stripe_customer_id: 'cus_1',
    });
    const { db } = makeMockDb({ users: new Map([['u1', user]]) });
    setDbPort(db);
    const body = event('customer.subscription.updated', 'evt_same', {
      id: 'sub_1',
      customer: 'cus_1',
      status: 'active',
      items: { data: [{ price: { id: PRICE_TABLE.autopilot.monthly.stripePriceId } }] },
    });
    const first = await handleWebhook(body, 'sig', 'secret');
    const second = await handleWebhook(body, 'sig', 'secret');
    expect(first.processed).toBe(true);
    expect(second.processed).toBe(false);
    expect(second.reason).toBe('duplicate');
  });

  it('throws when adapter signature verification fails', async () => {
    const adapter = new MockAdapter();
    adapter.constructWebhookEvent.mockImplementationOnce(() => {
      throw new Error('bad sig');
    });
    setAdapter(adapter);
    const { db } = makeMockDb();
    setDbPort(db);
    await expect(handleWebhook('{}', 'sig', 'secret')).rejects.toThrow(/bad sig/);
  });
});
