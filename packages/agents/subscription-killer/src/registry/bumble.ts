import type { MerchantCancelSpec } from './types';

export const bumble: MerchantCancelSpec = {
  merchantKey: 'bumble',
  displayName: 'Bumble',
  cancelMethod: 'web',
  loginUrl: 'https://bumble.com/get-started',
  billingUrl: 'https://bumble.com/app/settings/subscription',
  steps: [
    { action: 'navigate', target: 'https://bumble.com/get-started' },
    { action: 'type', target: 'input[name="email"]', value: '{{username}}' },
    { action: 'type', target: 'input[name="password"]', value: '{{password}}' },
    { action: 'click', target: 'button[type="submit"]' },
    { action: 'navigate', target: 'https://bumble.com/app/settings/subscription' },
    { action: 'click', target: 'button[data-testid="cancel-subscription"]' },
    { action: 'click', target: 'button[data-testid="confirm-cancellation"]' },
    { action: 'verify', target: '[data-testid="subscription-cancelled"]' },
  ],
  successSelector: '[data-testid="subscription-cancelled"]',
  monthlyAmountEstimate: 24.99,
};
