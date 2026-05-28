import type { MerchantCancelSpec } from './types';

export const uberOne: MerchantCancelSpec = {
  merchantKey: 'uber_one',
  displayName: 'Uber One',
  cancelMethod: 'web',
  loginUrl: 'https://auth.uber.com/login',
  billingUrl: 'https://www.uber.com/account/uber-one',
  steps: [
    { action: 'navigate', target: 'https://auth.uber.com/login' },
    { action: 'type', target: 'input[name="email"]', value: '{{username}}' },
    { action: 'type', target: 'input[name="password"]', value: '{{password}}' },
    { action: 'click', target: 'button[type="submit"]' },
    { action: 'navigate', target: 'https://www.uber.com/account/uber-one' },
    { action: 'click', target: 'button[data-testid="manage-membership"]' },
    { action: 'click', target: 'button[data-testid="end-membership"]' },
    { action: 'click', target: 'button[data-testid="confirm-end-membership"]' },
    { action: 'verify', target: '[data-testid="membership-ended"]' },
  ],
  successSelector: '[data-testid="membership-ended"]',
  monthlyAmountEstimate: 9.99,
};
