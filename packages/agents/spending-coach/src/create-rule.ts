// Lightweight helper used by the spending coach's one-tap insight cards.
// When the user accepts a suggested rule from an insight (e.g. "cap Uber Eats
// at $200/mo"), T1's web UI posts it through here so we get a real row in
// public.rules without leaking the service-role client to the browser.

import { createServiceClient } from '@fa/db';

export interface RuleTrigger {
  type: 'transaction_categorized' | 'monthly_spend_threshold' | 'subscription_charged';
  /** e.g. category: 'dining' */
  params?: Record<string, unknown>;
}

export interface RuleCondition {
  field: string;
  op: 'gt' | 'gte' | 'lt' | 'lte' | 'eq';
  value: number | string;
}

export interface RuleAction {
  type: 'notify' | 'create_insight' | 'block_category';
  params?: Record<string, unknown>;
}

export interface CreateRuleInput {
  userId: string;
  name: string;
  trigger: RuleTrigger;
  condition: RuleCondition;
  action: RuleAction;
}

export async function createRule(input: CreateRuleInput): Promise<string> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('rules')
    .insert({
      user_id: input.userId,
      name: input.name,
      trigger: input.trigger as unknown as Record<string, unknown>,
      conditions: [input.condition as unknown as Record<string, unknown>],
      actions: [input.action as unknown as Record<string, unknown>],
      enabled: true,
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`createRule failed: ${error?.message}`);
  return data.id as string;
}
