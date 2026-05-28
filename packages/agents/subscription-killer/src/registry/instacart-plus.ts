import type { MerchantCancelSpec } from './types';

export const instacartPlus: MerchantCancelSpec = {
  merchantKey: 'instacart_plus',
  displayName: 'Instacart+',
  cancelMethod: 'web',
  loginUrl: 'https://www.instacart.com/login',
  billingUrl: 'https://www.instacart.com/store/account/instacart-plus',
  steps: [
    { action: 'navigate', target: 'https://www.instacart.com/login' },
    { action: 'type', target: 'input[name="email"]', value: '{{username}}' },
    { action: 'type', target: 'input[name="password"]', value: '{{password}}' },
    { action: 'click', target: 'button[type="submit"]' },
    { action: 'navigate', target: 'https://www.instacart.com/store/account/instacart-plus' },
    { action: 'click', target: 'button[data-testid="cancel-membership"]' },
    { action: 'click', target: 'button[data-testid="confirm-cancel-membership"]' },
    { action: 'verify', target: '[data-testid="membership-cancelled"]' },
  ],
  successSelector: '[data-testid="membership-cancelled"]',
  monthlyAmountEstimate: 9.99,
};
