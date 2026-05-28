import type { MerchantCancelSpec } from './types';

export const tinder: MerchantCancelSpec = {
  merchantKey: 'tinder',
  displayName: 'Tinder',
  cancelMethod: 'web',
  loginUrl: 'https://tinder.com/app/login',
  billingUrl: 'https://account.tinder.com/subscription',
  steps: [
    { action: 'navigate', target: 'https://tinder.com/app/login' },
    { action: 'type', target: 'input[name="email"]', value: '{{username}}' },
    { action: 'type', target: 'input[name="password"]', value: '{{password}}' },
    { action: 'click', target: 'button[type="submit"]' },
    { action: 'navigate', target: 'https://account.tinder.com/subscription' },
    { action: 'click', target: 'button[data-testid="cancel-subscription"]' },
    { action: 'click', target: 'button[data-testid="confirm-cancellation"]' },
    { action: 'verify', target: '[data-testid="subscription-cancelled"]' },
  ],
  successSelector: '[data-testid="subscription-cancelled"]',
  monthlyAmountEstimate: 29.99,
};
