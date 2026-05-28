// PRD §16: if the subscription killer fails after retries, the user is
// owed a refund of that month's autopilot subscription fee. We set a
// boolean on agent_actions so T5 (billing) can sweep + credit during the
// nightly Stripe job.
//
// TODO(integrate-t2-migration: add refund_eligible bool to agent_actions, default false)
// The column already exists in the AgentAction type (@fa/types) but the
// SQL migration that adds it to the live table is owned by T2. Until that
// migration lands this writes to a column that may not yet exist — Supabase
// will surface a 42703 (undefined_column) which we swallow + log so the
// agent's terminal status still wins.

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
