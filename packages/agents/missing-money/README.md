# @fa/agent-missing-money

Agent 10 — Missing Money (PRD §8.3). Cross-references the user's identity
(name + aliases, prior addresses, prior employers) against public
unclaimed-property sources (NAUPA / missingmoney.com / state DBs / old-401(k)
databases) and records every match in the `unclaimed_finds` table.

**Detection only.** This agent never files a claim and never moves money — it
surfaces finds with status `detected`. Filing is a separate, user-initiated
action (`actionType: 'file_claim'`) dispatched from the Missing Money web page.
Because writing a find is informational, `requiresApproval` is `false` (like
Daily Brief / Spending Coach).

## Surface

```ts
import { missingMoneyAgent, runMissingMoney } from '@fa/agent-missing-money';

await runMissingMoney({
  userId,
  agentId,
  input: {
    subject: {
      fullName: 'Jane Q Public',
      aliases: ['Jane Public'],
      addresses: [{ city: 'Phoenix', state: 'AZ' }],
      employers: ['Acme Corp'],
      states: ['AZ', 'CA'],
    },
  },
});
```

## Honesty contract — live-ready, mock-tested

All external lookups go through `UnclaimedPropertyPort`:

- **Live** (`createHttpPortFromEnv`): reads `UNCLAIMED_PROPERTY_BASE_URL` and
  `UNCLAIMED_PROPERTY_API_KEY` from env, POSTs the subject to the aggregator,
  and **throws** on a missing key or non-OK response. It never fabricates a
  "found" result and never collapses an error into "no money found".
- **Mock** (`createMockPort`): deterministic canned hits for tests + dev.
  Tests install it via `setUnclaimedPropertyPortFactory` and never touch the
  network.

```ts
import {
  setUnclaimedPropertyPortFactory,
  createMockPort,
  resetUnclaimedPropertyPortFactory,
} from '@fa/agent-missing-money';

setUnclaimedPropertyPortFactory(() => createMockPort([/* hits */]));
// ... run ...
resetUnclaimedPropertyPortFactory(); // back to the live env-driven port
```

## Dedupe

Finds are deduped against everything already recorded for the user AND within a
single batch:

- Hits **with** a `property_id` key on `source + property_id` (mirrors the
  partial unique index `unclaimed_dedup_uniq` in
  `phase2_T2_tier2_tables.sql`).
- Hits **without** a `property_id` (some state DBs omit it) key on
  `source + holder + amount_estimate`, so repeated daily runs don't pile up.

## Idempotency

Key = `missing-money:${fullName}` (lower-cased). One detection pass per identity
per run; the audit log + DB dedupe handle re-runs.

## ROI

`roi` is `null` — amounts are text bands ("Under $50") that can't be summed, and
nothing is recovered until the user files a claim (a separate action).

## Tests

```bash
pnpm --filter @fa/agent-missing-money test
```

Covers: match found, no match, dedupe of already-recorded finds, in-batch
dedupe, and the port honesty contract (env throws, HTTP maps, HTTP error
surfaces).
