import { describe, it, expect, beforeEach, vi } from 'vitest';

// --- Mock @fa/db BEFORE importing the agent. -------------------------------
// We model just the two surfaces the agent touches: agent_actions (status +
// audit log, via the typed writers) and unclaimed_finds (select + insert).

interface ActionRow {
  id: string;
  user_id: string;
  agent_id: string;
  agent_type: string;
  action_type: string;
  target: string | null;
  status: string;
  idempotency_key: string | null;
  audit_log: Array<{ ts: string; step: string; ok: boolean; detail?: Record<string, unknown> }>;
  roi_amount: number | null;
}

interface FindRow {
  id: string;
  user_id: string;
  source: string;
  state: string | null;
  holder: string | null;
  amount_estimate: string | null;
  property_id: string | null;
  details: Record<string, unknown> | null;
  claim_url: string | null;
  status: string;
  detected_at: string;
}

const dbState = {
  actionsById: new Map<string, ActionRow>(),
  finds: [] as FindRow[],
  insertCalls: 0,
};

const startActionMock = vi.fn(async (input: {
  userId: string; agentId: string; agentType: string; actionType: string;
  target?: string | null; idempotencyKey?: string; requiresApproval?: boolean;
}) => {
  const existing = [...dbState.actionsById.values()].find(
    (a) => a.agent_id === input.agentId && a.idempotency_key === (input.idempotencyKey ?? null),
  );
  if (existing && input.idempotencyKey) return existing;
  const id = `action-${dbState.actionsById.size + 1}`;
  const row: ActionRow = {
    id,
    user_id: input.userId,
    agent_id: input.agentId,
    agent_type: input.agentType,
    action_type: input.actionType,
    target: input.target ?? null,
    status: input.requiresApproval ? 'awaiting_approval' : 'pending',
    idempotency_key: input.idempotencyKey ?? null,
    audit_log: [],
    roi_amount: null,
  };
  dbState.actionsById.set(id, row);
  return row;
});

const logStepMock = vi.fn(async (actionId: string, step: { step: string; ok: boolean; detail?: Record<string, unknown> }) => {
  const row = dbState.actionsById.get(actionId);
  if (row) row.audit_log.push({ ts: new Date().toISOString(), ...step });
});

const transition = (actionId: string, status: string, extra?: Record<string, unknown>) => {
  const row = dbState.actionsById.get(actionId);
  if (row) {
    row.status = status;
    if (extra?.roi_amount !== undefined) row.roi_amount = extra.roi_amount as number | null;
    row.audit_log.push({ ts: new Date().toISOString(), step: `status:${status}`, ok: status !== 'failed', detail: extra ?? {} });
  }
};

let findCounter = 0;

vi.mock('@fa/db', () => ({
  startAction: (...args: unknown[]) => startActionMock(...(args as Parameters<typeof startActionMock>)),
  logStep: (...args: unknown[]) => logStepMock(...(args as Parameters<typeof logStepMock>)),
  markRunning: async (id: string) => transition(id, 'running'),
  markSucceeded: async (id: string, roi: number | null) => transition(id, 'succeeded', { roi_amount: roi }),
  markFailed: async (id: string, msg: string) => transition(id, 'failed', { error_message: msg }),
  markEscalated: async (id: string, reason: string) => transition(id, 'escalated', { reason }),
  createServiceClient: () => ({
    from(table: string) {
      if (table !== 'unclaimed_finds') throw new Error(`unexpected table ${table}`);
      let userFilter = '';
      const chain = {
        select: () => chain,
        eq: (_col: string, val: string) => {
          userFilter = val;
          return chain;
        },
        // getExistingFinds awaits the select().eq() chain directly.
        then: (resolve: (v: { data: FindRow[]; error: null }) => unknown) =>
          resolve({ data: dbState.finds.filter((f) => f.user_id === userFilter), error: null }),
        insert: (rows: Array<Omit<FindRow, 'id' | 'detected_at'>>) => ({
          select: async () => {
            dbState.insertCalls += 1;
            const created = rows.map((r) => {
              const row: FindRow = {
                ...r,
                id: `find-${++findCounter}`,
                detected_at: new Date().toISOString(),
              } as FindRow;
              dbState.finds.push(row);
              return row;
            });
            return { data: created, error: null };
          },
        }),
      };
      return chain;
    },
  }),
}));

vi.mock('@fa/inngest', async () => {
  const actual = await vi.importActual<typeof import('@fa/inngest')>('@fa/inngest');
  return actual;
});

// --- Now import the agent + harness. ---------------------------------------

import { runAgent } from '@fa/inngest';
import { missingMoneyAgent } from '../src/agent';
import {
  setUnclaimedPropertyPortFactory,
  resetUnclaimedPropertyPortFactory,
  createMockPort,
  type UnclaimedHit,
  type SearchSubject,
} from '../src/unclaimed-property-port';

const SUBJECT: SearchSubject = {
  fullName: 'Jane Q Public',
  aliases: ['Jane Public'],
  addresses: [{ city: 'Phoenix', state: 'AZ' }],
  employers: ['Acme Corp'],
  states: ['AZ', 'CA'],
};

