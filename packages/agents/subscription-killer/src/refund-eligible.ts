// PRD §16: if the subscription killer fails after retries, the user is
// owed a refund of that month's autopilot subscription fee. We set a
// boolean on agent_actions so T5 (billing) can sweep + credit during the
// nightly Stripe job.
//
// Column was added in packages/db/migrations/phase1b_T5_billing.sql. We
// keep the 42703 swallow path below as a defensive guard against drift
// across environments that haven't migrated yet, but in production this
// branch should never fire.
//
// NOTE (orchestrator review): per legal/refund-policy.md the policy
// distinguishes "agent fault" (refundable) from "third-party refused"
// (not refundable). Today we mark ALL terminal failures eligible, which
// over-refunds when the cancel fails because the provider blocked us
// rather than because the agent broke. Fix in Phase 2 by classifying
// failure-cause and only flagging the "agent-fault" subset.

import { createServiceClient } from '@fa/db';

export interface RefundEligibleResult {
  ok: boolean;
  reason?: string;
}

export async function setRefundEligible(actionId: string): Promise<RefundEligibleResult> {
  try {
    const supabase = createServiceClient();
    const { error } = await supabase
      .from('agent_actions')
      .update({ refund_eligible: true })
      .eq('id', actionId);
    if (error) {
      // 42703 undefined_column — migration not yet applied.
      if (error.code === '42703' || /refund_eligible/.test(error.message)) {
        return {
          ok: false,
          reason: `refund_eligible column not present yet — TODO(integrate-t2-migration): ${error.message}`,
        };
      }
      return { ok: false, reason: error.message };
    }
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      reason: e instanceof Error ? e.message : String(e),
    };
  }
}
