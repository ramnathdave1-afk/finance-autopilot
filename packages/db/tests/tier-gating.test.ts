import { describe, it, expect } from 'vitest';
import { TIER_AGENTS } from '../src/users';

describe('TIER_AGENTS gating', () => {
  it('free tier is info-only', () => {
    expect(TIER_AGENTS.free).toContain('daily_brief');
    expect(TIER_AGENTS.free).toContain('spending_coach');
    expect(TIER_AGENTS.free).not.toContain('subscription_killer');
    expect(TIER_AGENTS.free).not.toContain('bill_negotiation');
  });

  it('autopilot includes all Tier-1 agents from PRD §8.2', () => {
    const t1 = [
      'subscription_killer',
      'auto_saver',
      'round_up_investor',
      'spending_coach',
      'goal_funder',
      'daily_brief',
    ];
    for (const a of t1) expect(TIER_AGENTS.autopilot).toContain(a);
  });

  it('pro adds the Tier-2 action agents from PRD §8.3', () => {
    expect(TIER_AGENTS.pro).toContain('bill_negotiation');
    expect(TIER_AGENTS.pro).toContain('charge_dispute');
    expect(TIER_AGENTS.pro).toContain('credit_card_optimizer');
    expect(TIER_AGENTS.pro).toContain('missing_money');
  });

  it('premium is a superset of pro', () => {
    for (const a of TIER_AGENTS.pro) expect(TIER_AGENTS.premium).toContain(a);
  });
});
