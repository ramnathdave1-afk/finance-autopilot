import type { MerchantCancelSpec } from './types';

export const hboMax: MerchantCancelSpec = {
  merchantKey: 'hbo_max',
  displayName: 'Max (HBO)',
  cancelMethod: 'web',
  loginUrl: 'https://auth.max.com/login',
  billingUrl: 'https://auth.max.com/account/subscription',
  steps: [
    { action: 'navigate', target: 'https://auth.max.com/login' },
    { action: 'type', target: 'input[name="email"]', value: '{{username}}' },
    { action: 'type', target: 'input[name="password"]', value: '{{password}}' },
    { action: 'click', target: 'button[type="submit"]' },
    { action: 'navigate', target: 'https://auth.max.com/account/subscription' },
    { action: 'click', target: 'button[data-testid="manage-subscription"]' },
    { action: 'click', target: 'button[data-testid="cancel-subscription"]' },
    { action: 'click', target: 'button[data-testid="confirm-cancellation"]' },
    { action: 'verify', target: '[data-testid="cancellation-success"]' },
  ],
  successSelector: '[data-testid="cancellation-success"]',
  monthlyAmountEstimate: 15.99,
};
