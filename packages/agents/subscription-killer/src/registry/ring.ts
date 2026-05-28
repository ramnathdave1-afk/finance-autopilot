import type { MerchantCancelSpec } from './types';

export const ring: MerchantCancelSpec = {
  merchantKey: 'ring',
  displayName: 'Ring Protect',
  cancelMethod: 'web',
  loginUrl: 'https://account.ring.com/account/login',
  billingUrl: 'https://account.ring.com/account/plans',
  steps: [
    { action: 'navigate', target: 'https://account.ring.com/account/login' },
    { action: 'type', target: 'input[name="email"]', value: '{{username}}' },
    { action: 'type', target: 'input[name="password"]', value: '{{password}}' },
    { action: 'click', target: 'button[type="submit"]' },
    { action: 'navigate', target: 'https://account.ring.com/account/plans' },
    { action: 'click', target: 'button[data-testid="cancel-plan"]' },
    { action: 'click', target: 'button[data-testid="confirm-cancel-plan"]' },
    { action: 'verify', target: '[data-testid="plan-cancelled"]' },
  ],
  successSelector: '[data-testid="plan-cancelled"]',
  monthlyAmountEstimate: 4.99,
};
