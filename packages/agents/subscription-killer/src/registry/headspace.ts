import type { MerchantCancelSpec } from './types';

export const headspace: MerchantCancelSpec = {
  merchantKey: 'headspace',
  displayName: 'Headspace',
  cancelMethod: 'web',
  loginUrl: 'https://www.headspace.com/login',
  billingUrl: 'https://www.headspace.com/subscription/manage',
  steps: [
    { action: 'navigate', target: 'https://www.headspace.com/login' },
    { action: 'type', target: 'input[name="email"]', value: '{{username}}' },
    { action: 'type', target: 'input[name="password"]', value: '{{password}}' },
    { action: 'click', target: 'button[type="submit"]' },
    { action: 'navigate', target: 'https://www.headspace.com/subscription/manage' },
    { action: 'click', target: 'button[data-testid="cancel-subscription"]' },
    { action: 'click', target: 'button[data-testid="confirm-cancellation"]' },
    { action: 'verify', target: '[data-testid="subscription-cancelled"]' },
  ],
  successSelector: '[data-testid="subscription-cancelled"]',
  monthlyAmountEstimate: 12.99,
};
