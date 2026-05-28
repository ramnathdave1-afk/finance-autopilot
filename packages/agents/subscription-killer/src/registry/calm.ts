import type { MerchantCancelSpec } from './types';

export const calm: MerchantCancelSpec = {
  merchantKey: 'calm',
  displayName: 'Calm',
  cancelMethod: 'web',
  loginUrl: 'https://www.calm.com/login',
  billingUrl: 'https://www.calm.com/profile/subscription',
  steps: [
    { action: 'navigate', target: 'https://www.calm.com/login' },
    { action: 'type', target: 'input[name="email"]', value: '{{username}}' },
    { action: 'type', target: 'input[name="password"]', value: '{{password}}' },
    { action: 'click', target: 'button[type="submit"]' },
    { action: 'navigate', target: 'https://www.calm.com/profile/subscription' },
    { action: 'click', target: 'button[data-testid="cancel-subscription"]' },
    { action: 'click', target: 'button[data-testid="confirm-cancellation"]' },
    { action: 'verify', target: '[data-testid="subscription-cancelled"]' },
  ],
  successSelector: '[data-testid="subscription-cancelled"]',
  monthlyAmountEstimate: 14.99,
};
