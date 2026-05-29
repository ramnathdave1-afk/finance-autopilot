import { describe, it, expect, beforeEach, vi } from 'vitest';

// --- Mocks must be declared BEFORE importing the agent. -------------------

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

interface NegRow {
  id: string;
  user_id: string;
  bill_id: string;
  agent_action_id: string | null;
  status: string;
  target_amount: number | null;
  achieved_amount: number | null;
  monthly_savings: number | null;
  call_started_at: string | null;
  call_ended_at: string | null;
  call_duration_seconds: number | null;
  call_sid: string | null;
  call_script: string | null;
  voice_recording_url: string | null;
  transcript_url: string | null;
  notes: string | null;
}

const dbState = {
  actionsById: new Map<string, ActionRow>(),
  bills: new Map<string, { id: string; user_id: string; provider_name: string; account_number_masked: string | null; current_amount: number; billing_period: string | null; last_negotiated_at: string | null }>(),
  negotiations: new Map<string, NegRow>(),
  negSeq: 0,
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

function makeNegChain() {
  let col = '';
  let val = '';
  const resolve = () => {
    if (col === 'agent_action_id') {
      // Most-recent (highest negSeq) row for this action id.
      const matches = [...dbState.negotiations.values()].filter((n) => n.agent_action_id === val);
      return matches.length ? matches[matches.length - 1] : null;
    }
    // Default: lookup by primary id.
    return dbState.negotiations.get(val) ?? null;
  };
  const chain = {
    select: () => chain,
    eq: (c: string, v: string) => {
      col = c;
      val = v;
      return chain;
    },
    order: (_c: string, _opts: unknown) => chain,
    limit: (_n: number) => chain,
    maybeSingle: async () => ({ data: resolve(), error: null }),
    single: async () => ({ data: resolve(), error: null }),
  };
  return chain;
}

// createServiceClient is a vi.fn so individual tests can swap the backing
// client (e.g. to simulate a failing call_sid write). Default → defaultClient().
const createServiceClientMock = vi.fn(() => defaultClient());

vi.mock('@fa/db', () => ({
  startAction: (...a: unknown[]) => startActionMock(...(a as Parameters<typeof startActionMock>)),
  logStep: (...a: unknown[]) => logStepMock(...(a as Parameters<typeof logStepMock>)),
  markRunning: async (id: string) => transition(id, 'running'),
  markSucceeded: async (id: string, roi: number | null) => transition(id, 'succeeded', { roi_amount: roi }),
  markFailed: async (id: string, msg: string) => transition(id, 'failed', { error_message: msg }),
  markEscalated: async (id: string, reason: string) => transition(id, 'escalated', { reason }),
  createServiceClient: () => createServiceClientMock(),
}));

function defaultClient() {
  return {
    from(table: string) {
      if (table === 'bills') {
        let capturedId = '';
        const chain = {
          select: () => chain,
          eq: (_c: string, val: string) => {
            capturedId = val;
            return chain;
          },
          maybeSingle: async () => ({ data: dbState.bills.get(capturedId) ?? null, error: null }),
          update: (patch: { last_negotiated_at?: string }) => ({
            eq: async (_c: string, id: string) => {
              const b = dbState.bills.get(id);
              if (b && patch.last_negotiated_at) b.last_negotiated_at = patch.last_negotiated_at;
              return { error: null };
            },
          }),
        };
        return chain;
      }
      if (table === 'bill_negotiations') {
        const insertRow = (row: Record<string, unknown>): NegRow => {
          dbState.negSeq += 1;
          const id = `neg-${dbState.negSeq}`;
          const neg: NegRow = {
            id,
            user_id: row.user_id as string,
            bill_id: row.bill_id as string,
            agent_action_id: (row.agent_action_id as string) ?? null,
            status: (row.status as string) ?? 'pending',
            target_amount: (row.target_amount as number) ?? null,
            achieved_amount: null,
            monthly_savings: null,
            call_started_at: null,
            call_ended_at: null,
            call_duration_seconds: null,
            call_sid: null,
            call_script: (row.call_script as string) ?? null,
            voice_recording_url: null,
            transcript_url: null,
            notes: null,
          };
          dbState.negotiations.set(id, neg);
          return neg;
        };
        return {
          insert: (row: Record<string, unknown>) => ({
            select: () => ({
              single: async () => ({ data: insertRow(row), error: null }),
            }),
          }),
          // upsert(onConflict: agent_action_id, ignoreDuplicates) — DO NOTHING
          // on conflict. The FULL unique index on agent_action_id is what backs
          // this; a duplicate action id must NOT create a second row.
          upsert: (row: Record<string, unknown>, _opts: unknown) => {
            const actionId = row.agent_action_id as string;
            const dup = [...dbState.negotiations.values()].find(
              (n) => n.agent_action_id === actionId,
            );
            if (!dup) insertRow(row);
            return Promise.resolve({ error: null });
          },
          update: (patch: Record<string, unknown>) => ({
            eq: async (_c: string, id: string) => {
              const neg = dbState.negotiations.get(id);
              if (neg) Object.assign(neg, patch);
              return { error: null };
            },
          }),
          select: () => makeNegChain(),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

// Mock @fa/claude — script gen + outcome analysis. The outcome verdict is
// driven per-test via claudeOutcome.
const claudeOutcome = { savingsAchieved: true, achievedAmount: 60, reason: 'rep agreed to $60' };
const claudeCall = vi.fn(async (opts: { tag?: string }) => {
  const tag = opts.tag ?? '';
  const text = tag.startsWith('bill-neg:script')
    ? JSON.stringify({ script: 'Hello, I am calling about my bill...' })
    : JSON.stringify(claudeOutcome);
  return { text, inputTokens: 10, outputTokens: 10, cacheReadTokens: 0, cacheCreateTokens: 0, model: 'test', latencyMs: 1 };
});
vi.mock('@fa/claude', () => ({ call: (...a: unknown[]) => claudeCall(...(a as [{ tag?: string }])) }));

vi.mock('@fa/inngest', async () => {
  const actual = await vi.importActual<typeof import('@fa/inngest')>('@fa/inngest');
  return actual;
});

// --- Now the agent + harness. --------------------------------------------

import { runAgent } from '@fa/inngest';
import {
  setAdapter,
  _resetAdapter,
  type TwilioPort,
  type PlaceCallInput,
  type PlacedCall,
  type CallStatus,
  type CallStatusValue,
  type CallRecording,
  type TtsInput,
  type TtsResult,
} from '@fa/twilio';
import { billNegotiationAgent } from '../src/agent';

// Local scriptable mock of the TwilioPort. Mirrors @fa/twilio's
// MockTwilioAdapter — kept in this package's tests so the agent's unit tests
// stay self-contained (no cross-package test-dir imports).
interface MockOpts {
  placeStatus?: CallStatusValue;
  finalStatus?: CallStatusValue;
  durationSeconds?: number;
  recordingUrl?: string | null;
  transcriptText?: string | null;
}
class MockTwilioAdapter implements TwilioPort {
  constructor(private readonly opts: MockOpts = {}) {}
  placeCall = vi.fn(async (input: PlaceCallInput): Promise<PlacedCall> => ({
    callSid: `CA_${input.idempotencyKey}`,
    status: this.opts.placeStatus ?? 'in-progress',
  }));
  getCallStatus = vi.fn(async (callSid: string): Promise<CallStatus> => {
    const status = this.opts.finalStatus ?? 'completed';
    const connected = status === 'completed';
    return {
      callSid,
      status,
      durationSeconds: connected ? (this.opts.durationSeconds ?? 240) : null,
      startedAt: '2026-05-28T17:00:00.000Z',
      endedAt: connected ? '2026-05-28T17:04:00.000Z' : null,
    };
  });
  getRecording = vi.fn(async (callSid: string): Promise<CallRecording> => ({
    callSid,
    recordingUrl:
      this.opts.recordingUrl === undefined
        ? `https://recordings.twilio.test/${callSid}.mp3`
        : this.opts.recordingUrl,
    transcriptUrl: null,
    transcriptText: this.opts.transcriptText ?? null,
    durationSeconds: this.opts.durationSeconds ?? 240,
  }));
  synthesize = vi.fn(async (_input: TtsInput): Promise<TtsResult> => ({
    audioBytes: new Uint8Array([0x49, 0x44, 0x33]),
    mimeType: 'audio/mpeg',
    durationSec: 1,
  }));
}

const seedBill = (id: string, current: number) => {
  dbState.bills.set(id, {
    id,
    user_id: 'user-1',
    provider_name: 'Comcast',
    account_number_masked: '****1234',
    current_amount: current,
    billing_period: 'monthly',
    last_negotiated_at: null,
  });
};

const runOne = async (billId: string, targetAmount: number) => {
  const args = {
    userId: 'user-1',
    agentId: 'agent-row-1',
    input: {
      billId,
      providerPhone: '+18005551212',
      targetAmount,
      poll: { intervalMs: 1, maxPolls: 5, sleep: () => Promise.resolve() },
    },
  };
  const first = await runAgent(billNegotiationAgent, args, { sleep: () => Promise.resolve() });
  if (first.status === 'awaiting_approval') {
    // Simulate user authorizing the call (PRD §10 approval gate).
    const row = dbState.actionsById.get(first.actionId);
    if (row) row.status = 'pending';
    return runAgent(billNegotiationAgent, args, { sleep: () => Promise.resolve() });
  }
  return first;
};

describe('billNegotiationAgent', () => {
  beforeEach(() => {
    dbState.actionsById.clear();
    dbState.bills.clear();
    dbState.negotiations.clear();
    dbState.negSeq = 0;
    claudeCall.mockClear();
    claudeOutcome.savingsAchieved = true;
    claudeOutcome.achievedAmount = 60;
    claudeOutcome.reason = 'rep agreed to $60';
    createServiceClientMock.mockReset();
    createServiceClientMock.mockImplementation(() => defaultClient());
    _resetAdapter();
  });

  it('happy path — savings achieved, roi = (current - target) * 12, recording stored', async () => {
    seedBill('bill-1', 90);
    setAdapter(
      new MockTwilioAdapter({
        finalStatus: 'completed',
        durationSeconds: 247,
        transcriptText: 'Agent: ... Rep: I can drop you to $60/mo. Agent: Great.',
      }),
    );

    const res = await runOne('bill-1', 60);
    expect(res.status).toBe('succeeded');
    // achieved 60 from transcript → savings 30/mo → roi 360.
    expect(res.result?.roi).toBe(360);
    expect(res.result?.data?.savingsAchieved).toBe(true);
    // Idempotency key is derived from the stable actionId+billId (not neg.id)
    // so retries never re-dial. The mock echoes it into the call SID.
    expect(res.result?.data?.recordingUrl).toContain('CA_bill-neg:action-1:bill-1');

    const neg = dbState.negotiations.get('neg-1');
    expect(neg?.status).toBe('succeeded');
    expect(neg?.achieved_amount).toBe(60);
    expect(neg?.monthly_savings).toBe(30);
    expect(neg?.voice_recording_url).toContain('.mp3');
    expect(neg?.call_duration_seconds).toBe(247);
    // bill stamped
    expect(dbState.bills.get('bill-1')?.last_negotiated_at).not.toBeNull();
  });

  it('no-savings path — call completes but rep refuses, status no_savings, roi 0', async () => {
    seedBill('bill-2', 90);
    claudeOutcome.savingsAchieved = false;
    claudeOutcome.achievedAmount = null as unknown as number;
    claudeOutcome.reason = 'rep declined any reduction';
    setAdapter(
      new MockTwilioAdapter({
        finalStatus: 'completed',
        transcriptText: 'Rep: Sorry, no discounts available.',
      }),
    );

    const res = await runOne('bill-2', 60);
    expect(res.status).toBe('succeeded');
    expect(res.result?.roi).toBe(0);
    expect(res.result?.data?.savingsAchieved).toBe(false);

    const neg = dbState.negotiations.get('neg-1');
    expect(neg?.status).toBe('no_savings');
    expect(neg?.achieved_amount).toBeNull();
    expect(neg?.voice_recording_url).toContain('.mp3');
  });

  it('call-failed path — call never connects, agent escalates', async () => {
    seedBill('bill-3', 90);
    setAdapter(
      new MockTwilioAdapter({
        placeStatus: 'initiated',
        finalStatus: 'no-answer',
      }),
    );

    const res = await runOne('bill-3', 60);
    expect(res.status).toBe('escalated');

    const neg = dbState.negotiations.get('neg-1');
    expect(neg?.status).toBe('failed');
    expect(neg?.voice_recording_url).toBeNull();

    // Status trail recorded.
    const row = dbState.actionsById.get(res.actionId);
    const steps = (row?.audit_log ?? []).map((s) => s.step);
    expect(steps).toContain('status:running');
    expect(steps).toContain('status:escalated');
  });

  it('no-op when target is not below current — no call placed, roi 0', async () => {
    seedBill('bill-4', 50);
    const mock = new MockTwilioAdapter({ finalStatus: 'completed' });
    setAdapter(mock);

    const res = await runOne('bill-4', 60);
    expect(res.status).toBe('succeeded');
    expect(res.result?.roi).toBe(0);
    expect(res.result?.data?.called).toBe(false);
    expect(mock.placeCall).not.toHaveBeenCalled();
  });

  it('retry after placeCall does NOT re-dial — resumes the same call SID', async () => {
    // placeCall succeeds once; the FIRST getCallStatus throws (transient
    // network error) which makes runNegotiation throw → defineAgent retries
    // from the top. The retry must reuse the persisted call_sid and NOT place a
    // second outbound call to the provider's support line.
    seedBill('bill-5', 90);

    class FlakyAdapter extends MockTwilioAdapter {
      statusCalls = 0;
      override getCallStatus = vi.fn(async (callSid: string): Promise<CallStatus> => {
        this.statusCalls += 1;
        if (this.statusCalls === 1) throw new Error('transient network error');
        return {
          callSid,
          status: 'completed',
          durationSeconds: 240,
          startedAt: '2026-05-28T17:00:00.000Z',
          endedAt: '2026-05-28T17:04:00.000Z',
        };
      });
    }
    const mock = new FlakyAdapter({
      transcriptText: 'Rep: I can drop you to $60/mo.',
    });
    setAdapter(mock);

    const res = await runOne('bill-5', 60);
    expect(res.status).toBe('succeeded');
    // placeCall happened EXACTLY once across both attempts — no double-dial.
    expect(mock.placeCall).toHaveBeenCalledTimes(1);
    // Exactly one negotiation row was created (no orphan rows on retry).
    expect(dbState.negotiations.size).toBe(1);
    const neg = dbState.negotiations.get('neg-1');
    expect(neg?.status).toBe('succeeded');
  });

  it('persists the script to call_script BEFORE dialing (TwiML route looks it up by id)', async () => {
    seedBill('bill-script', 90);
    const mock = new MockTwilioAdapter({
      finalStatus: 'completed',
      transcriptText: 'Rep: I can drop you to $60/mo.',
    });
    // Assert the row already carries call_script + status calling at dial time.
    mock.placeCall = vi.fn(async (input: PlaceCallInput): Promise<PlacedCall> => {
      const neg = [...dbState.negotiations.values()][0];
      expect(neg?.status).toBe('calling');
      expect(neg?.call_script).toBe('Hello, I am calling about my bill...');
      // call_sid is NOT yet persisted at the moment we dial.
      expect(neg?.call_sid).toBeNull();
      return { callSid: `CA_${input.idempotencyKey}`, status: 'in-progress' };
    });
    setAdapter(mock);

    const res = await runOne('bill-script', 60);
    expect(res.status).toBe('succeeded');
  });

  it('marker set but call_sid write failed → does NOT re-dial, escalates (no double-dial)', async () => {
    // Reproduce finding 2: placeCall succeeds, then the SEPARATE call_sid write
    // throws (e.g. transient DB error) → runNegotiation throws → defineAgent
    // retries. On the retry the row carries the 'calling' marker but NO
    // call_sid. The agent must NOT place a second call to the provider; it
    // routes to human review and escalates.
    seedBill('bill-7', 90);

    const mock = new MockTwilioAdapter({
      finalStatus: 'completed',
      transcriptText: 'Rep: I can drop you to $60/mo.',
    });
    setAdapter(mock);

    // Swap in a client whose bill_negotiations update FAILS on the dial-result
    // write (the patch that carries only call_sid), simulating the separate
    // call_sid write failing after a successful dial.
    const negs = dbState.negotiations;
    const originalSet = negs.set.bind(negs);
    const failingClient = {
      from(table: string) {
        if (table === 'bill_negotiations') {
          return {
            upsert: (row: Record<string, unknown>, _o: unknown) => {
              const actionId = row.agent_action_id as string;
              const dup = [...negs.values()].find((n) => n.agent_action_id === actionId);
              if (!dup) {
                dbState.negSeq += 1;
                const id = `neg-${dbState.negSeq}`;
                originalSet(id, {
                  id,
                  user_id: row.user_id as string,
                  bill_id: row.bill_id as string,
                  agent_action_id: actionId ?? null,
                  status: (row.status as string) ?? 'pending',
                  target_amount: (row.target_amount as number) ?? null,
                  achieved_amount: null,
                  monthly_savings: null,
                  call_started_at: null,
                  call_ended_at: null,
                  call_duration_seconds: null,
                  call_sid: null,
                  call_script: (row.call_script as string) ?? null,
                  voice_recording_url: null,
                  transcript_url: null,
                  notes: null,
                });
              }
              return Promise.resolve({ error: null });
            },
            update: (patch: Record<string, unknown>) => ({
              eq: async (_c: string, id: string) => {
                // The dial-result write is the one carrying ONLY call_sid.
                if (patch.call_sid !== undefined && patch.status === undefined) {
                  return { error: { message: 'transient db write failed' } };
                }
                const neg = negs.get(id);
                if (neg) Object.assign(neg, patch);
                return { error: null };
              },
            }),
            select: () => makeNegChain(),
          };
        }
        // Delegate bills to the simple seeded map.
        if (table === 'bills') {
          let capturedId = '';
          const chain = {
            select: () => chain,
            eq: (_c: string, val: string) => { capturedId = val; return chain; },
            maybeSingle: async () => ({ data: dbState.bills.get(capturedId) ?? null, error: null }),
            update: (p: { last_negotiated_at?: string }) => ({
              eq: async (_c: string, id: string) => {
                const b = dbState.bills.get(id);
                if (b && p.last_negotiated_at) b.last_negotiated_at = p.last_negotiated_at;
                return { error: null };
              },
            }),
          };
          return chain;
        }
        throw new Error(`unexpected table ${table}`);
      },
    };
    createServiceClientMock.mockImplementation(
      () => failingClient as unknown as ReturnType<typeof defaultClient>,
    );

    try {
      const res = await runOne('bill-7', 60);
      // First attempt: dial succeeds, call_sid write fails → updateNegotiation
      // throws → agent retries. Retry sees 'calling' + no call_sid → escalates.
      expect(res.status).toBe('escalated');
      // placeCall must have happened EXACTLY once — no double-dial.
      expect(mock.placeCall).toHaveBeenCalledTimes(1);
      const neg = [...negs.values()].find((n) => n.bill_id === 'bill-7');
      expect(neg?.status).toBe('negotiating'); // routed to human review
      expect(neg?.call_sid).toBeNull();
    } finally {
      createServiceClientMock.mockReset();
    }
  });

  it('completed call with NO transcript → needs review, escalates (no false no_savings)', async () => {
    // A connected+completed call whose recording has no transcript must NOT be
    // recorded as no_savings — it routes to human review and escalates.
    seedBill('bill-6', 90);
    setAdapter(
      new MockTwilioAdapter({
        finalStatus: 'completed',
        transcriptText: null, // no transcript available
      }),
    );

    const res = await runOne('bill-6', 60);
    expect(res.status).toBe('escalated');

    const neg = dbState.negotiations.get('neg-1');
    expect(neg?.status).toBe('negotiating'); // needs-review, not no_savings
    expect(neg?.voice_recording_url).toContain('.mp3');
  });
});
