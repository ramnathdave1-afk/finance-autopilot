# @fa/agent-human-backup

Agent 16 — Human Backup (PRD §8.4). The escalation / queue agent. When any
**other** agent fails or refuses — an `agent_action` in status `failed`,
`escalated`, or `refused` — or the existing `reconnect_bank` reauth flow fires
(`@fa/plaid/router` emits those onto this same `human_backup` agent), Human
Backup routes the action to a human-review queue:

1. ensure the user has a `human_backup` agent row,
2. for each not-yet-queued failure, park an `awaiting_approval` `human_review`
   action (the human-review state in this schema),
3. record a **24h SLA deadline** (PRD §8.4) in the audit log,
4. notify the user that a human is taking over,
5. flag any already-queued entry whose 24h SLA has now breached → `escalated`.

**Lean / recommend-only (PRD §8.4).** This agent moves no money and takes no
autonomous action on the user's accounts. Its only effects are agent_actions
queue state + a notification. A human still has to act.

## requiresApproval — two layers

- The **sweep** (`actionType: 'route_to_human'`) runs with
  `requiresApproval: false` — it is an automated, informational pass (like
  `daily_brief` / `missing_money` detection) so it can react to failures
  unattended.
- The **queue entries** it creates (`actionType: 'human_review'`) carry
  `requiresApproval: true` — they land in `awaiting_approval` and a human must
  pick each up. This mirrors how `@fa/plaid/router` parks `reconnect_bank`
  actions: automatic carrier, human-awaiting parked action.

## The "queue" is agent_actions, not a new table

A queue entry is a `human_review` action on the user's `human_backup` agent,
in status `awaiting_approval`, whose `idempotency_key` (`human-backup:<sourceId>`)
encodes the source action it covers. The same feed query that surfaces
`reconnect_bank` cards (`status='awaiting_approval'`) surfaces these uniformly.

## Surface

```ts
import { humanBackupAgent, runHumanBackup } from '@fa/agent-human-backup';

await runHumanBackup({
  userId,
  agentId,
  input: { userId }, // optional: { slaHours, nowIso } for tests
});
```

## SLA logic (pure, in `src/sla.ts`)

- `slaDeadline(enqueuedAtIso, hours = 24)` — `enqueuedAt + 24h`.
- `isSlaBreached(deadlineIso, nowIso)` — past-deadline check (null deadline =
  never breached).
- `selectToEnqueue(candidates, existingQueue)` — dedupe of already-queued
  source actions (skips any with an open OR resolved queue entry, and collapses
  duplicate candidates within one sweep).
- `routeReason(action)` — `agent_failed` / `agent_escalated` / `agent_refused`
  / `reconnect_bank`.

## Honesty contract

There is **no external integration** in the routing logic. The only outbound
side-effect is `notifyUser` (Expo / OneSignal, from `@fa/inngest`), which fails
loudly when uncredentialed and is mocked in tests. A notify failure is logged
(`queue:notify_error`) and never faked; the enqueue still stands.

## Idempotency

- Sweep key = `human-backup:sweep:<userId>` (one sweep per user per run).
- Queue-entry key = `human-backup:<sourceActionId>` (one entry per source
  action; `startAction` is idempotency-keyed, so a racing sweep returns the
  same row instead of duplicating).

## ROI

`roi` is `null` — routing to a human delivers no dollar amount itself.

## Tests

```bash
pnpm --filter @fa/agent-human-backup test
```

`tests/sla.test.ts` (16) — deadline calc, breach detection, minutes-remaining,
queue-key/route-reason, dedupe selection, open/resolved classification.
`tests/agent.test.ts` (6) — enqueue + 24h SLA + notify, escalated/reconnect
reasons, dedupe of already-queued, SLA-breach escalation, within-SLA no-op,
empty no-op.
