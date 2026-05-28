import { describe, it, expect, vi, beforeEach } from 'vitest';

const inserts: any[] = [];
const state = { errOnInsert: false };

vi.mock('@fa/db', () => ({
  createServiceClient: () => ({
    from: (_table: string) => ({
      insert: (row: any) => {
        inserts.push(row);
        return {
          select: () => ({
            single: async () =>
              state.errOnInsert
                ? { data: null, error: { message: 'denied' } }
                : { data: { id: 'rule-1' }, error: null },
          }),
        };
      },
    }),
  }),
}));

import { createRule } from '../src/create-rule';

beforeEach(() => {
  inserts.length = 0;
  state.errOnInsert = false;
});

describe('createRule', () => {
  it('inserts a rules row with trigger/conditions/actions and returns id', async () => {
    const id = await createRule({
      userId: 'u1',
      name: 'Cap dining at $200/mo',
      trigger: { type: 'monthly_spend_threshold', params: { category: 'dining' } },
      condition: { field: 'monthly_spend', op: 'gte', value: 200 },
      action: { type: 'notify' },
    });
    expect(id).toBe('rule-1');
    expect(inserts).toHaveLength(1);
    expect(inserts[0].user_id).toBe('u1');
    expect(inserts[0].enabled).toBe(true);
    expect(Array.isArray(inserts[0].conditions)).toBe(true);
    expect(inserts[0].conditions[0]).toEqual({ field: 'monthly_spend', op: 'gte', value: 200 });
  });

  it('throws on DB error', async () => {
    state.errOnInsert = true;
    await expect(
      createRule({
        userId: 'u1',
        name: 'x',
        trigger: { type: 'monthly_spend_threshold' },
        condition: { field: 'a', op: 'gt', value: 1 },
        action: { type: 'notify' },
      }),
    ).rejects.toThrow(/createRule failed/);
  });
});
