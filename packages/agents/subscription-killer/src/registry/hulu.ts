import type { MerchantCancelSpec } from './types';

export const hulu: MerchantCancelSpec = {
  merchantKey: 'hulu',
  displayName: 'Hulu',
  cancelMethod: 'web',
  loginUrl: 'https://auth.hulu.com/web/login',
  billingUrl: 'https://secure.hulu.com/account',
  steps: [
    { action: 'navigate', target: 'https://auth.hulu.com/web/login' },
    { action: 'type', target: 'input[name="email"]', value: '{{username}}' },
    { action: 'type', target: 'input[name="password"]', value: '{{password}}' },
    { action: 'click', target: 'button[data-automationid="login-button"]' },
    { action: 'navigate', target: 'https://secure.hulu.com/account' },
    { action: 'click', target: 'a[data-automationid="cancel-subscription"]' },
    { action: 'click', target: 'button[data-automationid="continue-to-cancel"]' },
    { action: 'click', target: 'button[data-automationid="confirm-cancel"]' },
    { action: 'verify', target: '[data-automationid="cancellation-confirmed"]' },
  ],
  successSelector: '[data-automationid="cancellation-confirmed"]',
  monthlyAmountEstimate: 17.99,
};
