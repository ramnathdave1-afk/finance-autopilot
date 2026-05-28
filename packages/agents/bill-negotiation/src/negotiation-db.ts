// Thin wrapper over @fa/db's createServiceClient for the bills +
// bill_negotiations rows. Isolated so tests can mock just this surface.
//
// Tables defined in packages/db/migrations/phase2_T2_tier2_tables.sql — we do
// NOT create them here. Row types come from @fa/types.

import { createServiceClient } from '@fa/db';
import type {
  BillRow,
  BillNegotiationRow,
  BillNegotiationStatus,
} from '@fa/db/types';

export async function getBill(billId: string): Promise<BillRow | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('bills')
    .select('*')
    .eq('id', billId)
    .maybeSingle();
  if (error) throw new Error(`getBill failed: ${error.message}`);
  return (data ?? null) as BillRow | null;
}

/**
 * Find an existing bill_negotiations row for this agent_action_id, if one was
 * already created on a prior (retried) attempt. Lets retries RESUME the same
 * call instead of inserting a new row + re-dialing the provider — see the
 * idempotency contract in agent.ts. Most-recent row wins.
 */
export async function findNegotiationByActionId(
  agentActionId: string,
): Promise<BillNegotiationRow | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('bill_negotiations')
    .select('*')
    .eq('agent_action_id', agentActionId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`findNegotiationByActionId failed: ${error.message}`);
  return (data ?? null) as BillNegotiationRow | null;
}

export interface CreateNegotiationInput {
  userId: string;
  billId: string;
  agentActionId: string;
  targetAmount: number;
  status?: BillNegotiationStatus;
}

/** Insert a bill_negotiations row at the start of a call attempt. */
export async function createNegotiation(
  input: CreateNegotiationInput,
): Promise<BillNegotiationRow> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('bill_negotiations')
    .insert({
      user_id: input.userId,
      bill_id: input.billId,
      agent_action_id: input.agentActionId,
      target_amount: input.targetAmount,
      status: input.status ?? 'preparing_call',
    })
    .select('*')
    .single();
  if (error || !data) throw new Error(`createNegotiation failed: ${error?.message}`);
  return data as BillNegotiationRow;
}

export interface UpdateNegotiationPatch {
  status?: BillNegotiationStatus;
  achievedAmount?: number | null;
  monthlySavings?: number | null;
  callStartedAt?: string | null;
  callEndedAt?: string | null;
  callDurationSeconds?: number | null;
  callSid?: string | null;
  voiceRecordingUrl?: string | null;
  transcriptUrl?: string | null;
  notes?: string | null;
}

/** Patch a bill_negotiations row mid- or post-call. */
export async function updateNegotiation(
  negotiationId: string,
  patch: UpdateNegotiationPatch,
): Promise<void> {
  const supabase = createServiceClient();
  // Map camelCase patch → snake_case columns; omit undefined to avoid
  // clobbering existing values.
  const row: Record<string, unknown> = {};
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.achievedAmount !== undefined) row.achieved_amount = patch.achievedAmount;
  if (patch.monthlySavings !== undefined) row.monthly_savings = patch.monthlySavings;
  if (patch.callStartedAt !== undefined) row.call_started_at = patch.callStartedAt;
  if (patch.callEndedAt !== undefined) row.call_ended_at = patch.callEndedAt;
  if (patch.callDurationSeconds !== undefined) row.call_duration_seconds = patch.callDurationSeconds;
  if (patch.callSid !== undefined) row.call_sid = patch.callSid;
  if (patch.voiceRecordingUrl !== undefined) row.voice_recording_url = patch.voiceRecordingUrl;
  if (patch.transcriptUrl !== undefined) row.transcript_url = patch.transcriptUrl;
  if (patch.notes !== undefined) row.notes = patch.notes;

  const { error } = await supabase
    .from('bill_negotiations')
    .update(row)
    .eq('id', negotiationId);
  if (error) throw new Error(`updateNegotiation failed: ${error.message}`);
}

/** Stamp bills.last_negotiated_at after a completed attempt. */
export async function markBillNegotiated(billId: string, when: string): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from('bills')
    .update({ last_negotiated_at: when })
    .eq('id', billId);
  if (error) throw new Error(`markBillNegotiated failed: ${error.message}`);
}
