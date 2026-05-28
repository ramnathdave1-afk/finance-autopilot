import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TIER_AGENTS } from '../src/users';

describe('phase 3 premium agent extensions', () => {
  it('AgentType includes the four PRD §8.4 premium agents', () => {
    const expected = ['tax_prep', 'investment_rebalancer', 'net_worth_strategy', 'human_backup'] as const;
    for (const a of expected) {
      expect(TIER_AGENTS.premium).toContain(a);
    }
  });

  it('premium tier is still a superset of pro', () => {
    for (const a of TIER_AGENTS.pro) expect(TIER_AGENTS.premium).toContain(a);
  });

  it('migration adds the four enum values', () => {
    const sql = readFileSync(
      join(__dirname, '..', 'migrations', 'phase3_T2_premium_agents.sql'),
      'utf8',
    );
    for (const v of ['tax_prep', 'investment_rebalancer', 'net_worth_strategy', 'human_backup']) {
      expect(sql).toContain(`add value if not exists '${v}'`);
    }
  });

  it('migration creates net_worth_snapshots with RLS', () => {
    const sql = readFileSync(
      join(__dirname, '..', 'migrations', 'phase3_T2_premium_agents.sql'),
      'utf8',
    );
    expect(sql).toContain('public.net_worth_snapshots');
    expect(sql).toContain('net_worth_snapshots_self');
    expect(sql).toContain('enable row level security');
  });
});
