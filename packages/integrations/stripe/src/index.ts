// Public surface of @fa/stripe.

export {
  PRICE_TABLE,
  FOUNDER_LIFETIME_PRICE_ID,
  FOUNDER_LIFETIME_AMOUNT_CENTS,
  FOUNDER_YEAR1_50PCT_COUPON_ID,
  FOUNDER_LIFETIME_COHORT_SIZE,
  FOUNDER_ANNUAL_YEAR1_COHORT_SIZE,
  type BillingCycle,
  type PaidTier,
  type PriceEntry,
} from './products';

export {
  computeFounderPrice,
  type ComputeFounderPriceArgs,
  type FounderPriceQuote,
  type FounderReason,
} from './founder-pricing';

export {
  createCheckoutSession,
  type CreateCheckoutSessionInput,
  type CreateCheckoutSessionResult,
} from './checkout';

export {
  createPortalSession,
  type CreatePortalSessionInput,
  type CreatePortalSessionResult,
} from './portal';

export { handleWebhook, type HandleWebhookResult } from './webhook';

export {
  enforceTier,
  PermissionError,
  FREE_TIER_MONTHLY_ACTION_QUOTA,
  type EnforceTierResult,
} from './tier-enforcement';

export {
  issueFailureRefund,
  type IssueFailureRefundResult,
  type IssueFailureRefundOptions,
  type RefundReason,
} from './refund';

export { oneClickCancel, type OneClickCancelResult } from './cancel';

export {
  StubAdapter,
  setAdapter,
  getAdapter,
  _resetAdapter,
  type StripeAdapter,
  type StripeCheckoutSession,
  type StripeCheckoutSessionInput,
  type StripePortalSession,
  type StripeRefundInput,
  type StripeRefund,
  type StripeCancellation,
  type StripeWebhookEvent,
} from './adapter';

export {
  setDbPort,
  getDbPort,
  _resetDbPort,
  realDb,
  type DbPort,
  type UserLite,
  type AgentActionLite,
} from './db-port';
