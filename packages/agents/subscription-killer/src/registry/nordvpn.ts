import type { MerchantCancelSpec } from './types';

export const nordvpn: MerchantCancelSpec = {
  merchantKey: 'nordvpn',
  displayName: 'NordVPN',
  cancelMethod: 'web',
  loginUrl: 'https://my.nordaccount.com/login/',
  billingUrl: 'https://my.nordaccount.com/billing/subscriptions/',
  steps: [
    { action: 'navigate', target: 'https://my.nordaccount.com/login/' },
    { action: 'type', target: 'input[name="email"]', value: '{{username}}' },
    { action: 'type', target: 'input[name="password"]', value: '{{password}}' },
    { action: 'click', target: 'button[type="submit"]' },
    { action: 'navigate', target: 'https://my.nordaccount.com/billing/subscriptions/' },
    { action: 'click', target: 'button[data-testid="cancel-subscription"]' },
    { action: 'click', target: 'button[data-testid="confirm-cancellation"]' },
    { action: 'verify', target: '[data-testid="subscription-cancelled"]' },
  ],
  successSelector: '[data-testid="subscription-cancelled"]',
  monthlyAmountEstimate: 12.99,
};
