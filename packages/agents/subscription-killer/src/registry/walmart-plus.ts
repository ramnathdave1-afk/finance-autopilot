import type { MerchantCancelSpec } from './types';

export const walmartPlus: MerchantCancelSpec = {
  merchantKey: 'walmart_plus',
  displayName: 'Walmart+',
  cancelMethod: 'web',
  loginUrl: 'https://www.walmart.com/account/login',
  billingUrl: 'https://www.walmart.com/account/plus',
  steps: [
    { action: 'navigate', target: 'https://www.walmart.com/account/login' },
    { action: 'type', target: 'input[name="email"]', value: '{{username}}' },
    { action: 'type', target: 'input[name="password"]', value: '{{password}}' },
    { action: 'click', target: 'button[type="submit"]' },
    { action: 'navigate', target: 'https://www.walmart.com/account/plus' },
    { action: 'click', target: 'button[data-testid="cancel-membership"]' },
    { action: 'click', target: 'button[data-testid="confirm-cancellation"]' },
    { action: 'verify', target: '[data-testid="membership-cancelled"]' },
  ],
  successSelector: '[data-testid="membership-cancelled"]',
  monthlyAmountEstimate: 12.95,
};
