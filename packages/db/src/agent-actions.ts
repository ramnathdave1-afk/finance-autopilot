// Typed writers for agent_actions. T3 + T4 import these instead of writing
// to the table directly — keeps the audit_log shape stable and centralizes
// idempotency, status transitions, and ROI bookkeeping.
//
// Per PRD §10:
//   - Idempotency key (no double-execution on retry)
//   - Full audit log of every step
//   - Status transitions: pending → awaiting_approval → approved → running →
//     succeeded | failed | cancelled | escalated

import { createServiceClient } from './client';
import type {
  ActionStatus,
  AgentActionRow,
  AgentAuditStep,
  AgentType,
} from '../types';

export interface StartActionInput {
  userId: string;
  agentId: string;
  agentType: AgentType;
  actionType: string;
  target?: string | null;
  /**
   * Stable per-attempt key. The same (agent_id, idempotency_key) cannot be
   * inserted twice — second call returns the existing row.
   */
  idempotencyKey?: string;
  /** If true, action starts in `awaiting_approval`. If false, in `pending`. */
  requiresApproval?: boolean;
}

/**
 * Create an agent_action row OR return the existing one for the same
 * (agent_id, idempotency_key). Safe to call from inside a retried workflow.
 */
export async function startAction(input: StartActionInput): Promise<AgentActionRow> {
  const supabase = createServiceClient();
  const initialStatus: ActionStatus = input.requiresApproval ? 'awaiting_approval' : 'pending';

  if (input.idempotencyKey) {
    const { data: existing } = await supabase
      .from('agent_actions')
      .select('*')
      .eq('agent_id', input.agentId)
      .eq('idempotency_key', input.idempotencyKey)
      .maybeSingle();
    if (existing) return existing as AgentActionRow;
  }

  const { data, error } = await supabase
    .from('agent_actions')
    .insert({
      user_id: input.userId,
      agent_id: input.agentId,
      agent_type: input.agentType,
      action_type: input.actionType,
      target: input.target ?? null,
      status: initialStatus,
      idempotency_key: input.idempotencyKey ?? null,
      audit_log: [
        {
          ts: new Date().toISOString(),
          step: 'created',
          ok: true,
          detail: { status: initialStatus },
        } satisfies AgentAuditStep,
      ],
    })
    .select('*')
    .single();
  if (error || !data) throw new Error(`startAction failed: ${error?.message}`);
  return data as AgentActionRow;
}

/** Append one audit step. Concurrency-safe via array_append-style write. */
export async function logStep(actionId: string, step: Omit<AgentAuditStep, 'ts'> & { ts?: string }): Promise<void> {
  const supabase = createServiceClient();
  const entry: AgentAuditStep = { ts: step.ts ?? new Date().toISOString(), step: step.step, ok: step.ok, detail: step.detail };

  // jsonb concat — read-modify-write is fine because each action is owned by
  // exactly one workflow run at a time (Inngest enforces single-flight per id).
  const { data: row, error: readErr } = await supabase
    .from('agent_actions')
    .select('audit_log')
    .eq('id', actionId)
    .single();
  if (readErr || !row) throw new Error(`logStep read failed: ${readErr?.message}`);
  const next = [...(row.audit_log ?? []), entry];

  const { error } = await supabase
    .from('agent_actions')
    .update({ audit_log: next })
    .eq('id', actionId);
  if (error) throw new Error(`logStep write failed: ${error.message}`);
}

export async function approveAction(actionId: string): Promise<void> {
  await transition(actionId, 'approved', { approved_at: new Date().toISOString() });
}

export async function markRunning(actionId: string): Promise<void> {
  await transition(actionId, 'running', { started_at: new Date().toISOString() });
}

export async function markSucceeded(actionId: string, roiAmount: number | null = null): Promise<void> {
  await transition(actionId, 'succeeded', {
    completed_at: new Date().toISOString(),
    roi_amount: roiAmount,
  });
}

export async function markFailed(actionId: string, errorMessage: string): Promise<void> {
  await transition(actionId, 'failed', {
    completed_at: new Date().toISOString(),
    error_message: errorMessage,
  });
}

export async function markEscalated(actionId: string, reason: string): Promise<void> {
  await transition(actionId, 'escalated', { error_message: reason });
}

export async function markCancelled(actionId: string): Promise<void> {
  await transition(actionId, 'cancelled', { completed_at: new Date().toISOString() });
}

async function transition(
  actionId: string,
  status: ActionStatus,
  extra: Record<string, unknown>,
): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from('agent_actions')
    .update({ status, ...extra })
    .eq('id', actionId);
  if (error) throw new Error(`transition to ${status} failed: ${error.message}`);
  await logStep(actionId, { step: `status:${status}`, ok: status !== 'failed', detail: extra });
}

/** Lifetime ROI across all succeeded actions for a user (PRD §14 transparency surface). */
export async function totalRoi(userId: string): Promise<number> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('agent_actions')
    .select('roi_amount')
    .eq('user_id', userId)
    .eq('status', 'succeeded')
    .not('roi_amount', 'is', null);
  if (error) throw new Error(error.message);
  return (data ?? []).reduce((sum, r) => sum + Number(r.roi_amount ?? 0), 0);
}
