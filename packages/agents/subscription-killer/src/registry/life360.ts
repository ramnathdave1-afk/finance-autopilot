import type { MerchantCancelSpec } from './types';

export const life360: MerchantCancelSpec = {
  merchantKey: 'life360',
  displayName: 'Life360',
  cancelMethod: 'web',
  loginUrl: 'https://www.life360.com/login',
  billingUrl: 'https://www.life360.com/settings/membership',
  steps: [
    { action: 'navigate', target: 'https://www.life360.com/login' },
    { action: 'type', target: 'input[name="email"]', value: '{{username}}' },
    { action: 'type', target: 'input[name="password"]', value: '{{password}}' },
    { action: 'click', target: 'button[type="submit"]' },
    { action: 'navigate', target: 'https://www.life360.com/settings/membership' },
    { action: 'click', target: 'button[data-testid="cancel-membership"]' },
    { action: 'click', target: 'button[data-testid="confirm-cancellation"]' },
    { action: 'verify', target: '[data-testid="membership-cancelled"]' },
  ],
  successSelector: '[data-testid="membership-cancelled"]',
  monthlyAmountEstimate: 7.99,
};
