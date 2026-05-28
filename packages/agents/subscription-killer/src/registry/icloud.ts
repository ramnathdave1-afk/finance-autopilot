import type { MerchantCancelSpec } from './types';

export const icloud: MerchantCancelSpec = {
  merchantKey: 'icloud',
  displayName: 'iCloud+',
  cancelMethod: 'web',
  loginUrl: 'https://www.icloud.com/',
  billingUrl: 'https://account.apple.com/account/manage/section/storage',
  steps: [
    { action: 'navigate', target: 'https://www.icloud.com/' },
    { action: 'type', target: 'input#account_name_text_field', value: '{{username}}' },
    { action: 'type', target: 'input#password_text_field', value: '{{password}}' },
    { action: 'click', target: 'button#sign-in' },
    { action: 'navigate', target: 'https://account.apple.com/account/manage/section/storage' },
    { action: 'click', target: 'button[data-testid="downgrade-storage"]' },
    { action: 'click', target: 'button[data-testid="confirm-downgrade"]' },
    { action: 'verify', target: '[data-testid="storage-downgraded"]' },
  ],
  successSelector: '[data-testid="storage-downgraded"]',
  monthlyAmountEstimate: 2.99,
};
