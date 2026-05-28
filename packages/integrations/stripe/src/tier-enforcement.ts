// Tier enforcement middleware. Resolves the user's pricing_tier from @fa/db,
// checks TIER_AGENTS mapping, and throws PermissionError if not allowed.
//
// Free tier ALSO enforces a 1-agent-action-per-month quota (PRD §8.1 — "One
// free agent action per month").

import { TIER_AGENTS } from '@fa/db';
import type { AgentType, PricingTier } from '@fa/types';
import { getDbPort } from './db-port';

export class PermissionError extends Error {
  public readonly code:
    | 'tier_locked'
    | 'free_quota_exhausted'
    | 'no_user';
  constructor(code: PermissionError['code'], message: string) {
    super(message);
    this.code = code;
    this.name = 'PermissionError';
  }
}

export const FREE_TIER_MONTHLY_ACTION_QUOTA = 1;

export interface EnforceTierResult {
  tier: PricingTier;
  allowed: true;
  freeQuotaRemaining?: number;
}

/**
 * Throws PermissionError when the user's plan doesn't permit the agent or
 * when free-tier quota is exhausted. Returns metadata on success.
 *
 * NOTE: TIER_AGENTS is sourced from @fa/db where the enum uses
 *       'round_up_investor' / 'auto_saver'. Callers should pass the same
 *       string. The PRD-spec AgentType is structurally compatible.
 */
export async function enforceTier(
  userId: string,
  agentType: AgentType | string,
): Promise<EnforceTierResult> {
  const db = getDbPort();
  const user = await db.getUserById(userId);
  if (!user) throw new PermissionError('no_user', `user not found: ${userId}`);

  const tier = user.pricing_tier as PricingTier;
  const allowedAgents = TIER_AGENTS[tier] as readonly string[];
  if (!allowedAgents.includes(agentType)) {
    throw new PermissionError(
      'tier_locked',
      `agent '${agentType}' not available on tier '${tier}'`,
    );
  }

  if (tier === 'free') {
    const since = startOfCurrentMonthUtc();
    const used = await db.countAgentActionsSince(userId, since);
    if (used >= FREE_TIER_MONTHLY_ACTION_QUOTA) {
      throw new PermissionError(
        'free_quota_exhausted',
        `free tier limited to ${FREE_TIER_MONTHLY_ACTION_QUOTA} agent action(s) per month`,
      );
    }
    return {
      tier,
      allowed: true,
      freeQuotaRemaining: FREE_TIER_MONTHLY_ACTION_QUOTA - used,
    };
  }

  return { tier, allowed: true };
}

function startOfCurrentMonthUtc(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
}
