import type { MerchantCancelSpec } from './types';

// Planet Fitness requires in-person OR certified-mail cancellation for most
// memberships. We start with web; the agent will fail and refund_eligible
// will toggle. PRD §16 trust model — user keeps subscription credit.
export const planetFitness: MerchantCancelSpec = {
  merchantKey: 'planet_fitness',
  displayName: 'Planet Fitness',
  cancelMethod: 'web',
  loginUrl: 'https://www.planetfitness.com/account/login',
  billingUrl: 'https://www.planetfitness.com/account',
  steps: [
    { action: 'navigate', target: 'https://www.planetfitness.com/account/login' },
    { action: 'type', target: 'input#email', value: '{{username}}' },
    { action: 'type', target: 'input#password', value: '{{password}}' },
    { action: 'click', target: 'button[type="submit"]' },
    { action: 'navigate', target: 'https://www.planetfitness.com/account' },
    { action: 'click', target: 'a[data-test="cancel-membership-link"]' },
    { action: 'verify', target: '[data-test="cancel-confirmation"]' },
  ],
  successSelector: '[data-test="cancel-confirmation"]',
  monthlyAmountEstimate: 24.99,
};
