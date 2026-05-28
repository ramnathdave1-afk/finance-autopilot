import type { MerchantCancelSpec } from './types';

export const peloton: MerchantCancelSpec = {
  merchantKey: 'peloton',
  displayName: 'Peloton',
  cancelMethod: 'web',
  loginUrl: 'https://www.onepeloton.com/login',
  billingUrl: 'https://www.onepeloton.com/preferences/subscriptions',
  steps: [
    { action: 'navigate', target: 'https://www.onepeloton.com/login' },
    { action: 'type', target: 'input[name="usernameOrEmail"]', value: '{{username}}' },
    { action: 'type', target: 'input[name="password"]', value: '{{password}}' },
    { action: 'click', target: 'button[type="submit"]' },
    { action: 'navigate', target: 'https://www.onepeloton.com/preferences/subscriptions' },
    { action: 'click', target: 'button[data-test-id="cancel-subscription"]' },
    { action: 'click', target: 'button[data-test-id="confirm-cancel"]' },
    { action: 'verify', target: '[data-test-id="subscription-cancelled"]' },
  ],
  successSelector: '[data-test-id="subscription-cancelled"]',
  monthlyAmountEstimate: 24.0,
};
