import type { MerchantCancelSpec } from './types';

export const duolingoPlus: MerchantCancelSpec = {
  merchantKey: 'duolingo_plus',
  displayName: 'Duolingo Super',
  cancelMethod: 'web',
  loginUrl: 'https://www.duolingo.com/log-in',
  billingUrl: 'https://www.duolingo.com/settings/subscription',
  steps: [
    { action: 'navigate', target: 'https://www.duolingo.com/log-in' },
    { action: 'type', target: 'input[name="email"]', value: '{{username}}' },
    { action: 'type', target: 'input[name="password"]', value: '{{password}}' },
    { action: 'click', target: 'button[data-test="register-button"]' },
    { action: 'navigate', target: 'https://www.duolingo.com/settings/subscription' },
    { action: 'click', target: 'button[data-test="cancel-subscription"]' },
    { action: 'click', target: 'button[data-test="confirm-cancel"]' },
    { action: 'verify', target: '[data-test="subscription-cancelled"]' },
  ],
  successSelector: '[data-test="subscription-cancelled"]',
  monthlyAmountEstimate: 12.99,
};
