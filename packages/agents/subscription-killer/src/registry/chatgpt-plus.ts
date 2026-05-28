import type { MerchantCancelSpec } from './types';

export const chatgptPlus: MerchantCancelSpec = {
  merchantKey: 'chatgpt_plus',
  displayName: 'ChatGPT Plus',
  cancelMethod: 'web',
  loginUrl: 'https://auth.openai.com/log-in',
  billingUrl: 'https://chatgpt.com/#settings/Subscription',
  steps: [
    { action: 'navigate', target: 'https://auth.openai.com/log-in' },
    { action: 'type', target: 'input[name="username"]', value: '{{username}}' },
    { action: 'click', target: 'button[type="submit"]' },
    { action: 'type', target: 'input[name="password"]', value: '{{password}}' },
    { action: 'click', target: 'button[data-testid="login-submit"]' },
    { action: 'navigate', target: 'https://chatgpt.com/#settings/Subscription' },
    { action: 'click', target: 'button[data-testid="manage-subscription"]' },
    { action: 'click', target: 'a[data-testid="cancel-subscription-link"]' },
    { action: 'click', target: 'button[data-testid="confirm-cancellation"]' },
    { action: 'verify', target: '[data-testid="subscription-cancelled"]' },
  ],
  successSelector: '[data-testid="subscription-cancelled"]',
  monthlyAmountEstimate: 20.0,
};
