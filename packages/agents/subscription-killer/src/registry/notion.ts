import type { MerchantCancelSpec } from './types';

export const notion: MerchantCancelSpec = {
  merchantKey: 'notion',
  displayName: 'Notion',
  cancelMethod: 'web',
  loginUrl: 'https://www.notion.so/login',
  billingUrl: 'https://www.notion.so/my-integrations',
  steps: [
    { action: 'navigate', target: 'https://www.notion.so/login' },
    { action: 'type', target: 'input[type="email"]', value: '{{username}}' },
    { action: 'click', target: 'div[role="button"][data-testid="continue-with-email"]' },
    { action: 'type', target: 'input[type="password"]', value: '{{password}}' },
    { action: 'click', target: 'div[role="button"][data-testid="continue-login"]' },
    { action: 'navigate', target: 'https://www.notion.so/settings/billing' },
    { action: 'click', target: 'div[role="button"][data-testid="change-plan"]' },
    { action: 'click', target: 'div[role="button"][data-testid="downgrade-to-free"]' },
    { action: 'verify', target: '[data-testid="plan-downgraded"]' },
  ],
  successSelector: '[data-testid="plan-downgraded"]',
  monthlyAmountEstimate: 10.0,
};
