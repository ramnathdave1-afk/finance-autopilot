import type { MerchantCancelSpec } from './types';

export const blueApron: MerchantCancelSpec = {
  merchantKey: 'blue_apron',
  displayName: 'Blue Apron',
  cancelMethod: 'web',
  loginUrl: 'https://www.blueapron.com/users/sign_in',
  billingUrl: 'https://www.blueapron.com/account/subscription',
  steps: [
    { action: 'navigate', target: 'https://www.blueapron.com/users/sign_in' },
    { action: 'type', target: 'input[name="email"]', value: '{{username}}' },
    { action: 'type', target: 'input[name="password"]', value: '{{password}}' },
    { action: 'click', target: 'button[type="submit"]' },
    { action: 'navigate', target: 'https://www.blueapron.com/account/subscription' },
    { action: 'click', target: 'a[data-testid="cancel-plan-link"]' },
    { action: 'click', target: 'button[data-testid="confirm-cancel-plan"]' },
    { action: 'verify', target: '[data-testid="plan-cancelled"]' },
  ],
  successSelector: '[data-testid="plan-cancelled"]',
  monthlyAmountEstimate: 59.94,
};
