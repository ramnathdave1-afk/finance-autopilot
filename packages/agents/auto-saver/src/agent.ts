// Agent 2 — Auto-Saver (PRD §8.2).
//
// RECOMMEND MODE ONLY at launch (PRD §5 non-goal #2): we propose how to split
// the paycheck across buckets. We do NOT move money. The proposal lands in
// agent_actions awaiting approval; the user one-taps to execute (handled by
// T1's UI in a later phase).

import { defineAgent, type AgentDefinition } from '@fa/inngest';
import {
  computeAllocation,
  DEFAULT_RULES,
  type AllocationBucket,
  type AllocationRule,
} from './allocation';

export interface AutoSaverInput {
  paycheckTxnId: string;
  amountCents: number;
  depositedAt: string; // ISO date
  /** Optional explicit rules. Falls back to DEFAULT_RULES if not provided. */
  rules?: AllocationRule[];
}

export interface AutoSaverData {
  proposal: {
    paycheckTxnId: string;
    amountCents: number;
    depositedAt: string;
    buckets: AllocationBucket[];
    /** Marker: this agent NEVER moves money in Phase 1. */
    autonomousTransfer: false;
  };
}

export const autoSaverAgent: AgentDefinition<AutoSaverInput> = defineAgent<AutoSaverInput>({
  type: 'auto_saver',
  actionType: 'allocation_proposal',
  requiresApproval: true,
  idempotencyKey: (i) => `allocation:${i.paycheckTxnId}`,
  run: async (input, ctx) => {
    await ctx.log('compute:start', true, { paycheckTxnId: input.paycheckTxnId });
    const rules = input.rules ?? DEFAULT_RULES;
    const buckets = computeAllocation(input.amountCents, rules);
    await ctx.log('compute:done', true, {
      bucketCount: buckets.length,
      total: buckets.reduce((s, b) => s + b.dollarAmountCents, 0),
    });

    // Recommend-only — no autonomous money movement. (PRD §5 non-goal #2)
    const data: AutoSaverData = {
      proposal: {
        paycheckTxnId: input.paycheckTxnId,
        amountCents: input.amountCents,
        depositedAt: input.depositedAt,
        buckets,
        autonomousTransfer: false,
      },
    };
    await ctx.log('proposal:built', true, data);
    return { roi: null, data: data as unknown as Record<string, unknown> };
  },
});
