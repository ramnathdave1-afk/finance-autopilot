// Thin typed wrapper over @fa/db's createServiceClient for the `disputes` table
// (created in packages/db/migrations/phase2_T2_tier2_tables.sql — DO NOT
// recreate). Isolated so tests can mock just this surface, mirroring
// subscription-killer's subscription-lookup.ts.
//
// Status transitions follow the DisputeStatus enum:
//   detected → awaiting_user → filing → filed → resolved_won | resolved_lost
//   (and any → cancelled)

import { createServiceClient } from '@fa/db';
import type { DisputeRow, DisputeStatus, TransactionRow } from '@fa/db/types';

/** Columns we need from a transaction to build a dispute candidate. */
export type DisputeTxn = Pick<
  TransactionRow,
  'id' | 'user_id' | 'account_id' | 'amount' | 'merchant' | 'date'
>;

export async function getTransaction(transactionId: string): Promise<DisputeTxn | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('transactions')
    .select('id, user_id, account_id, amount, merchant, date')
    .eq('id', transactionId)
    .maybeSingle();
  if (error) throw new Error(`getTransaction failed: ${error.message}`);
  return (data ?? null) as DisputeTxn | null;
}

/**
 * The unique partial index `disputes_txn_open_uniq` forbids two open disputes
 * for the same transaction. We check first so we can no-op idempotently rather
 * than surface a constraint error.
 */
export async function findOpenDispute(transactionId: string): Promise<DisputeRow | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('disputes')
    .select('*')
    .eq('transaction_id', transactionId)
    .not('status', 'in', '(resolved_won,resolved_lost,cancelled)')
    .maybeSingle();
  if (error) throw new Error(`findOpenDispute failed: ${error.message}`);
  return (data ?? null) as DisputeRow | null;
}

export interface CreateDisputeInput {
  userId: string;
  transactionId: string;
  agentActionId: string;
  reason: string;
  detectionScore: number | null;
  amount: number;
  bank: string | null;
  evidence: Record<string, unknown>;
  /** Disputes start 'detected'; the agent flips to awaiting_user after surfacing. */
  status?: DisputeStatus;
}

export async function createDispute(input: CreateDisputeInput): Promise<DisputeRow> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('disputes')
    .insert({
      user_id: input.userId,
      transaction_id: input.transactionId,
      agent_action_id: input.agentActionId,
      status: input.status ?? 'detected',
      reason: input.reason,
      detection_score: input.detectionScore,
      amount: input.amount,
      bank: input.bank,
      evidence: input.evidence,
    })
    .select('*')
    .single();
  if (error || !data) throw new Error(`createDispute failed: ${error?.message}`);
  return data as DisputeRow;
}

export interface UpdateDisputeFields {
  status?: DisputeStatus;
  bank_case_id?: string | null;
  recovered_amount?: number | null;
  filed_at?: string | null;
  resolved_at?: string | null;
  evidence?: Record<string, unknown>;
}

export async function updateDispute(
  disputeId: string,
  fields: UpdateDisputeFields,
): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase.from('disputes').update(fields).eq('id', disputeId);
  if (error) throw new Error(`updateDispute(${fields.status ?? 'patch'}) failed: ${error.message}`);
}

/** Move a dispute to a status, stamping the matching timestamp column. */
export async function setDisputeStatus(
  disputeId: string,
  status: DisputeStatus,
  extra: UpdateDisputeFields = {},
): Promise<void> {
  const stamp: UpdateDisputeFields = { status, ...extra };
  if (status === 'filed' && stamp.filed_at === undefined) {
    stamp.filed_at = new Date().toISOString();
  }
  if ((status === 'resolved_won' || status === 'resolved_lost') && stamp.resolved_at === undefined) {
    stamp.resolved_at = new Date().toISOString();
  }
  await updateDispute(disputeId, stamp);
}
