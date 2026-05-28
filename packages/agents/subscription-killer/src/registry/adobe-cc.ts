import type { MerchantCancelSpec } from './types';

export const adobeCc: MerchantCancelSpec = {
  merchantKey: 'adobe_cc',
  displayName: 'Adobe Creative Cloud',
  cancelMethod: 'web',
  loginUrl: 'https://auth.services.adobe.com/en_US/index.html',
  billingUrl: 'https://account.adobe.com/plans',
  steps: [
    { action: 'navigate', target: 'https://auth.services.adobe.com/en_US/index.html' },
    { action: 'type', target: 'input#EmailPage-EmailField', value: '{{username}}' },
    { action: 'click', target: 'button[data-id="EmailPage-ContinueButton"]' },
    { action: 'type', target: 'input#PasswordPage-PasswordField', value: '{{password}}' },
    { action: 'click', target: 'button[data-id="PasswordPage-ContinueButton"]' },
    { action: 'navigate', target: 'https://account.adobe.com/plans' },
    { action: 'click', target: 'a[data-testid="manage-plan-link"]' },
    { action: 'click', target: 'button[data-testid="cancel-plan-button"]' },
    { action: 'click', target: 'button[data-testid="continue-to-cancel"]' },
    { action: 'click', target: 'button[data-testid="confirm-cancellation"]' },
    { action: 'verify', target: '[data-testid="cancellation-complete"]' },
  ],
  successSelector: '[data-testid="cancellation-complete"]',
  monthlyAmountEstimate: 59.99,
};
