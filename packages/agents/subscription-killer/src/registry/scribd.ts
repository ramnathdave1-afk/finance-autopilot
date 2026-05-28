import type { MerchantCancelSpec } from './types';

export const scribd: MerchantCancelSpec = {
  merchantKey: 'scribd',
  displayName: 'Scribd (Everand)',
  cancelMethod: 'web',
  loginUrl: 'https://www.scribd.com/login',
  billingUrl: 'https://www.scribd.com/account-settings/membership',
  steps: [
    { action: 'navigate', target: 'https://www.scribd.com/login' },
    { action: 'type', target: 'input[name="email"]', value: '{{username}}' },
    { action: 'type', target: 'input[name="password"]', value: '{{password}}' },
    { action: 'click', target: 'button[type="submit"]' },
    { action: 'navigate', target: 'https://www.scribd.com/account-settings/membership' },
    { action: 'click', target: 'button[data-testid="cancel-membership"]' },
    { action: 'click', target: 'button[data-testid="confirm-cancel"]' },
    { action: 'verify', target: '[data-testid="membership-cancelled"]' },
  ],
  successSelector: '[data-testid="membership-cancelled"]',
  monthlyAmountEstimate: 11.99,
};
