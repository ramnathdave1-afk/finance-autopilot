import type { MerchantCancelSpec } from './types';

export const expressvpn: MerchantCancelSpec = {
  merchantKey: 'expressvpn',
  displayName: 'ExpressVPN',
  cancelMethod: 'web',
  loginUrl: 'https://www.expressvpn.com/sign-in',
  billingUrl: 'https://www.expressvpn.com/subscriptions',
  steps: [
    { action: 'navigate', target: 'https://www.expressvpn.com/sign-in' },
    { action: 'type', target: 'input[name="email"]', value: '{{username}}' },
    { action: 'type', target: 'input[name="password"]', value: '{{password}}' },
    { action: 'click', target: 'button[type="submit"]' },
    { action: 'navigate', target: 'https://www.expressvpn.com/subscriptions' },
    { action: 'click', target: 'button[data-testid="cancel-subscription"]' },
    { action: 'click', target: 'button[data-testid="confirm-cancel"]' },
    { action: 'verify', target: '[data-testid="subscription-cancelled"]' },
  ],
  successSelector: '[data-testid="subscription-cancelled"]',
  monthlyAmountEstimate: 12.95,
};
