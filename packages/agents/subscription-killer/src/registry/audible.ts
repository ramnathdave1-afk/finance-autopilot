import type { MerchantCancelSpec } from './types';

export const audible: MerchantCancelSpec = {
  merchantKey: 'audible',
  displayName: 'Audible',
  cancelMethod: 'web',
  loginUrl: 'https://www.audible.com/sign-in',
  billingUrl: 'https://www.audible.com/account/membership',
  steps: [
    { action: 'navigate', target: 'https://www.audible.com/sign-in' },
    { action: 'type', target: 'input[name="email"]', value: '{{username}}' },
    { action: 'type', target: 'input[name="password"]', value: '{{password}}' },
    { action: 'click', target: 'input#signInSubmit' },
    { action: 'navigate', target: 'https://www.audible.com/account/membership' },
    { action: 'click', target: 'a[data-testid="cancel-membership-link"]' },
    { action: 'click', target: 'button[data-testid="confirm-cancel-membership"]' },
    { action: 'verify', target: '[data-testid="membership-cancelled"]' },
  ],
  successSelector: '[data-testid="membership-cancelled"]',
  monthlyAmountEstimate: 14.95,
};
