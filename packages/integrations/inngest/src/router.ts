// Single Inngest router: turns `agent_action.created` events into actual
// agent execution.
//
// Sequence:
//
//   apps/web dispatchAction()
//        │ startAction → row in agent_actions table
//        ▼
//   sendAgentEvent('agent_action.created', { actionId })
//        │
//        ▼
//   Inngest pulls event → router function (registerRouter())
//        │
//        ▼
//   dispatchActionRouted(actionId)
//        │ load row from @fa/db
//        │ lookup AgentDefinition by (agent_type, action_type)
//        │ hydrate input from row.target + audit_log seed
//        │ markRunning → def.run(ctx) with idempotent retry
//        │ on success → markSucceeded + notifyUser + publishAgentActionUpdate
//        │ on failure → markFailed → markEscalated + onFailure hook
//        ▼
//   Row visible to user via Realtime channel
//
// Event names that downstream agents listen on (per-agent functions for
// granular retries/observability) follow the same pattern:
//   agent/<agent_type>.<action_type>.requested
//
// The router function listens on the umbrella `agent_action.created` event.

import { findAgentByTuple, runAgent, type AgentDefinition, type AgentRunResult } from './define-agent';
import { createServiceClient, markFailed, markEscalated } from '@fa/db';
import type { ActionStatus, AgentType } from '@fa/db/types';
import { notifyUser } from './notify';
import { publishAgentActionUpdate } from './realtime';

export const ROUTER_EVENT = 'agent_action.created' as const;

export function eventNameFor(agentType: AgentType, actionType: string): string {
  return `agent/${agentType}.${actionType}.requested`;
}

export interface DispatchResult {
  actionId: string;
  status: ActionStatus | 'no_agent_registered' | 'action_not_found';
  result?: AgentRunResult;
}

interface ActionRowLite {
  id: string;
  user_id: string;
  agent_id: string;
  agent_type: AgentType;
  action_type: string;
  status: ActionStatus;
  target: string | null;
  audit_log: unknown[];
}

/**
 * Look up an agent_action row, find the matching registered agent, run it.
 * This is the body of the Inngest router function.
 *
 * Hydration: the agent's `input` is built from row.target + an optional seed
 * step in audit_log (first entry with `detail.input` set). Agents that need
 * richer input (auto-saver paycheck context, round-up week-of transactions)
 * MUST seed their input via dispatchAction(...) writing the seed step before
 * the router picks the event up — see TODO(integrate-agent-input-rehydration)
 * in apps/web.
 */
export async function dispatchActionRouted(actionId: string): Promise<DispatchResult> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('agent_actions')
    .select('id, user_id, agent_id, agent_type, action_type, status, target, audit_log')
    .eq('id', actionId)
    .maybeSingle();

  if (error) throw new Error(`router: load action failed: ${error.message}`);
  if (!data) return { actionId, status: 'action_not_found' };

  const row = data as ActionRowLite;

  // Already terminal? Treat as no-op (Inngest may redeliver).
  if (row.status === 'succeeded' || row.status === 'failed' || row.status === 'escalated' || row.status === 'cancelled') {
    return { actionId, status: row.status };
  }

  // Awaiting approval — frontend will fire a separate dispatch when approved.
  if (row.status === 'awaiting_approval') {
    return { actionId, status: 'awaiting_approval' };
  }

  const def = findAgentByTuple(row.agent_type, row.action_type);
  if (!def) {
    await markFailed(actionId, `no agent registered for ${row.agent_type}:${row.action_type}`);
    await markEscalated(actionId, 'no_agent_registered');
    return { actionId, status: 'no_agent_registered' };
  }

  const input = hydrateInput(row, def);

  const runRes = await runAgent(
    def,
    {
      userId: row.user_id,
      agentId: row.agent_id,
      target: row.target,
      input,
    },
    { existingActionId: actionId },
  );

  // Fire user-facing notifications + realtime update. Best-effort — failures
  // here do not undo the agent's run.
  const friendly = friendlyMessage(row.agent_type, row.action_type, runRes.status, runRes.result?.roi ?? null);
  if (friendly) {
    await notifyUser(row.user_id, friendly);
  }
  await publishAgentActionUpdate({
    type: 'agent_action.updated',
    actionId,
    userId: row.user_id,
    status: runRes.status as ActionStatus,
    agentType: row.agent_type,
    actionType: row.action_type,
    roi: runRes.result?.roi ?? null,
  });

  return { actionId, status: runRes.status as DispatchResult['status'], ...(runRes.result ? { result: runRes.result } : {}) };
}

function hydrateInput<T>(row: ActionRowLite, def: AgentDefinition<T>): T {
  // Convention: dispatchAction seeds the first audit_log entry with detail.input
  // when the agent needs richer-than-target context. Otherwise fall back to
  // a minimal { target } shape — agents must tolerate it or seed properly.
  for (const step of row.audit_log as Array<{ step?: string; detail?: { input?: T } }>) {
    if (step && step.step === 'created' && step.detail && step.detail.input !== undefined) {
      return step.detail.input;
    }
  }
  // No seed — synthesize { target } and let the agent's TS type widen as needed.
  return { target: row.target } as unknown as T;
}

function friendlyMessage(
  agentType: AgentType,
  actionType: string,
  status: string,
  roi: number | null,
): { title: string; body: string } | null {
  if (status === 'succeeded') {
    const dollars = roi == null ? '' : ` Saved $${roi.toFixed(0)}/yr.`;
    switch (agentType) {
      case 'subscription_killer':
        return { title: 'Cancellation complete', body: `Cancelled successfully.${dollars}` };
      case 'spending_coach':
        return { title: 'New insight', body: 'Tap to see what we found in your spending.' };
      case 'daily_brief':
        return { title: 'Good morning', body: 'Your daily brief is ready.' };
      case 'auto_saver':
        return { title: 'Allocation proposed', body: 'Tap to review your paycheck split.' };
      case 'round_up_investor':
        return { title: 'Round-up ready', body: 'This week\'s spare change is ready to sweep.' };
      default:
        return { title: 'Agent finished', body: `${agentType.replace(/_/g, ' ')} completed.` };
    }
  }
  if (status === 'escalated' || status === 'failed') {
    return {
      title: 'Agent paused',
      body: `We hit an issue on ${agentType.replace(/_/g, ' ')}. We\'ll review and follow up.`,
    };
  }
  return null;
}
