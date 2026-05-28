// One-click cancel (PRD §9 Story 4, PRD §14 universal features).
//
// ABSOLUTELY NO retention prompts, no dark patterns, no "are you sure"
// cascades. The cancel happens immediately at period end and the user keeps
// access until that point. This is anti-Cleo positioning.

import { getAdapter } from './adapter';
import { getDbPort } from './db-port';

export interface OneClickCancelResult {
  /** Always true if we successfully scheduled the cancel. */
  cancelled: boolean;
  /** Unix seconds when access ends. */
  effectiveAt: number;
  subscriptionId: string;
  /** Structural marker: there are NO retention prompts in this response. */
  retentionPrompts: never[];
}

export async function oneClickCancel(userId: string): Promise<OneClickCancelResult> {
  const db = getDbPort();
  const user = await db.getUserById(userId);
  if (!user) throw new Error(`user not found: ${userId}`);
  if (!user.stripe_subscription_id) {
    throw new Error(`user has no active subscription: ${userId}`);
  }

  const cancellation = await getAdapter().cancelSubscriptionAtPeriodEnd(
    user.stripe_subscription_id,
  );

  // Don't downgrade the tier yet — they paid for the rest of the period.
  // The .deleted webhook (or our own cron) flips them to 'free' when the
  // period actually ends.
  await db.updateUserSubscription(userId, { subscription_status: 'cancelled' });

  return {
    cancelled: true,
    effectiveAt: cancellation.cancelAt,
    subscriptionId: cancellation.subscriptionId,
    retentionPrompts: [],
  };
}
