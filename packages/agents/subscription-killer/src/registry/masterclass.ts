import type { MerchantCancelSpec } from './types';

export const masterclass: MerchantCancelSpec = {
  merchantKey: 'masterclass',
  displayName: 'MasterClass',
  cancelMethod: 'web',
  loginUrl: 'https://www.masterclass.com/auth/login',
  billingUrl: 'https://www.masterclass.com/account/billing',
  steps: [
    { action: 'navigate', target: 'https://www.masterclass.com/auth/login' },
    { action: 'type', target: 'input[name="email"]', value: '{{username}}' },
    { action: 'type', target: 'input[name="password"]', value: '{{password}}' },
    { action: 'click', target: 'button[type="submit"]' },
    { action: 'navigate', target: 'https://www.masterclass.com/account/billing' },
    { action: 'click', target: 'button[data-testid="cancel-membership"]' },
    { action: 'click', target: 'button[data-testid="confirm-cancellation"]' },
    { action: 'verify', target: '[data-testid="membership-cancelled"]' },
  ],
  successSelector: '[data-testid="membership-cancelled"]',
  monthlyAmountEstimate: 10.0,
};
