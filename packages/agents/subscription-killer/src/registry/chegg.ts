import type { MerchantCancelSpec } from './types';

export const chegg: MerchantCancelSpec = {
  merchantKey: 'chegg',
  displayName: 'Chegg Study',
  cancelMethod: 'web',
  loginUrl: 'https://www.chegg.com/auth',
  billingUrl: 'https://www.chegg.com/my/orders/subscriptions',
  steps: [
    { action: 'navigate', target: 'https://www.chegg.com/auth' },
    { action: 'type', target: 'input[name="email"]', value: '{{username}}' },
    { action: 'type', target: 'input[name="password"]', value: '{{password}}' },
    { action: 'click', target: 'button[type="submit"]' },
    { action: 'navigate', target: 'https://www.chegg.com/my/orders/subscriptions' },
    { action: 'click', target: 'button[data-testid="cancel-subscription"]' },
    { action: 'click', target: 'button[data-testid="confirm-cancellation"]' },
    { action: 'verify', target: '[data-testid="subscription-cancelled"]' },
  ],
  successSelector: '[data-testid="subscription-cancelled"]',
  monthlyAmountEstimate: 15.95,
};
