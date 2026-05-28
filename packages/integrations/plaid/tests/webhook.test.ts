import { describe, it, expect } from 'vitest';
import { handlePlaidWebhook, verifyPlaidJwt } from '../src/webhook';

describe('handlePlaidWebhook', () => {
  it('ignores unknown webhook codes', async () => {
    const r = await handlePlaidWebhook({ webhook_type: 'AUTH', webhook_code: 'WHATEVER' });
    expect(r.handled).toBe(false);
    expect(r.action).toContain('ignored');
  });

  it('rejects malformed bodies', async () => {
    const r = await handlePlaidWebhook({ totally: 'wrong' });
    expect(r.handled).toBe(false);
    expect(r.action).toContain('invalid');
  });

  it('item error path requires an item_id', async () => {
    const r = await handlePlaidWebhook({ webhook_type: 'ITEM', webhook_code: 'ERROR' });
    expect(r.handled).toBe(false);
  });
});

describe('verifyPlaidJwt', () => {
  it('passes through outside production', async () => {
    delete process.env.PLAID_ENV;
    expect(await verifyPlaidJwt(null, '')).toBe(true);
  });

  it('fails-closed in production until wired up', async () => {
    process.env.PLAID_ENV = 'production';
    expect(await verifyPlaidJwt(null, '')).toBe(false);
    delete process.env.PLAID_ENV;
  });
});
