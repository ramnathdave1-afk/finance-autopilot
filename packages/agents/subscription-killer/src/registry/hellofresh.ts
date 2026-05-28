import type { MerchantCancelSpec } from './types';

export const hellofresh: MerchantCancelSpec = {
  merchantKey: 'hellofresh',
  displayName: 'HelloFresh',
  cancelMethod: 'web',
  loginUrl: 'https://www.hellofresh.com/login',
  billingUrl: 'https://www.hellofresh.com/account/subscription',
  steps: [
    { action: 'navigate', target: 'https://www.hellofresh.com/login' },
    { action: 'type', target: 'input[name="email"]', value: '{{username}}' },
    { action: 'type', target: 'input[name="password"]', value: '{{password}}' },
    { action: 'click', target: 'button[type="submit"]' },
    { action: 'navigate', target: 'https://www.hellofresh.com/account/subscription' },
    { action: 'click', target: 'button[data-testid="cancel-subscription"]' },
    { action: 'click', target: 'button[data-testid="confirm-cancellation"]' },
    { action: 'verify', target: '[data-testid="subscription-cancelled"]' },
  ],
  successSelector: '[data-testid="subscription-cancelled"]',
  monthlyAmountEstimate: 64.95,
};
