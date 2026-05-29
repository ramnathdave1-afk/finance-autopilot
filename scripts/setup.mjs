#!/usr/bin/env node
// One-shot local setup: validate env, then apply DB migrations when a
// DATABASE_URL is available.
// Usage: node scripts/setup.mjs [path-to-env-file]   (default: .env.local)
//
// Steps:
//   1. check-env  — fail fast if required config is missing/invalid
//   2. migrate    — pnpm --filter @fa/db migrate:apply (only if DATABASE_URL set)

import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const targetArg = process.argv[2] ?? '.env.local';
const targetPath = resolve(ROOT, targetArg);

let step = 0;
function log(msg) {
  console.log(`\n[setup ${++step}] ${msg}`);
}

function run(cmd, args, opts = {}) {
  console.log(`  $ ${cmd} ${args.join(' ')}`);
  const res = spawnSync(cmd, args, { stdio: 'inherit', cwd: ROOT, ...opts });
  if (res.status !== 0) {
    console.error(`\n✖ step failed (exit ${res.status ?? 'signal'}): ${cmd} ${args.join(' ')}`);
    process.exit(res.status ?? 1);
  }
}

// Pull DATABASE_URL out of the target env file (we never log its value).
function readDatabaseUrl() {
  if (!existsSync(targetPath)) return undefined;
  for (const raw of readFileSync(targetPath, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    if (line.slice(0, eq).trim() === 'DATABASE_URL') {
      let v = line.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      return v || undefined;
    }
  }
  return undefined;
}

console.log(`finance-autopilot setup — env file: ${targetArg}`);

log('Validating environment');
run(process.execPath, [join('scripts', 'check-env.mjs'), targetArg]);

log('Applying database migrations');
const dbUrl = readDatabaseUrl() ?? process.env.DATABASE_URL;
if (!dbUrl) {
  console.log('  ○ DATABASE_URL not set — skipping migrations.');
  console.log('    Set DATABASE_URL (in the env file or shell) to apply schema.');
} else {
  // Pass DATABASE_URL through to the migrate script via env (not logged).
  run('pnpm', ['--filter', '@fa/db', 'migrate:apply'], {
    env: { ...process.env, DATABASE_URL: dbUrl },
  });
}

console.log('\n✓ Setup complete.');
