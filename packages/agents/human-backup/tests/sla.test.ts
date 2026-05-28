import { describe, it, expect } from 'vitest';
import {
  SLA_HOURS,
  slaDeadline,
  isSlaBreached,
  minutesUntilBreach,
  queueKey,
  routeReason,
  selectToEnqueue,
  isOpen,
  type RoutableAction,
  type QueuedAction,
} from '../src/sla';

const action = (over: Partial<RoutableAction> = {}): RoutableAction => ({
  id: 'src-1',
  user_id: 'user-1',
  agent_id: 'agent-x',
  agent_type: 'subscription_killer',
  action_type: 'cancel_subscription',
  target: 'Netflix',
  status: 'failed',
  ...over,
});

describe('slaDeadline', () => {
  it('adds 24h by default (PRD §8.4)', () => {
    expect(SLA_HOURS).toBe(24);
    expect(slaDeadline('2026-05-28T00:00:00.000Z')).toBe('2026-05-29T00:00:00.000Z');
  });

  it('honors a custom window', () => {
    expect(slaDeadline('2026-05-28T00:00:00.000Z', 4)).toBe('2026-05-28T04:00:00.000Z');
  });

  it('throws on an invalid enqueue instant', () => {
    expect(() => slaDeadline('not-a-date')).toThrow(/invalid date/);
  });
});

describe('isSlaBreached', () => {
  const deadline = '2026-05-29T00:00:00.000Z';

  it('false before the deadline', () => {
    expect(isSlaBreached(deadline, '2026-05-28T23:59:59.000Z')).toBe(false);
  });

  it('true after the deadline', () => {
    expect(isSlaBreached(deadline, '2026-05-29T00:00:01.000Z')).toBe(true);
  });

  it('false at exactly the deadline (grace through the instant)', () => {
    expect(isSlaBreached(deadline, '2026-05-29T00:00:00.000Z')).toBe(false);
  });

  it('never breached without a deadline', () => {
    expect(isSlaBreached(null, '2030-01-01T00:00:00.000Z')).toBe(false);
    expect(isSlaBreached(undefined, '2030-01-01T00:00:00.000Z')).toBe(false);
  });
});

describe('minutesUntilBreach', () => {
  it('positive before, negative after', () => {
    expect(minutesUntilBreach('2026-05-28T01:00:00.000Z', '2026-05-28T00:30:00.000Z')).toBe(30);
    expect(minutesUntilBreach('2026-05-28T00:00:00.000Z', '2026-05-28T00:30:00.000Z')).toBe(-30);
  });
});

describe('queueKey + routeReason', () => {
  it('queueKey is stable per source action id', () => {
    expect(queueKey({ id: 'abc' })).toBe('human-backup:abc');
  });

  it('maps statuses + reconnect to reasons', () => {
    expect(routeReason({ status: 'failed', action_type: 'cancel_subscription' })).toBe('agent_failed');
    expect(routeReason({ status: 'escalated', action_type: 'cancel_subscription' })).toBe('agent_escalated');
    // 'refused' is not a member of the action_status enum, so it can never be
    // queried/returned; an unknown status falls through to the 'agent_failed'
    // default (see queue-store.getRoutableFailures — only failed/escalated).
    expect(routeReason({ status: 'awaiting_approval', action_type: 'reconnect_bank' })).toBe('reconnect_bank');
  });
});

describe('selectToEnqueue (dedupe of already-queued)', () => {
  it('routes a fresh failure with no existing queue entry', () => {
    const out = selectToEnqueue([action()], []);
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe('src-1');
  });

  it('skips a failure that already has a queue entry (open OR resolved)', () => {
    const existing: QueuedAction[] = [
      { idempotency_key: queueKey({ id: 'src-1' }), status: 'awaiting_approval' },
    ];
    expect(selectToEnqueue([action()], existing)).toHaveLength(0);

    const resolved: QueuedAction[] = [
      { idempotency_key: queueKey({ id: 'src-1' }), status: 'approved' },
    ];
    expect(selectToEnqueue([action()], resolved)).toHaveLength(0);
  });

  it('dedupes duplicate candidates within a single sweep', () => {
    const out = selectToEnqueue([action(), action()], []);
    expect(out).toHaveLength(1);
  });

  it('routes only the not-yet-queued subset', () => {
    const candidates = [action({ id: 'src-1' }), action({ id: 'src-2' })];
    const existing: QueuedAction[] = [
      { idempotency_key: queueKey({ id: 'src-1' }), status: 'awaiting_approval' },
    ];
    const out = selectToEnqueue(candidates, existing);
    expect(out.map((a) => a.id)).toEqual(['src-2']);
  });

  it('ignores queue entries with null idempotency_key', () => {
    const existing: QueuedAction[] = [{ idempotency_key: null, status: 'awaiting_approval' }];
    expect(selectToEnqueue([action()], existing)).toHaveLength(1);
  });
});

describe('isOpen', () => {
  it('open vs resolved', () => {
    expect(isOpen('awaiting_approval')).toBe(true);
    expect(isOpen('pending')).toBe(true);
    expect(isOpen('running')).toBe(true);
    expect(isOpen('succeeded')).toBe(false);
    expect(isOpen('cancelled')).toBe(false);
    expect(isOpen('escalated')).toBe(false);
  });
});
