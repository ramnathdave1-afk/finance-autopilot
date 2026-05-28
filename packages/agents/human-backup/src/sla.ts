// Pure SLA + queue logic for the Human Backup agent (PRD §8.4 Agent 16).
//
// No DB, no clock side-effects: every function takes its inputs explicitly so
// it can be unit-tested deterministically. The agent (agent.ts) is the only
// place that touches @fa/db / the wall clock.
//
// PRD §8.4: when any other agent fails or refuses, a human takes over within
// 24 hours. The "deadline" here is `enqueuedAt + 24h`; breach = now past it
// while still unresolved.

/** Hours within which a human must pick up an escalated action (PRD §8.4). */
export const SLA_HOURS = 24;

const HOUR_MS = 3_600_000;

/**
 * agent_actions.status values that mean "a human still owes this action work".
 * In this schema `awaiting_approval` is the human-review state (there is no
 * separate `awaiting_user` enum value — the reconnect_bank flow in
 * @fa/plaid/router emits `requiresApproval:true`, which lands here too).
 */
export const AWAITING_HUMAN_STATUS = 'awaiting_approval' as const;

/** Statuses that are still "open" for the queue (not yet resolved by a human). */
const OPEN_STATUSES = new Set(['pending', 'awaiting_approval', 'approved', 'running']);

/** Compute the 24h SLA deadline ISO string from an enqueue instant. */
export function slaDeadline(enqueuedAtIso: string, hours: number = SLA_HOURS): string {
  const base = new Date(enqueuedAtIso).getTime();
  if (Number.isNaN(base)) throw new Error(`slaDeadline: invalid date ${enqueuedAtIso}`);
  return new Date(base + hours * HOUR_MS).toISOString();
}

/**
 * Is an action past its SLA deadline at `nowIso`? An action with no deadline
 * (never enqueued to the queue) is never breached.
 */
export function isSlaBreached(deadlineIso: string | null | undefined, nowIso: string): boolean {
  if (!deadlineIso) return false;
  const deadline = new Date(deadlineIso).getTime();
  const now = new Date(nowIso).getTime();
  if (Number.isNaN(deadline) || Number.isNaN(now)) return false;
  return now > deadline;
}

/** Whole minutes remaining before breach (negative once breached). */
export function minutesUntilBreach(deadlineIso: string, nowIso: string): number {
  const deadline = new Date(deadlineIso).getTime();
  const now = new Date(nowIso).getTime();
  return Math.floor((deadline - now) / 60_000);
}

/** A failed/escalated action that may need routing to the human queue. */
export interface RoutableAction {
  id: string;
  user_id: string;
  agent_id: string;
  agent_type: string;
  action_type: string;
  target: string | null;
  status: string;
}

/** A queue entry that already exists for this user's human_backup agent. */
export interface QueuedAction {
  /** What this queue entry was created to cover (stored in idempotency_key). */
  idempotency_key: string | null;
  status: string;
}

/**
 * Stable idempotency key for a human-review queue entry covering `action`.
 * One queue entry per source action — re-running the sweep never duplicates.
 */
export function queueKey(action: Pick<RoutableAction, 'id'>): string {
  return `human-backup:${action.id}`;
}

/** Reason an action got routed to a human — recorded on the queue entry. */
export type RouteReason = 'agent_failed' | 'agent_escalated' | 'reconnect_bank';

/** Map a source action's status/type to why it needs a human. */
export function routeReason(action: Pick<RoutableAction, 'status' | 'action_type'>): RouteReason {
  if (action.action_type === 'reconnect_bank') return 'reconnect_bank';
  if (action.status === 'escalated') return 'agent_escalated';
  return 'agent_failed';
}

/**
 * Decide which source actions actually need a NEW queue entry, given the set
 * of queue entries that already exist. Dedupes on queueKey so an action that
 * already has an open OR resolved queue entry is skipped.
 *
 * Pure: callers pass the candidate failures and the existing queue snapshot.
 */
export function selectToEnqueue(
  candidates: RoutableAction[],
  existingQueue: QueuedAction[],
): RoutableAction[] {
  const covered = new Set(
    existingQueue.map((q) => q.idempotency_key).filter((k): k is string => !!k),
  );
  const seen = new Set<string>();
  const out: RoutableAction[] = [];
  for (const c of candidates) {
    const key = queueKey(c);
    if (covered.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

/** Is a queue entry still open (awaiting a human) vs already resolved/closed? */
export function isOpen(status: string): boolean {
  return OPEN_STATUSES.has(status);
}
