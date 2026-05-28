import type { MerchantCancelSpec } from './types';

export const amazonPrime: MerchantCancelSpec = {
  merchantKey: 'amazon_prime',
  displayName: 'Amazon Prime',
  cancelMethod: 'web',
  loginUrl: 'https://www.amazon.com/ap/signin',
  billingUrl: 'https://www.amazon.com/gp/primecentral',
  steps: [
    { action: 'navigate', target: 'https://www.amazon.com/ap/signin' },
    { action: 'type', target: 'input[name="email"]', value: '{{username}}' },
    { action: 'type', target: 'input[name="password"]', value: '{{password}}' },
    { action: 'click', target: 'input#signInSubmit' },
    { action: 'navigate', target: 'https://www.amazon.com/gp/primecentral' },
    { action: 'click', target: 'a[data-testid="end-membership-link"]' },
    { action: 'click', target: 'button[data-testid="confirm-end-membership"]' },
    { action: 'verify', target: '[data-testid="membership-ended-confirmation"]' },
  ],
  successSelector: '[data-testid="membership-ended-confirmation"]',
  monthlyAmountEstimate: 14.99,
};
