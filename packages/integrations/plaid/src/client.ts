import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';

let cached: PlaidApi | null = null;

export function getPlaidClient(): PlaidApi {
  if (cached) return cached;
  const clientId = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;
  const env = (process.env.PLAID_ENV ?? 'sandbox') as keyof typeof PlaidEnvironments;
  if (!clientId || !secret) {
    throw new Error('PLAID_CLIENT_ID and PLAID_SECRET are required');
  }
  cached = new PlaidApi(
    new Configuration({
      basePath: PlaidEnvironments[env] ?? PlaidEnvironments.sandbox,
      baseOptions: {
        headers: {
          'PLAID-CLIENT-ID': clientId,
          'PLAID-SECRET': secret,
          'Plaid-Version': '2020-09-14',
        },
      },
    }),
  );
  return cached;
}

/** Redact an access token so it never lands in logs. */
export function redactToken(token: string): string {
  if (!token) return '';
  if (token.length <= 8) return '***';
  return `${token.slice(0, 6)}…${token.slice(-2)}`;
}
