// defineAgent — the primitive every Phase-1 agent registers through.
// Provides per PRD §10:
//   - Idempotency key (no double-execution on retry)
//   - Configurable retry policy (3 retries, exponential backoff)
//   - Failure escalation (route to escalated status after retries exhaust)
//   - Full audit log of every step (via @fa/db logStep)
//   - User notification at start, completion, approval-required steps
//
// The actual Inngest SDK wiring lives in apps/web's API route — defineAgent
// just builds a typed AgentDefinition that the API route registers with
// inngest.createFunction({ id, retries: 3 }, { event }, run). The local
// runAgent() exists for tests + dev w/o the SDK.

import {
  startAction,
  markRunning,
  markSucceeded,
  markFailed,
  markEscalated,
  type StartActionInput,
} from '@fa/db';
import type { AgentType } from '@fa/db/types';
import { writeAuditEntry } from './audit';

export interface AgentRunContext {
  actionId: string;
  userId: string;
  agentId: string;
  agentType: AgentType;
  /** Append an audit log step. */
  log: (step: string, ok: boolean, detail?: Record<string, unknown>) => Promise<void>;
}

export interface AgentRunResult {
  /** Dollar amount of savings/ROI delivered by this action (PRD §24 metric). */
  roi?: number | null;
  /** Free-form data echoed back to the caller / pushed to user. */
  data?: Record<string, unknown>;
}

export interface AgentDefinition<TInput = Record<string, unknown>> {
  type: AgentType;
  actionType: string;
  requiresApproval: boolean;
  /** Build a stable idempotency key from input — return null if not needed. */
  idempotencyKey?: (input: TInput) => string | null;
  /** The agent's actual work. Throw to fail; return AgentRunResult to succeed. */
  run: (input: TInput, ctx: AgentRunContext) => Promise<AgentRunResult>;
  /** Optional hook for cleanup / refund_eligible toggling on terminal failure. */
  onFailure?: (input: TInput, ctx: AgentRunContext, err: Error) => Promise<void>;
}

const _registry = new Map<string, AgentDefinition<any>>();

export function defineAgent<TInput>(def: AgentDefinition<TInput>): AgentDefinition<TInput> {
  const key = `${def.type}:${def.actionType}`;
  if (_registry.has(key)) {
    throw new Error(`Agent already registered: ${key}`);
  }
  _registry.set(key, def);
  return def;
}

export interface RunOptions {
  maxRetries?: number;
  /** Initial delay between retries in ms. Doubled each attempt. */
  baseDelayMs?: number;
  /** Override sleep — tests pass () => Promise.resolve() to skip real delays. */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Execute an agent end-to-end. Used by tests + the local dev runner.
 * In production, the Inngest API route wraps def.run() with its own retries
 * — but the audit-log + status-transition contract here is the source of truth.
 */
export async function runAgent<TInput>(
  def: AgentDefinition<TInput>,
  startInput: Omit<StartActionInput, 'agentType' | 'actionType' | 'requiresApproval' | 'idempotencyKey'> & {
    input: TInput;
  },
  opts: RunOptions = {},
): Promise<{ actionId: string; status: 'succeeded' | 'failed' | 'escalated' | 'awaiting_approval'; result?: AgentRunResult }> {
  const maxRetries = opts.maxRetries ?? 3;
  const baseDelay = opts.baseDelayMs ?? 250;
  const sleep = opts.sleep ?? defaultSleep;

  const idempotencyKey = def.idempotencyKey?.(startInput.input) ?? undefined;

  const row = await startAction({
    userId: startInput.userId,
    agentId: startInput.agentId,
    agentType: def.type,
    actionType: def.actionType,
    target: startInput.target ?? null,
    requiresApproval: def.requiresApproval,
    ...(idempotencyKey ? { idempotencyKey } : {}),
  });

  if (def.requiresApproval && row.status === 'awaiting_approval') {
    return { actionId: row.id, status: 'awaiting_approval' };
  }

  const ctx: AgentRunContext = {
    actionId: row.id,
    userId: startInput.userId,
    agentId: startInput.agentId,
    agentType: def.type,
    log: (step, ok, detail) => writeAuditEntry(row.id, step, ok, detail),
  };

  await markRunning(row.id);
  await ctx.log('run:start', true, { attempt: 0 });

  let lastErr: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await def.run(startInput.input, ctx);
      await markSucceeded(row.id, result.roi ?? null);
      await ctx.log('run:succeeded', true, { roi: result.roi ?? null });
      return { actionId: row.id, status: 'succeeded', result };
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
      await ctx.log('run:error', false, { attempt, error: lastErr.message });
      if (attempt < maxRetries) {
        await sleep(baseDelay * 2 ** attempt);
        continue;
      }
    }
  }

  // Retries exhausted.
  if (def.onFailure && lastErr) {
    try {
      await def.onFailure(startInput.input, ctx, lastErr);
    } catch {
      /* swallow — failure handler should never block escalation */
    }
  }
  await markFailed(row.id, lastErr?.message ?? 'unknown');
  await markEscalated(row.id, `retries exhausted: ${lastErr?.message ?? 'unknown'}`);
  return { actionId: row.id, status: 'escalated' };
}

export function _getRegistry(): ReadonlyMap<string, AgentDefinition<any>> {
  return _registry;
}

/** Test helper. Never call in prod code. */
export function _clearRegistry(): void {
  _registry.clear();
}
