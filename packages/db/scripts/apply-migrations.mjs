#!/usr/bin/env node
// Apply migrations in lexical order against a Supabase Postgres URL.
// Usage: DATABASE_URL=postgres://... node scripts/apply-migrations.mjs
//
// Idempotent — every migration uses `if not exists` / `do $$ ... exception when duplicate`
// so re-running is safe.

import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIG_DIR = join(__dirname, '..', 'migrations');

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

const files = readdirSync(MIG_DIR).filter((f) => f.endsWith('.sql')).sort();

for (const file of files) {
  const sql = readFileSync(join(MIG_DIR, file), 'utf8');
  console.log(`Applying ${file}…`);
  await client.query(sql);
}

await client.end();
console.log('Migrations applied.');
