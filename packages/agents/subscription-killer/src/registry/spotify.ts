import type { MerchantCancelSpec } from './types';

export const spotify: MerchantCancelSpec = {
  merchantKey: 'spotify',
  displayName: 'Spotify',
  cancelMethod: 'web',
  loginUrl: 'https://accounts.spotify.com/login',
  billingUrl: 'https://www.spotify.com/account/subscription/',
  steps: [
    { action: 'navigate', target: 'https://accounts.spotify.com/login' },
    { action: 'type', target: 'input#login-username', value: '{{username}}' },
    { action: 'type', target: 'input#login-password', value: '{{password}}' },
    { action: 'click', target: 'button#login-button' },
    { action: 'navigate', target: 'https://www.spotify.com/account/subscription/' },
    { action: 'click', target: 'a[data-testid="available-plans-card-cta"]' },
    { action: 'click', target: 'button[data-testid="cancel-button"]' },
    { action: 'click', target: 'button[data-testid="confirm-cancel"]' },
    { action: 'verify', target: '[data-testid="subscription-cancelled-banner"]' },
  ],
  successSelector: '[data-testid="subscription-cancelled-banner"]',
  monthlyAmountEstimate: 11.99,
};
