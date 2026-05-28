# @fa/twilio

Programmable Voice + TTS integration for the Bill-Negotiation agent (PRD §8.3, Agent 7).

Every call to Twilio / a TTS provider goes through a single `TwilioPort` seam
(`adapter.ts`), mirroring `@fa/stripe`'s adapter pattern:

- `StubAdapter` — the default. Every method throws with a `TODO(integrate-twilio-sdk)`
  marker so an un-wired production path fails loudly instead of faking success.
- `RealTwilioAdapter` (`real-adapter.ts`) — the live, env-key-driven implementation.
  Talks to the Twilio REST API for call placement / status / recordings and to
  ElevenLabs for TTS, using global `fetch` (no SDK dependency yet).
- `MockTwilioAdapter` (`tests/_helpers.ts`) — scriptable mock used by unit tests.

Wire the real adapter once at app boot:

```ts
import { setAdapter, RealTwilioAdapter } from '@fa/twilio';
setAdapter(new RealTwilioAdapter());
```

## Env

```
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_PHONE_NUMBER       # E.164 caller id
TWILIO_VOICE_TWIML_URL    # app endpoint that voices the negotiation script
ELEVENLABS_API_KEY
ELEVENLABS_VOICE_ID
```

## Facade

`placeCall`, `getCallStatus`, `getRecording`, `synthesize` route through the
active adapter. `isTerminalStatus` / `isConnectedCompletion` classify call
outcomes. Code is **live-ready, mock-tested** — the agent never pretends a live
call happened.
