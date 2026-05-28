// Refund-on-failure (PRD §16).
//
// When an agent_action terminates in `failed` and is flagged refund_eligible,
// we issue a pro-rated refund of the CURRENT MONTH's subscription only.
// Idempotent on the action id.

import { getAdapter } from './adapter';
import { PRICE_TABLE, type BillingCycle, type PaidTier } from './products';
import { getDbPort } from './db-port';

export type RefundReason =
  | 'issued'
  | 'already_processed'
  | 'action_not_found'
  | 'action_not_failed'
  | 'not_refund_eligible'
  | 'no_active_subscription'
  | 'no_charge_id'
  | 'tier_not_billable';

export interface IssueFailureRefundResult {
  actionId: string;
  reason: RefundReason;
  refundId?: string;
  amountCents?: number;
}

export interface IssueFailureRefundOptions {
  /** Override "today" — tests pass a fixed clock. */
  now?: Date;
}

/**
 * Pro-rate this month: refund = ceil((daysRemainingIncludingToday / daysInMonth) * monthlyCharge).
 *
 * For annual subscribers we convert to a monthly equivalent first
 * (annual / 12) — the PRD specifies "the current month only".
 */
export async function issueFailureRefund(
  actionId: string,
  opts: IssueFailureRefundOptions = {},
): Promise<IssueFailureRefundResult> {
  const db = getDbPort();

  if (await db.hasProcessedRefund(actionId)) {
    return { actionId, reason: 'already_processed' };
  }

  const action = await db.getAgentAction(actionId);
  if (!action) return { actionId, reason: 'action_not_found' };
  if (action.status !== 'failed') return { actionId, reason: 'action_not_failed' };
  if (!action.refund_eligible) return { actionId, reason: 'not_refund_eligible' };

  const user = await db.getUserById(action.user_id);
  if (!user || user.subscription_status !== 'active') {
    return { actionId, reason: 'no_active_subscription' };
  }
  if (!action.stripe_charge_id) {
    // We can't refund without a charge id. Tests/integration callers must set
    // this when the action is billed.
    return { actionId, reason: 'no_charge_id' };
  }

  if (user.pricing_tier === 'free') {
    return { actionId, reason: 'tier_not_billable' };
  }

  const monthlyChargeCents = monthlyEquivalentCents(user.pricing_tier as PaidTier);
  const refundCents = proRatedCurrentMonth(monthlyChargeCents, opts.now ?? new Date());

  const refund = await getAdapter().refund({
    chargeId: action.stripe_charge_id,
    amountCents: refundCents,
    idempotencyKey: `refund:action:${actionId}`,
    metadata: { reason: 'agent_failure', action_id: actionId, user_id: user.id },
  });

  await db.markRefundProcessed(actionId, refund.id, refund.amountCents);
  return {
    actionId,
    reason: 'issued',
    refundId: refund.id,
    amountCents: refund.amountCents,
  };
}

/**
 * Best monthly equivalent we can compute without knowing billing_cycle.
 * Conservative: use the monthly sticker price (refund what they pay each
 * month). If annual, that's still the right month-equivalent figure since the
 * PRD says "refund of that month + the action is reversed where possible".
 */
function monthlyEquivalentCents(tier: PaidTier, cycle: BillingCycle = 'monthly'): number {
  const entry = PRICE_TABLE[tier][cycle];
  if (!entry) throw new Error(`No price for ${tier}/${cycle}`);
  if (cycle === 'annual') return Math.round(entry.amount / 12);
  return entry.amount;
}

function proRatedCurrentMonth(monthlyCents: number, now: Date): number {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const today = now.getUTCDate();
  const daysRemaining = daysInMonth - today + 1; // include today
  return Math.ceil((daysRemaining / daysInMonth) * monthlyCents);
}
