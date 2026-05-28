import { describe, it, expect, beforeEach, vi } from 'vitest';

// Regression test for the production blocker: getRoutableFailures must only
// query status literals that exist in the Postgres `action_status` enum.
// Querying a non-member (e.g. 'refused') makes PostgREST throw
// `invalid input value for enum action_status: "refused"` on EVERY sweep.
// The agent.test.ts JS-array mock would silently accept such a value, so we
// assert the EXACT literals passed to `.in('status', ...)` here.

// Mirror the enum in packages/db/migrations/phase1_T2_init.sql (action_status).
const VALID_ACTION_STATUS = new Set([
  'pending',
  'awaiting_approval',
  'approved',
  'running',
  'succeeded',
  'failed',
  'cancelled',
  'escalated',
]);

interface CapturedIn {
  col: string;
  vals: unknown[];
}
const captured: CapturedIn[] = [];

function chain() {
  const c: Record<string, unknown> = {
    select: () => c,
    eq: () => c,
    in: (col: string, vals: unknown[]) => {
      captured.push({ col, vals });
      return c;
    },
    then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
      resolve({ data: [], error: null }),
  };
  return c;
}

vi.mock('@fa/db', () => ({
  createServiceClient: () => ({ from: () => chain() }),
  startAction: vi.fn(),
  upsertAgent: vi.fn(),
  markEscalated: vi.fn(),
}));

import { getRoutableFailures } from '../src/queue-store';

describe('getRoutableFailures status filter', () => {
  beforeEach(() => {
    captured.length = 0;
  });

  it('only filters on status values that exist in the action_status enum', async () => {
    await getRoutableFailures('user-1');
    const statusFilter = captured.find((c) => c.col === 'status');
    expect(statusFilter).toBeDefined();
    for (const v of statusFilter!.vals) {
      expect(VALID_ACTION_STATUS.has(v as string)).toBe(true);
    }
  });

  it('routes both failed and escalated actions', async () => {
    await getRoutableFailures('user-1');
    const statusFilter = captured.find((c) => c.col === 'status');
    expect(statusFilter!.vals).toEqual(['failed', 'escalated']);
  });
});
