import type { MerchantCancelSpec } from './types';

export const googleOne: MerchantCancelSpec = {
  merchantKey: 'google_one',
  displayName: 'Google One',
  cancelMethod: 'web',
  loginUrl: 'https://accounts.google.com/ServiceLogin',
  billingUrl: 'https://one.google.com/u/0/storage/management',
  steps: [
    { action: 'navigate', target: 'https://accounts.google.com/ServiceLogin' },
    { action: 'type', target: 'input[type="email"]', value: '{{username}}' },
    { action: 'type', target: 'input[type="password"]', value: '{{password}}' },
    { action: 'click', target: 'button#identifierNext' },
    { action: 'navigate', target: 'https://one.google.com/u/0/storage/management' },
    { action: 'click', target: 'button[aria-label="Cancel subscription"]' },
    { action: 'click', target: 'button[data-testid="confirm-cancel"]' },
    { action: 'verify', target: '[data-testid="membership-cancelled"]' },
  ],
  successSelector: '[data-testid="membership-cancelled"]',
  monthlyAmountEstimate: 1.99,
};
