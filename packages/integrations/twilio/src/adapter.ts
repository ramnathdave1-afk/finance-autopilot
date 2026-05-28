// TwilioPort — the single seam between our code and the real Twilio
// Programmable Voice + TTS stack. Tests inject a MockTwilioAdapter.
// Production wires a RealTwilioAdapter that calls the Twilio REST API and an
// ElevenLabs/OpenAI TTS endpoint (TODO(integrate-twilio-sdk)).
//
// Anything that would talk to api.twilio.com / a TTS provider goes through
// here, so the rest of the codebase stays SDK-free and testable.
//
// CRITICAL: the agent NEVER fakes a successful call. Unit tests run against
// MockTwilioAdapter; the live path is the RealTwilioAdapter, key-driven from
// the env. Code is "live-ready, mock-tested".
//
// Env vars (RealTwilioAdapter):
//   TWILIO_ACCOUNT_SID        account identifier
//   TWILIO_AUTH_TOKEN         REST auth
//   TWILIO_PHONE_NUMBER       caller id (E.164, e.g. +14155550100)
//   ELEVENLABS_API_KEY        TTS primary
//   ELEVENLABS_VOICE_ID       e.g. 21m00Tcm4TlvDq8ikWAM (Rachel)

export type CallStatusValue =
  | 'queued'
  | 'initiated'
  | 'ringing'
  | 'in-progress'
  | 'completed'
  | 'busy'
  | 'no-answer'
  | 'failed'
  | 'canceled';

export interface PlaceCallInput {
  /** Destination number in E.164 (the provider's support line). */
  to: string;
  /** Caller id in E.164. Defaults to TWILIO_PHONE_NUMBER in the real adapter. */
  from?: string | undefined;
  /**
   * The negotiation script the AI voice reads / works from. The real adapter
   * passes this to the call's media/agent layer (TwiML + TTS or a Media
   * Streams bridge). The mock records it.
   */
  script: string;
  /** Optional voice persona id for TTS (ElevenLabs voice id). */
  voiceId?: string | undefined;
  /** Stable key — used to dedupe call placement on retries. */
  idempotencyKey: string;
  /** Free-form metadata propagated for correlation (e.g. negotiation id). */
  metadata?: Record<string, string> | undefined;
}

export interface PlacedCall {
  /** Twilio Call SID (CAxxxxxxxx). */
  callSid: string;
  status: CallStatusValue;
}

export interface CallStatus {
  callSid: string;
  status: CallStatusValue;
  /** Seconds the call was connected. Null until completed. */
  durationSeconds: number | null;
  startedAt: string | null;
  endedAt: string | null;
}

export interface CallRecording {
  callSid: string;
  /** Signed/public URL to the call recording (mp3/wav). Null if none. */
  recordingUrl: string | null;
  /** URL to a machine transcript, if the provider produced one. */
  transcriptUrl: string | null;
  /**
   * Plain-text transcript of the call, if available. Consumers (e.g. the
   * bill-negotiation agent) analyze this to extract the negotiated outcome.
   * Null when the provider only returns audio.
   */
  transcriptText: string | null;
  durationSeconds: number | null;
}

export interface TtsInput {
  text: string;
  /** ElevenLabs voice id; falls back to ELEVENLABS_VOICE_ID in the real impl. */
  voiceId?: string | undefined;
}

export interface TtsResult {
  audioBytes: Uint8Array;
  mimeType: 'audio/mpeg' | 'audio/wav';
  durationSec: number;
}

export interface TwilioPort {
  /** Place an outbound call. Throws on a provider-side rejection. */
  placeCall(input: PlaceCallInput): Promise<PlacedCall>;
  /** Poll the live status of a call. */
  getCallStatus(callSid: string): Promise<CallStatus>;
  /** Retrieve the recording (and transcript, if any) for a completed call. */
  getRecording(callSid: string): Promise<CallRecording>;
  /** Synthesize the negotiation script to audio (ElevenLabs/OpenAI). */
  synthesize(input: TtsInput): Promise<TtsResult>;
}

/**
 * Default port — every call throws. Production must call setAdapter() with a
 * real implementation; tests inject a MockTwilioAdapter. Throwing loudly here
 * means an un-wired prod path fails instead of silently faking success.
 */
export class StubAdapter implements TwilioPort {
  placeCall(): Promise<PlacedCall> {
    throw new Error('StubAdapter: setAdapter() with a real or mock Twilio adapter first — TODO(integrate-twilio-sdk)');
  }
  getCallStatus(): Promise<CallStatus> {
    throw new Error('StubAdapter: setAdapter() with a real or mock Twilio adapter first — TODO(integrate-twilio-sdk)');
  }
  getRecording(): Promise<CallRecording> {
    throw new Error('StubAdapter: setAdapter() with a real or mock Twilio adapter first — TODO(integrate-twilio-sdk)');
  }
  synthesize(): Promise<TtsResult> {
    throw new Error('StubAdapter: setAdapter() with a real or mock Twilio adapter first — TODO(integrate-twilio-sdk)');
  }
}

let _adapter: TwilioPort = new StubAdapter();

export function setAdapter(adapter: TwilioPort): void {
  _adapter = adapter;
}

export function getAdapter(): TwilioPort {
  return _adapter;
}

/** Test helper. Restores the stub. */
export function _resetAdapter(): void {
  _adapter = new StubAdapter();
}
