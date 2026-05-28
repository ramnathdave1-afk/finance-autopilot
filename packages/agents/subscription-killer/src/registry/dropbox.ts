import type { MerchantCancelSpec } from './types';

export const dropbox: MerchantCancelSpec = {
  merchantKey: 'dropbox',
  displayName: 'Dropbox',
  cancelMethod: 'web',
  loginUrl: 'https://www.dropbox.com/login',
  billingUrl: 'https://www.dropbox.com/account/plan',
  steps: [
    { action: 'navigate', target: 'https://www.dropbox.com/login' },
    { action: 'type', target: 'input[name="login_email"]', value: '{{username}}' },
    { action: 'type', target: 'input[name="login_password"]', value: '{{password}}' },
    { action: 'click', target: 'button[type="submit"]' },
    { action: 'navigate', target: 'https://www.dropbox.com/account/plan' },
    { action: 'click', target: 'button[data-testid="cancel-plan-button"]' },
    { action: 'click', target: 'button[data-testid="confirm-downgrade"]' },
    { action: 'verify', target: '[data-testid="plan-cancelled-banner"]' },
  ],
  successSelector: '[data-testid="plan-cancelled-banner"]',
  monthlyAmountEstimate: 11.99,
};
