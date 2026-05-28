import type { MerchantCancelSpec } from './types';

export const appleOne: MerchantCancelSpec = {
  merchantKey: 'apple_one',
  displayName: 'Apple One',
  cancelMethod: 'web',
  loginUrl: 'https://appleid.apple.com/sign-in',
  billingUrl: 'https://account.apple.com/account/manage/subscriptions',
  steps: [
    { action: 'navigate', target: 'https://appleid.apple.com/sign-in' },
    { action: 'type', target: 'input#account_name_text_field', value: '{{username}}' },
    { action: 'type', target: 'input#password_text_field', value: '{{password}}' },
    { action: 'click', target: 'button#sign-in' },
    { action: 'navigate', target: 'https://account.apple.com/account/manage/subscriptions' },
    { action: 'click', target: 'button[data-testid="manage-subscription"]' },
    { action: 'click', target: 'button[data-testid="cancel-subscription"]' },
    { action: 'click', target: 'button[data-testid="confirm-cancellation"]' },
    { action: 'verify', target: '[data-testid="subscription-cancelled"]' },
  ],
  successSelector: '[data-testid="subscription-cancelled"]',
  monthlyAmountEstimate: 19.95,
};
