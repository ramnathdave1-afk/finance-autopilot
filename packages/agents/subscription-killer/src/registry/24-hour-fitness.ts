import type { MerchantCancelSpec } from './types';

// 24 Hour Fitness requires a phone call to member services to cancel. Voice path.
export const twentyFourHourFitness: MerchantCancelSpec = {
  merchantKey: 'twenty_four_hour_fitness',
  displayName: '24 Hour Fitness',
  cancelMethod: 'voice',
  loginUrl: 'https://www.24hourfitness.com/login',
  billingUrl: 'https://www.24hourfitness.com/account/membership',
  steps: [
    { action: 'navigate', target: 'tel:+18664328422' },
    { action: 'wait', target: '5000' },
    { action: 'verify', target: 'call-completed' },
  ],
  successSelector: 'call-completed',
  monthlyAmountEstimate: 49.99,
};
