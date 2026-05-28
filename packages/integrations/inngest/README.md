# @fa/inngest

Agent orchestration primitive. Every Phase-1 agent registers through `defineAgent`.

## Surface

```ts
import { defineAgent, runAgent, sendPush, sendVoiceMemo, writeAuditEntry } from '@fa/inngest';

const dailyBrief = defineAgent<{ window: 'morning' | 'evening' }>({
  type: 'daily_brief',
  actionType: 'send_brief',
  requiresApproval: false,
  idempotencyKey: (i) => `brief:${new Date().toISOString().slice(0, 10)}:${i.window}`,
  run: async (input, ctx) => {
    await ctx.log('aggregating', true);
    // ... do work
    await sendPush(ctx.userId, { title: 'Daily brief', body: '...' });
    return { roi: null };
  },
});
```

## Contract (per PRD §10)

- **Idempotency key** prevents double-execution. Same key → same `action_id`.
- **3 retries with exponential backoff** (250ms, 500ms, 1000ms, 2000ms).
- **Audit log on every step** via `@fa/db` `logStep`.
- **Escalation** after retries exhaust: status → `failed` → `escalated`.
- **`onFailure` hook** for refund_eligible toggling or other cleanup.
- **Approval gate**: `requiresApproval: true` → row created `awaiting_approval`, no `run` yet. T1 web app flips status via API.

## Notification stubs

`sendPush` and `sendVoiceMemo` are no-op stubs that log to console.
TODO(integrate-push-provider): swap to Expo Push + OneSignal.
TODO(integrate-voice): wire to Twilio + RKV voice stack.

Tests use `setNotificationDispatcher()` to capture calls.

## Production wiring

The local `runAgent()` is what tests + dev use. In production, `apps/web/app/api/inngest/route.ts` should:

1. Import every registered agent (just `import` the agent files to trigger `defineAgent` side-effect).
2. `inngest.createFunction({ id, retries: 3 }, { event }, ctx => runAgent(def, ...))`.
3. Serve via the official Inngest Next.js handler.

The audit-log + status-transition contract is the source of truth either way.
