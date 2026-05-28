import type { MerchantCancelSpec } from './types';

export const paramountPlus: MerchantCancelSpec = {
  merchantKey: 'paramount_plus',
  displayName: 'Paramount+',
  cancelMethod: 'web',
  loginUrl: 'https://www.paramountplus.com/account/signin/',
  billingUrl: 'https://www.paramountplus.com/account/',
  steps: [
    { action: 'navigate', target: 'https://www.paramountplus.com/account/signin/' },
    { action: 'type', target: 'input[name="email"]', value: '{{username}}' },
    { action: 'type', target: 'input[name="password"]', value: '{{password}}' },
    { action: 'click', target: 'button[data-ci="signin-button"]' },
    { action: 'navigate', target: 'https://www.paramountplus.com/account/' },
    { action: 'click', target: 'button[data-ci="cancel-subscription"]' },
    { action: 'click', target: 'button[data-ci="confirm-cancel"]' },
    { action: 'verify', target: '[data-ci="cancellation-confirmation"]' },
  ],
  successSelector: '[data-ci="cancellation-confirmation"]',
  monthlyAmountEstimate: 12.99,
};
