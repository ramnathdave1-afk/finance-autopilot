import type { MerchantCancelSpec } from './types';

export const peacock: MerchantCancelSpec = {
  merchantKey: 'peacock',
  displayName: 'Peacock',
  cancelMethod: 'web',
  loginUrl: 'https://www.peacocktv.com/signin',
  billingUrl: 'https://www.peacocktv.com/account/plans',
  steps: [
    { action: 'navigate', target: 'https://www.peacocktv.com/signin' },
    { action: 'type', target: 'input[name="email"]', value: '{{username}}' },
    { action: 'type', target: 'input[name="password"]', value: '{{password}}' },
    { action: 'click', target: 'button[data-testid="signin-submit"]' },
    { action: 'navigate', target: 'https://www.peacocktv.com/account/plans' },
    { action: 'click', target: 'button[data-testid="cancel-plan"]' },
    { action: 'click', target: 'button[data-testid="confirm-cancel-plan"]' },
    { action: 'verify', target: '[data-testid="plan-cancelled"]' },
  ],
  successSelector: '[data-testid="plan-cancelled"]',
  monthlyAmountEstimate: 7.99,
};
