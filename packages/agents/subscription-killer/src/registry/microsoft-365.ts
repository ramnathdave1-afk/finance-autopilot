import type { MerchantCancelSpec } from './types';

export const microsoft365: MerchantCancelSpec = {
  merchantKey: 'microsoft_365',
  displayName: 'Microsoft 365',
  cancelMethod: 'web',
  loginUrl: 'https://login.live.com/',
  billingUrl: 'https://account.microsoft.com/services',
  steps: [
    { action: 'navigate', target: 'https://login.live.com/' },
    { action: 'type', target: 'input[name="loginfmt"]', value: '{{username}}' },
    { action: 'type', target: 'input[name="passwd"]', value: '{{password}}' },
    { action: 'click', target: 'button[type="submit"]' },
    { action: 'navigate', target: 'https://account.microsoft.com/services' },
    { action: 'click', target: 'button[data-bi-id="manage-subscription"]' },
    { action: 'click', target: 'button[data-bi-id="cancel-subscription"]' },
    { action: 'click', target: 'button[data-bi-id="confirm-cancel"]' },
    { action: 'verify', target: '[data-bi-id="cancellation-confirmed"]' },
  ],
  successSelector: '[data-bi-id="cancellation-confirmed"]',
  monthlyAmountEstimate: 9.99,
};
