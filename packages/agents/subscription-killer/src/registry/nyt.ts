import type { MerchantCancelSpec } from './types';

export const nyt: MerchantCancelSpec = {
  merchantKey: 'nyt',
  displayName: 'The New York Times',
  cancelMethod: 'web',
  loginUrl: 'https://myaccount.nytimes.com/auth/login',
  billingUrl: 'https://www.nytimes.com/subscription/cancel',
  steps: [
    { action: 'navigate', target: 'https://myaccount.nytimes.com/auth/login' },
    { action: 'type', target: 'input#email', value: '{{username}}' },
    { action: 'click', target: 'button[data-testid="continue"]' },
    { action: 'type', target: 'input#password', value: '{{password}}' },
    { action: 'click', target: 'button[data-testid="login-submit"]' },
    { action: 'navigate', target: 'https://www.nytimes.com/subscription/cancel' },
    { action: 'click', target: 'button[data-testid="cancel-subscription-button"]' },
    { action: 'click', target: 'button[data-testid="confirm-cancel-button"]' },
    { action: 'verify', target: '.cancellation-success' },
  ],
  successSelector: '.cancellation-success',
  monthlyAmountEstimate: 17.0,
};
