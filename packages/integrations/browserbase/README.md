# @fa/browserbase

Typed wrapper around Browserbase + Stagehand for the subscription killer
(PRD §8.2 Agent 1) and any future web-automation agent.

## Surface

```ts
import {
  createSession,
  loginAndNavigate,
  clickCancelFlow,
  confirmCancellation,
  stepRecorder,
} from '@fa/browserbase';

const session = await createSession(userId);
const recorder = stepRecorder(actionId);
try {
  const login = await loginAndNavigate(session, spec.loginUrl, credentials);
  await recorder.attachScreenshot('login', login.ok, login.screenshot);

  await session.navigate(spec.billingUrl);
  const cancel = await clickCancelFlow(session, 'Click the Cancel Membership button.');
  await recorder.attachScreenshot('click-cancel', cancel.ok, cancel.screenshot);

  const confirm = await confirmCancellation(session, 'Confirm cancellation.', spec.successSelector);
  await recorder.attachScreenshot('confirm', confirm.ok, confirm.screenshot);
} finally {
  await session.close();
}
```

## Architecture

- `BrowserSession` — public typed handle. Methods: `navigate`, `act`,
  `extract<T>(zodSchema)`, `observe`, `screenshot`, `close`.
- `BrowserAdapter` — pluggable low-level interface. The default throws
  `TODO(integrate-browserbase-sdk)` so any accidental prod call fails loudly.
- `stagehand.ts` — three battle-tested patterns: login + navigate, click
  cancel, confirm cancellation. Each returns `{ ok, screenshot, reason? }`.
- `recorder.ts` — pipes step + screenshot URL into `@fa/db` `logStep`.
- `test-harness.ts` — `replayFromHar(harPath, scenario)` builds a fake
  adapter that walks a recorded script. Tests fail loud if the agent
  diverges from the recording.

## Testing

Tests inject a mock adapter via `setBrowserAdapterFactory`. Real HTTP
never fires. See `tests/fixtures/*.har.json` for the script format —
small subset of HAR, just enough to drive happy + failure paths.

## Security

- Credentials are passed inline into `session.act(...)` and live only in
  remote browser memory. **Adapters must not log them.**
- The default adapter throws — there is no way to accidentally hit the
  real network without explicitly wiring an adapter factory.

## TODOs

- `TODO(integrate-browserbase-sdk)` — wire `@browserbasehq/sdk` +
  `@browserbasehq/stagehand` inside a new `BrowserbaseAdapter` and register
  it as the default factory in `apps/web` server bootstrap.
