import type { MerchantCancelSpec } from './types';

export const youtubePremium: MerchantCancelSpec = {
  merchantKey: 'youtube_premium',
  displayName: 'YouTube Premium',
  cancelMethod: 'web',
  loginUrl: 'https://accounts.google.com/ServiceLogin',
  billingUrl: 'https://www.youtube.com/paid_memberships',
  steps: [
    { action: 'navigate', target: 'https://accounts.google.com/ServiceLogin' },
    { action: 'type', target: 'input[type="email"]', value: '{{username}}' },
    { action: 'type', target: 'input[type="password"]', value: '{{password}}' },
    { action: 'click', target: 'button#identifierNext' },
    { action: 'navigate', target: 'https://www.youtube.com/paid_memberships' },
    { action: 'click', target: 'button[aria-label="Manage membership"]' },
    { action: 'click', target: 'tp-yt-paper-button[aria-label="Deactivate"]' },
    { action: 'click', target: 'button[data-testid="confirm-cancel"]' },
    { action: 'verify', target: '[data-testid="membership-cancelled"]' },
  ],
  successSelector: '[data-testid="membership-cancelled"]',
  monthlyAmountEstimate: 13.99,
};
