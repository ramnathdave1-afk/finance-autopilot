import type { MerchantCancelSpec } from './types';

export const espnPlus: MerchantCancelSpec = {
  merchantKey: 'espn_plus',
  displayName: 'ESPN+',
  cancelMethod: 'web',
  loginUrl: 'https://plus.espn.com/login',
  billingUrl: 'https://plus.espn.com/account/subscription',
  steps: [
    { action: 'navigate', target: 'https://plus.espn.com/login' },
    { action: 'type', target: 'input[name="email"]', value: '{{username}}' },
    { action: 'type', target: 'input[name="password"]', value: '{{password}}' },
    { action: 'click', target: 'button[data-testid="login-submit"]' },
    { action: 'navigate', target: 'https://plus.espn.com/account/subscription' },
    { action: 'click', target: 'button[data-testid="cancel-subscription"]' },
    { action: 'click', target: 'button[data-testid="confirm-cancellation"]' },
    { action: 'verify', target: '[data-testid="subscription-cancelled"]' },
  ],
  successSelector: '[data-testid="subscription-cancelled"]',
  monthlyAmountEstimate: 11.99,
};
