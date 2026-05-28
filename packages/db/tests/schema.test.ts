import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIG_DIR = join(__dirname, '..', 'migrations');

describe('migration files', () => {
  it('exist and are non-empty', () => {
    const files = readdirSync(MIG_DIR).filter((f) => f.endsWith('.sql'));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const sql = readFileSync(join(MIG_DIR, f), 'utf8');
      expect(sql.length).toBeGreaterThan(50);
    }
  });

  it('init migration declares all 8 PRD §12 tables', () => {
    const sql = readFileSync(join(MIG_DIR, 'phase1_T2_init.sql'), 'utf8');
    const required = [
      'public.users',
      'public.connected_accounts',
      'public.transactions',
      'public.subscriptions',
      'public.goals',
      'public.rules',
      'public.agents',
      'public.agent_actions',
    ];
    for (const t of required) expect(sql).toContain(t);
  });

  it('rls migration enables RLS and adds self policies on all user-scoped tables', () => {
    const sql = readFileSync(join(MIG_DIR, 'phase1_T2_rls.sql'), 'utf8');
    const tables = [
      'users',
      'connected_accounts',
      'provider_items',
      'transactions',
      'subscriptions',
      'goals',
      'rules',
      'agents',
      'agent_actions',
    ];
    for (const t of tables) {
      expect(sql).toContain(`alter table public.${t}`);
      expect(sql).toMatch(new RegExp(`${t}_self`));
    }
  });

  it('vault migration creates store/read/delete RPCs', () => {
    const sql = readFileSync(join(MIG_DIR, 'phase1_T2_vault.sql'), 'utf8');
    expect(sql).toContain('vault_store_access_token');
    expect(sql).toContain('vault_read_access_token');
    expect(sql).toContain('vault_delete_access_token');
    expect(sql).toContain('service_role');
  });
});
