import type { MerchantCancelSpec } from './types';

export const linkedinPremium: MerchantCancelSpec = {
  merchantKey: 'linkedin_premium',
  displayName: 'LinkedIn Premium',
  cancelMethod: 'web',
  loginUrl: 'https://www.linkedin.com/login',
  billingUrl: 'https://www.linkedin.com/premium/manage/',
  steps: [
    { action: 'navigate', target: 'https://www.linkedin.com/login' },
    { action: 'type', target: 'input#username', value: '{{username}}' },
    { action: 'type', target: 'input#password', value: '{{password}}' },
    { action: 'click', target: 'button[type="submit"]' },
    { action: 'navigate', target: 'https://www.linkedin.com/premium/manage/' },
    { action: 'click', target: 'button[data-test="cancel-subscription-button"]' },
    { action: 'click', target: 'button[data-test="confirm-cancel-button"]' },
    { action: 'verify', target: '[data-test="cancellation-confirmation"]' },
  ],
  successSelector: '[data-test="cancellation-confirmation"]',
  monthlyAmountEstimate: 39.99,
};
