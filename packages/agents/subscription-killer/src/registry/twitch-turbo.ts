import type { MerchantCancelSpec } from './types';

export const twitchTurbo: MerchantCancelSpec = {
  merchantKey: 'twitch_turbo',
  displayName: 'Twitch Turbo',
  cancelMethod: 'web',
  loginUrl: 'https://www.twitch.tv/login',
  billingUrl: 'https://www.twitch.tv/settings/subscriptions',
  steps: [
    { action: 'navigate', target: 'https://www.twitch.tv/login' },
    { action: 'type', target: 'input#login-username', value: '{{username}}' },
    { action: 'type', target: 'input#password-input', value: '{{password}}' },
    { action: 'click', target: 'button[data-a-target="passport-login-button"]' },
    { action: 'navigate', target: 'https://www.twitch.tv/settings/subscriptions' },
    { action: 'click', target: 'button[data-test-selector="cancel-turbo"]' },
    { action: 'click', target: 'button[data-test-selector="confirm-cancel"]' },
    { action: 'verify', target: '[data-test-selector="turbo-cancelled"]' },
  ],
  successSelector: '[data-test-selector="turbo-cancelled"]',
  monthlyAmountEstimate: 8.99,
};
