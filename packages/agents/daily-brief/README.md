# @fa/agent-daily-brief

Agent 6 — Daily Briefing (PRD §8.2). Free tier, info-only, no approval gate.

## What it does

Once per user per day at their chosen local time (default 7am), aggregates:

1. **Yesterday's spend** — sum of positive transactions dated yesterday.
2. **Upcoming bills (next 24h)** — active `subscriptions` whose next expected
   charge (`last_charged_at + frequency`) falls inside the window.
3. **Completed agent actions (last 24h)** — `agent_actions` with
   `status='succeeded'` since 24h ago, with ROI if present.

Feeds those into Claude (`FAST_MODEL`) for a 2–3 sentence personalized brief,
then fires `sendPush` from `@fa/inngest`. MVP is text-only; voice memo lands in
v2 per PRD §8.2.

## Schedule

The schedule lives in `apps/web/api/cron` (T1 owns). This package only exports
the agent + `runDailyBrief()` helper — the cron route calls it once per user
per day, passing `{ window: 'morning' }`.

## Inputs

```ts
interface DailyBriefInput {
  window?: 'morning' | 'evening'; // default 'morning'
  now?: string;                   // ISO; default new Date()
}
```

## Outputs

```ts
{ roi: null, data: { brief, sentAt, aggregate } }
```

Plus an `agent_actions` row with the full audit trail of every step.

## Idempotency

Key = `brief:<YYYY-MM-DD>:<window>` per agent. Cron retries → same row, no
duplicate push.

## Failure modes

| Failure | Behavior |
|---|---|
| Supabase read fails | `run:error` step → retry up to 3x → escalate |
| Claude 429/5xx | Built-in backoff in `@fa/claude.call`, then retry by `runAgent` |
| Push dispatcher throws | Same retry loop; eventually `escalated` |

## Stubs (TODO swap before launch)

- `sendPush` is currently a `console.log` stub in `@fa/inngest`. Real wiring
  goes through Expo Push + OneSignal (`TODO(integrate-push-provider)`).
- Voice memo branch (`window === 'evening'` etc.) intentionally omitted — text
  only at MVP per PRD.

## Tests

```bash
pnpm --filter @fa/agent-daily-brief test
```

Mocks `@fa/db`, `@fa/claude`, and the aggregator. The notification dispatcher
seam captures push calls without hitting any network.
