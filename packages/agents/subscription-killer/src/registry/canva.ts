import type { MerchantCancelSpec } from './types';

export const canva: MerchantCancelSpec = {
  merchantKey: 'canva',
  displayName: 'Canva Pro',
  cancelMethod: 'web',
  loginUrl: 'https://www.canva.com/login',
  billingUrl: 'https://www.canva.com/settings/billing-and-plans',
  steps: [
    { action: 'navigate', target: 'https://www.canva.com/login' },
    { action: 'type', target: 'input[name="email"]', value: '{{username}}' },
    { action: 'type', target: 'input[name="password"]', value: '{{password}}' },
    { action: 'click', target: 'button[type="submit"]' },
    { action: 'navigate', target: 'https://www.canva.com/settings/billing-and-plans' },
    { action: 'click', target: 'button[data-testid="cancel-subscription"]' },
    { action: 'click', target: 'button[data-testid="confirm-cancel-subscription"]' },
    { action: 'verify', target: '[data-testid="subscription-cancelled"]' },
  ],
  successSelector: '[data-testid="subscription-cancelled"]',
  monthlyAmountEstimate: 14.99,
};
