// Provider router: picks the right adapter for a provider_items row based on
// its `provider` column. Callers (sync cron, webhook dispatcher) should use
// `syncItemForProvider(rowId)` rather than calling syncItemTransactions /
// MX / Finicity directly — that way we can add more providers without
// touching every call site.
//
// Reauth flow (PRD §11 resilience):
//   If a Plaid item has status='login_required' for > REAUTH_THRESHOLD_HOURS,
//   we (a) mark it `awaiting_reauth` on provider_items, and (b) emit a single
//   `awaiting_user` agent_action of type 'reconnect_bank' that T1's feed
//   renders as the top card with "Reconnect" CTA.

import { createServiceClient, startAction, upsertAgent } from '@fa/db';
import type { AgentType } from '@fa/db/types';
import { syncItemTransactions } from './transactions';
import { mxAdapter } from './fallback/mx';
import { finicityAdapter } from './fallback/finicity';
import type { ProviderSyncResult } from './fallback/types';

const REAUTH_THRESHOLD_HOURS = 24;

export async function syncItemForProvider(providerItemRowId: string): Promise<ProviderSyncResult> {
  const supabase = createServiceClient();
  const { data: item, error } = await supabase
    .from('provider_items')
    .select('id, provider, status')
    .eq('id', providerItemRowId)
    .single();
  if (error || !item) throw new Error(`provider_items not found: ${error?.message}`);

  // Skip items already in error / awaiting reauth — caller surfaces them via UI.
  if (item.status === 'awaiting_reauth' || item.status === 'error') {
    return { added: 0, modified: 0, removed: 0 };
  }

  switch (item.provider) {
    case 'plaid':
      return syncItemTransactions(providerItemRowId);
    case 'mx':
      if (!mxAdapter.isConfigured()) throw new Error('MX adapter not configured');
      return mxAdapter.syncItem(providerItemRowId);
    case 'finicity':
      if (!finicityAdapter.isConfigured()) throw new Error('Finicity adapter not configured');
      return finicityAdapter.syncItem(providerItemRowId);
    default:
      throw new Error(`unknown provider: ${item.provider}`);
  }
}

/**
 * Walk every Plaid item with error_code='ITEM_LOGIN_REQUIRED' (or status='error'
 * for >24h) and emit awaiting-user reconnect actions. Idempotency-keyed so
 * re-runs don't pile up duplicate cards.
 */
export async function detectAndQueueReauth(): Promise<{ flagged: number; emitted: number }> {
  const supabase = createServiceClient();
  const threshold = new Date(Date.now() - REAUTH_THRESHOLD_HOURS * 3600_000).toISOString();

  const { data: items, error } = await supabase
    .from('provider_items')
    .select('id, user_id, institution_name, status, error_code, last_synced_at')
    .eq('provider', 'plaid')
    .in('status', ['error', 'login_required'])
    .or(`error_code.eq.ITEM_LOGIN_REQUIRED,last_synced_at.lt.${threshold}`);
  if (error) throw new Error(error.message);

  let flagged = 0;
  let emitted = 0;
  for (const item of items ?? []) {
    flagged += 1;

    // Mark provider_items state — UI uses this to render bank tiles greyed out.
    await supabase
      .from('provider_items')
      .update({ status: 'awaiting_reauth' })
      .eq('id', item.id);

    // Ensure the user has a human_backup agent row to attach the action to.
    // Using human_backup keeps reconnect prompts orthogonal to any specific
    // agent — they're escalations that need human action (the user themselves).
    const agentType: AgentType = 'human_backup';
    let agentId: string;
    try {
      agentId = await upsertAgent(item.user_id, agentType, 'approve_each', true);
    } catch {
      continue;
    }

    try {
      await startAction({
        userId: item.user_id,
        agentId,
        agentType,
        actionType: 'reconnect_bank',
        target: item.institution_name ?? 'bank',
        idempotencyKey: `reconnect:${item.id}`,
        requiresApproval: true,
      });
      emitted += 1;
    } catch {
      // Idempotency conflict means we already emitted — that's the desired state.
    }
  }

  return { flagged, emitted };
}
