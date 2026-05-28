import type { MerchantCancelSpec } from './types';

export const crunchyroll: MerchantCancelSpec = {
  merchantKey: 'crunchyroll',
  displayName: 'Crunchyroll',
  cancelMethod: 'web',
  loginUrl: 'https://sso.crunchyroll.com/login',
  billingUrl: 'https://www.crunchyroll.com/account/membership',
  steps: [
    { action: 'navigate', target: 'https://sso.crunchyroll.com/login' },
    { action: 'type', target: 'input[name="email"]', value: '{{username}}' },
    { action: 'type', target: 'input[name="password"]', value: '{{password}}' },
    { action: 'click', target: 'button[type="submit"]' },
    { action: 'navigate', target: 'https://www.crunchyroll.com/account/membership' },
    { action: 'click', target: 'a[data-t="cancel-membership-link"]' },
    { action: 'click', target: 'button[data-t="confirm-cancel"]' },
    { action: 'verify', target: '[data-t="cancellation-complete"]' },
  ],
  successSelector: '[data-t="cancellation-complete"]',
  monthlyAmountEstimate: 7.99,
};
