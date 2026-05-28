import type { MerchantCancelSpec } from './types';

export const lifetimeFitness: MerchantCancelSpec = {
  merchantKey: 'lifetime_fitness',
  displayName: 'Life Time Fitness',
  cancelMethod: 'web',
  loginUrl: 'https://my.lifetime.life/login.html',
  billingUrl: 'https://my.lifetime.life/account/membership.html',
  steps: [
    { action: 'navigate', target: 'https://my.lifetime.life/login.html' },
    { action: 'type', target: 'input#username', value: '{{username}}' },
    { action: 'type', target: 'input#password', value: '{{password}}' },
    { action: 'click', target: 'button[type="submit"]' },
    { action: 'navigate', target: 'https://my.lifetime.life/account/membership.html' },
    { action: 'click', target: 'a[data-test="cancel-membership-link"]' },
    { action: 'verify', target: '[data-test="cancellation-request-submitted"]' },
  ],
  successSelector: '[data-test="cancellation-request-submitted"]',
  monthlyAmountEstimate: 199.0,
};
