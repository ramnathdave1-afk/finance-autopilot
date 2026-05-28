import type { MerchantCancelSpec } from './types';

export const disneyPlus: MerchantCancelSpec = {
  merchantKey: 'disney_plus',
  displayName: 'Disney+',
  cancelMethod: 'web',
  loginUrl: 'https://www.disneyplus.com/login',
  billingUrl: 'https://www.disneyplus.com/account/subscription',
  steps: [
    { action: 'navigate', target: 'https://www.disneyplus.com/login' },
    { action: 'type', target: 'input[type="email"]', value: '{{username}}' },
    { action: 'click', target: 'button[data-testid="login-continue-button"]' },
    { action: 'type', target: 'input[type="password"]', value: '{{password}}' },
    { action: 'click', target: 'button[data-testid="password-continue-login-button"]' },
    { action: 'navigate', target: 'https://www.disneyplus.com/account/subscription' },
    { action: 'click', target: 'a[data-testid="cancel-subscription-link"]' },
    { action: 'click', target: 'button[data-testid="cancel-subscription-confirm"]' },
    { action: 'verify', target: '[data-testid="cancellation-confirmation-page"]' },
  ],
  successSelector: '[data-testid="cancellation-confirmation-page"]',
  monthlyAmountEstimate: 13.99,
};
