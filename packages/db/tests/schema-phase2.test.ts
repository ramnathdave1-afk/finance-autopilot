import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIG = (n: string) => readFileSync(join(__dirname, '..', 'migrations', n), 'utf8');

describe('phase 2 tier-2 schema', () => {
  it('declares all tier-2 tables', () => {
    const sql = MIG('phase2a_T2_tier2_tables.sql');
    for (const t of [
      'public.bills',
      'public.bill_negotiations',
      'public.disputes',
      'public.cards',
      'public.user_cards',
      'public.unclaimed_finds',
      'public.loans',
      'public.rate_snapshots',
      'public.insurance_policies',
      'public.insurance_quotes',
      'public.investment_holdings',
    ]) {
      expect(sql).toContain(t);
    }
  });

  it('declares tier-2 enums', () => {
    const sql = MIG('phase2a_T2_tier2_tables.sql');
    for (const e of ['dispute_status', 'bill_negotiation_status', 'loan_type', 'insurance_kind']) {
      expect(sql).toContain(`create type ${e}`);
    }
  });

  it('rls policies cover user-scoped tier-2 tables', () => {
    const sql = MIG('phase2b_T2_tier2_rls.sql');
    for (const t of [
      'bills',
      'bill_negotiations',
      'disputes',
      'user_cards',
      'unclaimed_finds',
      'loans',
      'insurance_policies',
      'insurance_quotes',
      'investment_holdings',
    ]) {
      expect(sql).toMatch(new RegExp(`${t}_self`));
    }
  });

  it('cards + rate_snapshots are read-only catalog tables for authenticated', () => {
    const sql = MIG('phase2b_T2_tier2_rls.sql');
    expect(sql).toContain('cards_read');
    expect(sql).toContain('rate_snapshots_read');
    expect(sql).toContain("auth.role() = 'authenticated'");
  });
});