const run = (subjectName = SUBJECT.fullName) =>
  runAgent(
    missingMoneyAgent,
    { userId: 'user-1', agentId: 'agent-mm-1', input: { subject: { ...SUBJECT, fullName: subjectName } } },
    { sleep: () => Promise.resolve() },
  );

const hit = (over: Partial<UnclaimedHit> = {}): UnclaimedHit => ({
  source: 'naupa',
  propertyId: 'NAUPA-123',
  state: 'AZ',
  holder: 'Old Bank NA',
  amountEstimate: 'Under $100',
  claimUrl: 'https://missingmoney.com/claim/NAUPA-123',
  details: { matchedName: 'Jane Q Public' },
  ...over,
});

describe('missingMoneyAgent', () => {
  beforeEach(() => {
    dbState.actionsById.clear();
    dbState.finds.length = 0;
    dbState.insertCalls = 0;
    findCounter = 0;
    startActionMock.mockClear();
    logStepMock.mockClear();
    resetUnclaimedPropertyPortFactory();
  });

  it('match found: records new finds and returns them with roi:null', async () => {
    setUnclaimedPropertyPortFactory(() =>
      createMockPort([
        hit(),
        hit({ source: 'missingmoney', propertyId: 'MM-999', holder: 'Utility Co', amountEstimate: 'Under $50' }),
      ]),
    );

    const result = await run();
    expect(result.status).toBe('succeeded');
    expect(result.result?.roi).toBeNull();

    const data = result.result?.data as { hitCount: number; duplicateCount: number; newFinds: unknown[] };
    expect(data.hitCount).toBe(2);
    expect(data.duplicateCount).toBe(0);
    expect(data.newFinds).toHaveLength(2);

    // Rows persisted to unclaimed_finds with status 'detected'.
    expect(dbState.finds).toHaveLength(2);
    expect(dbState.finds.every((f) => f.status === 'detected')).toBe(true);
    expect(dbState.finds.every((f) => f.user_id === 'user-1')).toBe(true);

    // Audit trail present.
    const row = dbState.actionsById.get(result.actionId)!;
    const steps = row.audit_log.map((s) => s.step);
    expect(steps).toContain('status:running');
    expect(steps).toContain('search:done');
    expect(steps).toContain('finds:recorded');
  });

  it('no match: succeeds, inserts nothing, returns empty find set', async () => {
    setUnclaimedPropertyPortFactory(() => createMockPort([]));

    const result = await run();
    expect(result.status).toBe('succeeded');

    const data = result.result?.data as { hitCount: number; newFinds: unknown[] };
    expect(data.hitCount).toBe(0);
    expect(data.newFinds).toHaveLength(0);

    // No insert call when there's nothing to write.
    expect(dbState.insertCalls).toBe(0);
    expect(dbState.finds).toHaveLength(0);
  });

  it('dedupe: a find already on file is not re-inserted', async () => {
    // Seed an already-recorded find (same source + property_id).
    dbState.finds.push({
      id: 'find-existing',
      user_id: 'user-1',
      source: 'naupa',
      state: 'AZ',
      holder: 'Old Bank NA',
      amount_estimate: 'Under $100',
      property_id: 'NAUPA-123',
      details: null,
      claim_url: null,
      status: 'detected',
      detected_at: new Date().toISOString(),
    });

    // Source returns the already-recorded hit PLUS one genuinely new hit.
    setUnclaimedPropertyPortFactory(() =>
      createMockPort([
        hit(), // duplicate of the seeded row (NAUPA-123)
        hit({ source: 'state:az', propertyId: 'AZ-7', holder: 'State of AZ', amountEstimate: 'Under $25' }),
      ]),
    );

    const result = await run();
    expect(result.status).toBe('succeeded');

    const data = result.result?.data as { hitCount: number; duplicateCount: number; newFinds: unknown[] };
    expect(data.hitCount).toBe(2);
    expect(data.duplicateCount).toBe(1);
    expect(data.newFinds).toHaveLength(1);

    // Only the new one was inserted; total finds = seeded + 1.
    expect(dbState.finds).toHaveLength(2);
    expect(dbState.finds.some((f) => f.property_id === 'AZ-7')).toBe(true);
  });

  it('dedupe within a single batch: id-less hits collapse by source+holder+amount', async () => {
    setUnclaimedPropertyPortFactory(() =>
      createMockPort([
        hit({ propertyId: null, source: 'state:ca', holder: 'CA Controller', amountEstimate: 'Under $50' }),
        hit({ propertyId: null, source: 'state:ca', holder: 'CA Controller', amountEstimate: 'Under $50' }),
      ]),
    );

    const result = await run();
    const data = result.result?.data as { duplicateCount: number; newFinds: unknown[] };
    expect(data.duplicateCount).toBe(1);
    expect(data.newFinds).toHaveLength(1);
    expect(dbState.finds).toHaveLength(1);
  });
});
