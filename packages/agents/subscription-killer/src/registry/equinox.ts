import type { MerchantCancelSpec } from './types';

// Equinox requires a phone call to retention for most plans. Voice path.
export const equinox: MerchantCancelSpec = {
  merchantKey: 'equinox',
  displayName: 'Equinox',
  cancelMethod: 'voice',
  loginUrl: 'https://www.equinox.com/account',
  billingUrl: 'https://www.equinox.com/account/membership',
  steps: [
    { action: 'navigate', target: 'tel:+18444495559' },
    { action: 'wait', target: '5000' },
    { action: 'verify', target: 'call-completed' },
  ],
  successSelector: 'call-completed',
  monthlyAmountEstimate: 260.0,
};
