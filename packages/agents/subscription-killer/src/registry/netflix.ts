import type { MerchantCancelSpec } from './types';

export const netflix: MerchantCancelSpec = {
  merchantKey: 'netflix',
  displayName: 'Netflix',
  cancelMethod: 'web',
  loginUrl: 'https://www.netflix.com/login',
  billingUrl: 'https://www.netflix.com/cancelplan',
  steps: [
    { action: 'navigate', target: 'https://www.netflix.com/login' },
    { action: 'type', target: 'input[name="userLoginId"]', value: '{{username}}' },
    { action: 'type', target: 'input[name="password"]', value: '{{password}}' },
    { action: 'click', target: 'button[data-uia="login-submit-button"]' },
    { action: 'navigate', target: 'https://www.netflix.com/cancelplan' },
    { action: 'click', target: 'button[data-uia="action-finish-cancellation"]' },
    { action: 'wait', target: '2000' },
    { action: 'verify', target: '[data-uia="cancellation-confirmation"]' },
  ],
  successSelector: '[data-uia="cancellation-confirmation"]',
  monthlyAmountEstimate: 15.49,
};
