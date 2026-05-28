import type { MerchantCancelSpec } from './types';

export const dashpass: MerchantCancelSpec = {
  merchantKey: 'dashpass',
  displayName: 'DoorDash DashPass',
  cancelMethod: 'web',
  loginUrl: 'https://identity.doordash.com/auth',
  billingUrl: 'https://www.doordash.com/account/dashpass',
  steps: [
    { action: 'navigate', target: 'https://identity.doordash.com/auth' },
    { action: 'type', target: 'input[name="email"]', value: '{{username}}' },
    { action: 'type', target: 'input[name="password"]', value: '{{password}}' },
    { action: 'click', target: 'button[type="submit"]' },
    { action: 'navigate', target: 'https://www.doordash.com/account/dashpass' },
    { action: 'click', target: 'button[data-testid="cancel-dashpass"]' },
    { action: 'click', target: 'button[data-testid="confirm-cancel-dashpass"]' },
    { action: 'verify', target: '[data-testid="dashpass-cancelled"]' },
  ],
  successSelector: '[data-testid="dashpass-cancelled"]',
  monthlyAmountEstimate: 9.99,
};
