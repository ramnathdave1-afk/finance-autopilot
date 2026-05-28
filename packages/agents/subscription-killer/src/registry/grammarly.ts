import type { MerchantCancelSpec } from './types';

export const grammarly: MerchantCancelSpec = {
  merchantKey: 'grammarly',
  displayName: 'Grammarly Premium',
  cancelMethod: 'web',
  loginUrl: 'https://www.grammarly.com/signin',
  billingUrl: 'https://account.grammarly.com/subscription',
  steps: [
    { action: 'navigate', target: 'https://www.grammarly.com/signin' },
    { action: 'type', target: 'input[name="email"]', value: '{{username}}' },
    { action: 'type', target: 'input[name="password"]', value: '{{password}}' },
    { action: 'click', target: 'button[data-testid="signin-button"]' },
    { action: 'navigate', target: 'https://account.grammarly.com/subscription' },
    { action: 'click', target: 'button[data-testid="cancel-subscription"]' },
    { action: 'click', target: 'button[data-testid="confirm-cancellation"]' },
    { action: 'verify', target: '[data-testid="subscription-cancelled"]' },
  ],
  successSelector: '[data-testid="subscription-cancelled"]',
  monthlyAmountEstimate: 12.0,
};
