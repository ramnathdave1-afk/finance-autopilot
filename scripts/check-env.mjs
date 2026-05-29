#!/usr/bin/env node
// Validate a target env file against the vars declared in .env.example.
// Usage: node scripts/check-env.mjs [path-to-env-file]   (default: .env.local)
//
// Checks every REQUIRED var is present, non-empty, and not a TODO_CREATE/
// TODO_COPY placeholder; validates obvious formats (PLAID_ENV enum, URLs,
// Stripe price IDs, etc.); prints a grouped PASS / MISSING / PLACEHOLDER
// report and exits non-zero if any REQUIRED var is missing or placeholder.
//
// Secret values are NEVER printed — only masked.

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const targetArg = process.argv[2] ?? '.env.local';
const targetPath = resolve(ROOT, targetArg);
const examplePath = join(ROOT, '.env.example');

// --- vars required for the core product to boot --------------------------
// Everything else declared in .env.example is treated as optional (feature
// flags, Phase-4 integrations, fallbacks, observability).
const CORE_REQUIRED = new Set([
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'PLAID_CLIENT_ID',
  'PLAID_SECRET',
  'PLAID_ENV',
  'ANTHROPIC_API_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
  'INNGEST_EVENT_KEY',
  'INNGEST_SIGNING_KEY',
]);

const PLACEHOLDER_RE = /^TODO_(CREATE|COPY)/;

// --- format validators -----------------------------------------------------
// Each returns null on success or an error string on failure.
const VALIDATORS = {
  PLAID_ENV: (v) =>
    ['sandbox', 'development', 'production'].includes(v)
      ? null
      : `must be one of sandbox|development|production (got "${v}")`,
  NEXT_PUBLIC_SUPABASE_URL: isHttpUrl,
  EXPO_PUBLIC_SUPABASE_URL: isHttpUrl,
  PLAID_WEBHOOK_URL: isHttpUrl,
  DATABASE_URL: isPostgresUrl,
  EXPO_PUBLIC_API_BASE_URL: isHttpUrl,
  NEXT_PUBLIC_POSTHOG_HOST: isHttpUrl,
  STRIPE_SECRET_KEY: prefix('sk_'),
  STRIPE_WEBHOOK_SECRET: prefix('whsec_'),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: prefix('pk_'),
  STRIPE_PRICE_AUTOPILOT_MONTHLY: prefix('price_'),
  STRIPE_PRICE_AUTOPILOT_ANNUAL: prefix('price_'),
  STRIPE_PRICE_PRO_MONTHLY: prefix('price_'),
  STRIPE_PRICE_PRO_ANNUAL: prefix('price_'),
  STRIPE_PRICE_PREMIUM_MONTHLY: prefix('price_'),
  STRIPE_PRICE_PREMIUM_ANNUAL: prefix('price_'),
  STRIPE_PRICE_FOUNDER_999_LIFETIME: prefix('price_'),
  STRIPE_COUPON_FOUNDER_YEAR1_50PCT: prefix('FOUNDER', { caseInsensitive: false, soft: true }),
  ANTHROPIC_API_KEY: prefix('sk-ant-'),
};

function isHttpUrl(v) {
  return /^https?:\/\//.test(v) ? null : `must start with http(s):// (got "${truncate(v)}")`;
}

function isPostgresUrl(v) {
  return /^postgres(ql)?:\/\//.test(v)
    ? null
    : `must be a postgres connection string (postgres:// or postgresql://) (got "${truncate(v)}")`;
}

function prefix(p, opts = {}) {
  return (v) => {
    const ok = v.startsWith(p);
    if (ok) return null;
    // soft = warn-only mismatch (don't fail the run on a known-flexible value)
    return opts.soft ? null : `expected to start with "${p}"`;
  };
}

function truncate(v) {
  return v.length > 24 ? `${v.slice(0, 24)}…` : v;
}

// Mask any value so we never leak a secret to stdout.
function mask(v) {
  if (v.length <= 4) return '••••';
  return `${v.slice(0, 2)}••••${v.slice(-2)} (len ${v.length})`;
}

