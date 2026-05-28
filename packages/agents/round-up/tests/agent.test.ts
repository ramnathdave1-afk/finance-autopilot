import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { roundUpAgent } from '../src/agent';

vi.mock('@fa/db', () => {
  let id = 1;
  return {
    startAction: vi.fn(async (input) => ({
      id: `act_${id++}`,
      user_id: input.userId,
      agent_id: input.agentId,
      agent_type: input.agentType,
      action_type: input.actionType,
      target: input.target ?? null,
      status: input.requiresApproval ? 'awaiting_approval' : 'pending',
      idempotency_key: input.idempotencyKey ?? null,
      requested_at: new Date().toISOString(),
      approved_at: null,
      started_at: null,
      completed_at: null,
      roi_amount: null,
      audit_log: [],
      voice_recording_url: null,
      error_message: null,
      retry_count: 0,
    })),
    logStep: vi.fn(async () => {}),
    markRunning: vi.fn(async () => {}),
    markSucceeded: vi.fn(async () => {}),
    markFailed: vi.fn(async () => {}),
    markEscalated: vi.fn(async () => {}),
    markCancelled: vi.fn(async () => {}),
  };
});

import { runAgent } from '@fa/inngest';

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.restoreAllMocks());

describe('roundUpAgent', () => {
  it('stops at awaiting_approval (proposal-only, no transfers)', async () => {
    const res = await runAgent(roundUpAgent, {
      userId: 'u1',
      agentId: 'ag1',
      input: {
        transactions: [
          { id: 't1', amountCents: 347, date: '2026-05-01', isDebit: true },
        ],
        strategyId: 'sp500',
        weekStart: '2026-05-25',
      },
    });
    expect(res.status).toBe('awaiting_approval');
  });

  it('computes total, attaches strategy, never marks autonomous', async () => {
    const result = await roundUpAgent.run(
      {
        transactions: [
          { id: 't1', amountCents: 347, date: '2026-05-01', isDebit: true },
          { id: 't2', amountCents: 1299, date: '2026-05-02', isDebit: true },
        ],
        strategyId: 'btc',
        weekStart: '2026-05-25',
      },
      {
        actionId: 'a1',
        userId: 'u1',
        agentId: 'ag1',
        agentType: 'round_up_investor' as never,
        log: async () => {},
      },
    );
    expect(result.roi).toBeNull();
    const data = result.data as {
      totalCents: number;
      strategy: { id: string; broker: string };
      suggestedTransfer: { amountCents: number; autonomousTransfer: false };
    };
    expect(data.totalCents).toBe(54);
    expect(data.strategy.id).toBe('btc');
    expect(data.strategy.broker).toBe('coinbase');
    expect(data.suggestedTransfer.amountCents).toBe(54);
    expect(data.suggestedTransfer.autonomousTransfer).toBe(false);
  });

  it('uses a per-week stable idempotency key', () => {
    const k = roundUpAgent.idempotencyKey!({
      transactions: [],
      strategyId: 'sp500',
      weekStart: '2026-05-25',
    });
    expect(k).toBe('sweep:2026-05-25');
  });
});
