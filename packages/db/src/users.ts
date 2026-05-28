// User-side gating helpers. Every agent run MUST call canAct() before doing
// anything user-visible — that enforces the pause-everything button (PRD §14)
// and the tier paywall (PRD §7) at the data layer instead of trusting callers.

import { createServiceClient } from './client';
import type { AgentType, ConsentMode, PricingTier } from '../types';

/** Tier → agents that tier unlocks. */
export const TIER_AGENTS: Record<PricingTier, AgentType[]> = {
  free: ['daily_brief', 'spending_coach'], // info-only, free tier (PRD §8.1)
  autopilot: [
    'subscription_killer',
    'auto_saver',
    'round_up_investor',
    'spending_coach',
    'goal_funder',
    'daily_brief',
  ],
  pro: [
    'subscription_killer',
    'auto_saver',
    'round_up_investor',
    'spending_coach',
    'goal_funder',
    'daily_brief',
    'bill_negotiation',
    'charge_dispute',
    'credit_card_optimizer',
    'missing_money',
    'refinance_watcher',
    'insurance_shopper',
  ],
  premium: [
    'subscription_killer',
    'auto_saver',
    'round_up_investor',
    'spending_coach',
    'goal_funder',
    'daily_brief',
    'bill_negotiation',
    'charge_dispute',
    'credit_card_optimizer',
    'missing_money',
    'refinance_watcher',
    'insurance_shopper',
    'tax_prep',
    'investment_rebalancer',
    'net_worth_strategy',
    'human_backup',
  ],
};

export interface ActPermit {
  allowed: boolean;
  reason?: 'paused' | 'tier' | 'agent_disabled' | 'no_agent';
  consent?: ConsentMode;
}

/**
 * Decide whether a given agent_type is allowed to take action right now for a
 * given user. Returns the consent mode so the caller knows whether to require
 * approval (`approve_each`) or proceed (`auto_small` / `full_auto`).
 */
export async function canAct(userId: string, agentType: AgentType): Promise<ActPermit> {
  const supabase = createServiceClient();

  const [{ data: user, error: uErr }, { data: agent, error: aErr }] = await Promise.all([
    supabase
      .from('users')
      .select('pricing_tier, pause_all_agents, subscription_status')
      .eq('id', userId)
      .single(),
    supabase
      .from('agents')
      .select('consent_mode, enabled')
      .eq('user_id', userId)
      .eq('agent_type', agentType)
      .maybeSingle(),
  ]);

  if (uErr || !user) return { allowed: false, reason: 'no_agent' };

  if (user.pause_all_agents) return { allowed: false, reason: 'paused' };

  const tier = user.pricing_tier as PricingTier;
  if (!TIER_AGENTS[tier].includes(agentType)) return { allowed: false, reason: 'tier' };

  if (aErr || !agent) return { allowed: false, reason: 'no_agent' };
  if (!agent.enabled) return { allowed: false, reason: 'agent_disabled' };

  return { allowed: true, consent: agent.consent_mode as ConsentMode };
}

/** Toggle global pause. The PRD §14 "pause-everything" button calls this. */
export async function setPauseAll(userId: string, paused: boolean): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from('users')
    .update({ pause_all_agents: paused })
    .eq('id', userId);
  if (error) throw new Error(`setPauseAll failed: ${error.message}`);
}

/** Upsert a user's agent row. Used during onboarding to enable Tier-1 agents. */
export async function upsertAgent(
  userId: string,
  agentType: AgentType,
  consentMode: ConsentMode = 'approve_each',
  enabled = true,
): Promise<string> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('agents')
    .upsert(
      { user_id: userId, agent_type: agentType, consent_mode: consentMode, enabled },
      { onConflict: 'user_id,agent_type' },
    )
    .select('id')
    .single();
  if (error || !data) throw new Error(`upsertAgent failed: ${error?.message}`);
  return data.id;
}
