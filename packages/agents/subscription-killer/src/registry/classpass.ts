import type { MerchantCancelSpec } from './types';

export const classpass: MerchantCancelSpec = {
  merchantKey: 'classpass',
  displayName: 'ClassPass',
  cancelMethod: 'web',
  loginUrl: 'https://classpass.com/login',
  billingUrl: 'https://classpass.com/account/membership',
  steps: [
    { action: 'navigate', target: 'https://classpass.com/login' },
    { action: 'type', target: 'input[name="email"]', value: '{{username}}' },
    { action: 'type', target: 'input[name="password"]', value: '{{password}}' },
    { action: 'click', target: 'button[type="submit"]' },
    { action: 'navigate', target: 'https://classpass.com/account/membership' },
    { action: 'click', target: 'button[data-testid="cancel-membership"]' },
    { action: 'click', target: 'button[data-testid="confirm-cancellation"]' },
    { action: 'verify', target: '[data-testid="membership-cancelled"]' },
  ],
  successSelector: '[data-testid="membership-cancelled"]',
  monthlyAmountEstimate: 49.0,
};