// --- parse a dotenv-style file ---------------------------------------------
function parseEnvFile(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    // strip surrounding quotes
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

// --- declared var keys + group headers from .env.example -------------------
function parseExample(text) {
  const keys = [];
  const groupOf = {};
  let group = 'Ungrouped';
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const groupMatch = line.match(/^#\s*---\s*(.+?)\s*-+\s*$/);
    if (groupMatch) {
      group = groupMatch[1].trim();
      continue;
    }
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    keys.push(key);
    groupOf[key] = group;
  }
  return { keys, groupOf };
}

// --- main -------------------------------------------------------------------
function main() {
  if (!existsSync(examplePath)) {
    console.error(`✖ .env.example not found at ${examplePath}`);
    process.exit(1);
  }
  const { keys, groupOf } = parseExample(readFileSync(examplePath, 'utf8'));

  console.log(`check-env — validating ${targetArg} against .env.example\n`);

  if (!existsSync(targetPath)) {
    console.error(`✖ env file not found: ${targetPath}`);
    console.error(`  Copy .env.example to ${targetArg} and fill it in.`);
    process.exit(1);
  }

  const env = parseEnvFile(readFileSync(targetPath, 'utf8'));

  const results = []; // { key, group, required, status, detail }
  for (const key of keys) {
    const required = CORE_REQUIRED.has(key);
    const group = groupOf[key] ?? 'Ungrouped';
    const value = env[key];

    if (value === undefined || value === '') {
      results.push({ key, group, required, status: 'MISSING' });
      continue;
    }
    if (PLACEHOLDER_RE.test(value)) {
      results.push({ key, group, required, status: 'PLACEHOLDER', detail: value });
      continue;
    }
    const validator = VALIDATORS[key];
    const err = validator ? validator(value) : null;
    if (err) {
      results.push({ key, group, required, status: 'INVALID', detail: err });
      continue;
    }
    results.push({ key, group, required, status: 'PASS', detail: mask(value) });
  }

  // group + print
  const byGroup = new Map();
  for (const r of results) {
    if (!byGroup.has(r.group)) byGroup.set(r.group, []);
    byGroup.get(r.group).push(r);
  }

  const icon = { PASS: '✓', MISSING: '○', PLACEHOLDER: '⚠', INVALID: '✖' };
  for (const [group, rows] of byGroup) {
    console.log(`── ${group} ──`);
    for (const r of rows) {
      const tag = r.required ? '[required]' : '[optional]';
      const detail = r.detail ? ` — ${r.detail}` : '';
      console.log(`  ${icon[r.status]} ${r.status.padEnd(11)} ${tag} ${r.key}${detail}`);
    }
    console.log('');
  }

  // summary — failures = required vars that are MISSING / PLACEHOLDER / INVALID
  const failures = results.filter(
    (r) => r.required && r.status !== 'PASS',
  );
  const optionalGaps = results.filter(
    (r) => !r.required && (r.status === 'MISSING' || r.status === 'PLACEHOLDER'),
  );
  const invalidOptional = results.filter(
    (r) => !r.required && r.status === 'INVALID',
  );

  console.log('── Summary ──');
  console.log(`  ${results.filter((r) => r.status === 'PASS').length} passed`);
  console.log(`  ${failures.length} required gap(s)`);
  console.log(`  ${optionalGaps.length} optional unset, ${invalidOptional.length} optional invalid`);

  if (failures.length > 0) {
    console.error('\n✖ Required configuration incomplete:');
    for (const f of failures) {
      console.error(`  - ${f.key}: ${f.status}${f.detail ? ` (${f.detail})` : ''}`);
    }
    process.exit(1);
  }
  if (invalidOptional.length > 0) {
    console.error('\n✖ Optional vars set but invalid:');
    for (const f of invalidOptional) {
      console.error(`  - ${f.key}: ${f.detail}`);
    }
    process.exit(1);
  }

  console.log('\n✓ All required env vars present and valid.');
}

main();
