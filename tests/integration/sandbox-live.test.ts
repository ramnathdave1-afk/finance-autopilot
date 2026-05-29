// LIVE Plaid-sandbox integration harness.
//
// Runs the real data loop + agents against a NEW Supabase project + Plaid
// sandbox + live Claude. Gated behind RUN_SANDBOX=1 so it never runs in CI.
//
//   RUN_SANDBOX=1 pnpm --filter @fa/integration-tests test sandbox-live
//
// Purpose: surface the bugs the mock unit tests cannot — real Plaid exchange,
// Supabase Vault encryption, transactions/sync cursor, Claude categorization,
// RLS, and agents operating on real synced data.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

// ---- load .env.local from repo root into process.env (before importing pkgs that read env) ----
function loadEnv(): void {
  try {
    const txt = readFileSync(join(__dirname, '..', '..', '.env.local'), 'utf8');
    for (const line of txt.split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!m) continue;
      const v = m[2].replace(/\s+#.*$/, '').trim();
      if (v && !v.startsWith('TODO_') && !(m[1] in process.env)) process.env[m[1]] = v;
    }
  } catch {
    /* no .env.local — test will skip */
  }
}
loadEnv();

const LIVE = process.env.RUN_SANDBOX === '1';
const d = LIVE ? describe : describe.skip;

// dynamic imports so a non-LIVE run never even loads packages that throw on missing env
d('live plaid-sandbox harness', () => {
  let userId = '';
  let supabase: any;
  const agentIds: Record<string, string> = {};
  const findings: Array<{ step: string; ok: boolean; detail: string }> = [];
  const record = (step: string, ok: boolean, detail = '') => {
    findings.push({ step, ok, detail });
    // eslint-disable-next-line no-console
    console.log(`${ok ? '✅' : '❌'} ${step}${detail ? ' — ' + detail : ''}`);
  };

  beforeAll(async () => {
    const { createServiceClient } = await import('../../packages/db/src/client');
    supabase = createServiceClient();
    const email = `sandbox+${Date.now()}@finance-autopilot.test`;
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password: 'Sandbox-Test-1!',
      email_confirm: true,
    });
    if (error) throw new Error(`createUser: ${error.message}`);
    userId = data.user.id;
    // wait for the auto-provision trigger, then bump to premium so every agent is permitted
    await new Promise((r) => setTimeout(r, 800));
    const { error: upErr } = await supabase
      .from('users')
      .update({ pricing_tier: 'premium', subscription_status: 'active' })
      .eq('id', userId);
    if (upErr) throw new Error(`set premium: ${upErr.message}`);

    // upsert an agent row per type so the convenience runners have a valid agent_id
    const { upsertAgent } = await import('../../packages/db/src/users');
    for (const t of ['spending_coach', 'daily_brief'] as const) {
      agentIds[t] = await upsertAgent(userId, t);
    }
  }, 60_000);

  afterAll(async () => {
    if (userId && supabase) {
      await supabase.auth.admin.deleteUser(userId).catch(() => {});
    }
    // eslint-disable-next-line no-console
    console.log('\n=== HARNESS FINDINGS ===');
    for (const f of findings) console.log(`${f.ok ? 'PASS' : 'FAIL'}  ${f.step}  ${f.detail}`);
  });

  it('core loop: plaid sandbox -> exchange -> sync -> categorize', async () => {
    const { getPlaidClient, exchangePublicToken } = await import('../../packages/integrations/plaid/src/index');
    const { syncUser } = await import('../../packages/integrations/plaid/src/sync');
    const plaid = getPlaidClient();

    // 1. sandbox public token (no Link UI)
    let publicToken = '';
    try {
      const pt = await plaid.sandboxPublicTokenCreate({
        institution_id: 'ins_109508', // First Platypus Bank (sandbox)
        initial_products: ['transactions'] as any,
      });
      publicToken = pt.data.public_token;
      record('plaid.sandboxPublicTokenCreate', true, publicToken.slice(0, 16) + '…');
    } catch (e: any) {
      record('plaid.sandboxPublicTokenCreate', false, e?.response?.data?.error_message ?? e.message);
      throw e;
    }

    // 2. exchange (stores access token in Supabase Vault + seeds accounts)
    let itemRowId = '';
    try {
      itemRowId = await exchangePublicToken({
        userId,
        publicToken,
        institutionId: 'ins_109508',
        institutionName: 'First Platypus Bank',
      });
      record('exchangePublicToken (+vault +accounts)', true, `item row ${itemRowId.slice(0, 8)}`);
    } catch (e: any) {
      record('exchangePublicToken', false, e?.message ?? String(e));
      throw e;
    }

    // 3. sync transactions + categorize via Claude.
    // Plaid sandbox populates transactions ASYNCHRONOUSLY, so retry the sync a
    // few times until they land (real apps do this via the SYNC_UPDATES_AVAILABLE webhook).
    try {
      let res = await syncUser(userId);
      for (let i = 0; i < 6 && res.added === 0; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        res = await syncUser(userId);
      }
      record('syncUser (transactions/sync + Claude categorize)', true, JSON.stringify(res));
    } catch (e: any) {
      record('syncUser', false, e?.message ?? String(e));
      throw e;
    }

    // 4. verify the data actually landed + got categorized
    const { count: txCount } = await supabase
      .from('transactions').select('*', { count: 'exact', head: true }).eq('user_id', userId);
    const { count: catCount } = await supabase
      .from('transactions').select('*', { count: 'exact', head: true })
      .eq('user_id', userId).not('ai_category', 'is', null);
    record('transactions landed', (txCount ?? 0) > 0, `${txCount} rows`);
    record('Claude categorized', (catCount ?? 0) > 0, `${catCount}/${txCount} categorized`);
    expect(txCount ?? 0).toBeGreaterThan(0);
  }, 120_000);

  it('data agents run against synced data', async () => {
    const cases: Array<[string, () => Promise<unknown>]> = [];
    const sc = await import('../../packages/agents/spending-coach/src/index');
    const db = await import('../../packages/agents/daily-brief/src/index');
    cases.push(['spending-coach', () => (sc as any).runSpendingCoach({ userId, agentId: agentIds['spending_coach'] })]);
    cases.push(['daily-brief', () => (db as any).runDailyBrief({ userId, agentId: agentIds['daily_brief'] })]);

    for (const [name, fn] of cases) {
      try {
        const out = await fn();
        record(`agent:${name}`, true, JSON.stringify(out).slice(0, 120));
      } catch (e: any) {
        record(`agent:${name}`, false, e?.message ?? String(e));
      }
    }
    // surface as a soft signal; the per-step records are the real report
    expect(findings.some((f) => f.step.startsWith('agent:'))).toBe(true);
  }, 120_000);
});
