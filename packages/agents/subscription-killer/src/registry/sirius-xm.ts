import type { MerchantCancelSpec } from './types';

// SiriusXM routes all cancellations through a retention phone line. Voice path.
export const siriusXm: MerchantCancelSpec = {
  merchantKey: 'sirius_xm',
  displayName: 'SiriusXM',
  cancelMethod: 'voice',
  loginUrl: 'https://www.siriusxm.com/login',
  billingUrl: 'https://care.siriusxm.com/account_subscriptions.action',
  steps: [
    { action: 'navigate', target: 'tel:+18666356849' },
    { action: 'wait', target: '5000' },
    { action: 'verify', target: 'call-completed' },
  ],
  successSelector: 'call-completed',
  monthlyAmountEstimate: 16.99,
};
