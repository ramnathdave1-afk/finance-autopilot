export { getPlaidClient, redactToken } from './client';
export { createLinkToken, exchangePublicToken } from './link';
export { upsertAccountsForItem } from './accounts';
export {
  syncItemTransactions,
  categorizeTransactionIds,
  categorizeBacklog,
} from './transactions';
export { syncUser, syncAll } from './sync';
export {
  getNetWorth,
  getSpendingByCategory,
  getBalances,
  getRecentTransactions,
  type NetWorth,
  type SpendingPoint,
  type AccountBalance,
} from './fetchers';
export { storeAccessToken, readAccessToken, deleteAccessToken } from './vault';
export { handlePlaidWebhook, verifyPlaidJwt, type PlaidWebhook } from './webhook';
export { detectSubscriptionsForUser, normalizeMerchant, type DetectOptions } from './subscriptions-detect';
export { spendingDelta, cashflow, type CategoryDelta } from './trends';
export {
  detectAnomalies,
  detectChargesAfterCancellation,
  type AnomalyFlag,
  type AnomalyReason,
} from './anomaly';
export { syncHoldingsForItem, investmentNetWorth } from './investments';
export { buildSpendingProfile, type SpendingProfile } from './spending-profile';
export * as MxFallback from './fallback/mx';
export * as FinicityFallback from './fallback/finicity';
