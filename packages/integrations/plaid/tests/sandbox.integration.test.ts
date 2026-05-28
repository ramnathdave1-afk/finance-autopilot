import { describe, it, expect } from 'vitest';
import { getPlaidClient, redactToken } from '../src/client';

// Skipped unless PLAID_CLIENT_ID + PLAID_SECRET + RUN_PLAID_SANDBOX=1.
// Real sandbox round-trip: link_token → public_token → exchange → accounts.
const RUN = process.env.RUN_PLAID_SANDBOX === '1';

(RUN ? describe : describe.skip)('plaid sandbox integration', () => {
  it('redactToken never reveals more than first 6 + last 2 chars', () => {
    expect(redactToken('access-sandbox-abcdef-xyz')).not.toContain('abcdef-xyz');
    expect(redactToken('access-sandbox-abcdef-xyz').endsWith('yz')).toBe(true);
  });

  it('creates a link_token in sandbox', async () => {
    const plaid = getPlaidClient();
    const res = await plaid.linkTokenCreate({
      user: { client_user_id: 'test-user' },
      client_name: 'Pilot Test',
      products: ['transactions'] as never,
      country_codes: ['US'] as never,
      language: 'en',
    });
    expect(res.data.link_token).toMatch(/^link-sandbox-/);
  });

  it('exchanges a sandbox public_token and fetches accounts', async () => {
    const plaid = getPlaidClient();
    const pt = await plaid.sandboxPublicTokenCreate({
      institution_id: 'ins_109508',
      initial_products: ['transactions'] as never,
    });
    const ex = await plaid.itemPublicTokenExchange({ public_token: pt.data.public_token });
    expect(ex.data.access_token).toMatch(/^access-sandbox-/);
    const accts = await plaid.accountsGet({ access_token: ex.data.access_token });
    expect(accts.data.accounts.length).toBeGreaterThan(0);
  });
});
