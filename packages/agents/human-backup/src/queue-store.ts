// Thin @fa/db wrapper for the Human Backup queue. Isolated so tests can mock
// just this surface (same shape as missing-money's finds-store.ts).
//
// The queue is NOT a new table — it lives in agent_actions as rows on the
// user's `human_backup` agent. A queue entry is an `awaiting_approval` action
// of action_type 'human_review' whose idempotency_key encodes the source
// action it covers (see sla.queueKey). This is exactly how @fa/plaid/router
// already parks `reconnect_bank` actions on the human_backup agent, so the
// existing feed query (status='awaiting_approval') surfaces both uniformly.

import { createServiceClient, startAction, upsertAgent, markEscalated } from '@fa/db';
import type { AgentType } from '@fa/db/types';
import type { RoutableAction, QueuedAction } from './sla';

const HUMAN_BACKUP: AgentType = 'human_backup';

/**
 * Load every failed / escalated action for a user that a human may need to take
 * over. Excludes the human_backup agent's own queue entries so we never route
 * the queue to itself. (Only statuses that exist in the action_status enum are
 * queried — there is no 'refused' enum value, so it is intentionally absent.)
 */
export async function getRoutableFailures(userId: string): Promise<RoutableAction[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('agent_actions')
    .select('id, user_id, agent_id, agent_type, action_type, target, status')
    .eq('user_id', userId)
    .in('status', ['failed', 'escalated']);
  if (error) throw new Error(`getRoutableFailures failed: ${error.message}`);
  return ((data ?? []) as RoutableAction[]).filter((a) => a.agent_type !== HUMAN_BACKUP);
}

/** Load existing human_backup queue entries for a user (any status). */
export async function getQueueEntries(userId: string): Promise<QueuedAction[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('agent_actions')
    .select('idempotency_key, status')
    .eq('user_id', userId)
    .eq('agent_type', HUMAN_BACKUP);
  if (error) throw new Error(`getQueueEntries failed: ${error.message}`);
  return (data ?? []) as QueuedAction[];
}

/** A still-open queue row with the timestamp the SLA deadline derives from. */
export interface OpenQueueRow {
  id: string;
  requested_at: string;
}

/**
 * Load open (awaiting_approval) human_backup queue entries for SLA-breach
 * detection. Only awaiting_approval rows are "owed" a human; resolved entries
 * (approved/succeeded/cancelled/escalated) are out of scope.
 */
export async function getOpenQueueRows(userId: string): Promise<OpenQueueRow[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('agent_actions')
    .select('id, requested_at')
    .eq('user_id', userId)
    .eq('agent_type', HUMAN_BACKUP)
    .eq('status', 'awaiting_approval');
  if (error) throw new Error(`getOpenQueueRows failed: ${error.message}`);
  return (data ?? []) as OpenQueueRow[];
}

/** Ensure the user has a human_backup agent row; returns its id. */
export async function ensureHumanBackupAgent(userId: string): Promise<string> {
  return upsertAgent(userId, HUMAN_BACKUP, 'approve_each', true);
}

export interface EnqueueInput {
  userId: string;
  humanBackupAgentId: string;
  /** The source action being routed. */
  sourceActionId: string;
  /** Stable per-source idempotency key (sla.queueKey). */
  idempotencyKey: string;
  /** Human-readable target (carried from the source action). */
  target: string | null;
}

/**
 * Park one action on the human-review queue and return the queue action id.
 *
 * Idempotency is enforced two ways: the agent only calls this for actions that
 * `selectToEnqueue` already filtered against the existing queue snapshot, AND
 * startAction is idempotency-keyed — so a concurrent sweep that races past the
 * snapshot still returns the same row instead of duplicating. requiresApproval:
 * true lands the entry in `awaiting_approval`, the human-review state.
 */
export async function enqueueForHuman(input: EnqueueInput): Promise<{ id: string }> {
  const row = await startAction({
    userId: input.userId,
    agentId: input.humanBackupAgentId,
    agentType: HUMAN_BACKUP,
    actionType: 'human_review',
    target: input.target,
    idempotencyKey: input.idempotencyKey,
    requiresApproval: true,
  });
  return { id: row.id };
}

/** Mark a breached queue entry escalated (human missed the 24h SLA). */
export async function markBreached(actionId: string, deadlineIso: string): Promise<void> {
  await markEscalated(actionId, `human SLA breached: deadline ${deadlineIso} passed`);
}
