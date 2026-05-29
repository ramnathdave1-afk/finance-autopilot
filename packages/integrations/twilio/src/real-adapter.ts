// RealTwilioAdapter — the live, env-key-driven implementation of TwilioPort.
//
// This is the production seam. It is NEVER used by unit tests (those inject
// MockTwilioAdapter). It is intentionally a thin, dependency-light wrapper
// over the Twilio REST API + an ElevenLabs TTS POST, using global `fetch`
// (Node 18+/20+) so the package carries no SDK dependency until the
// integration step wires the official `twilio` SDK.
//
// To go live: `setAdapter(new RealTwilioAdapter())` once at app boot, with the
// env vars from adapter.ts set. Nothing here fakes success — every method
// either returns the provider's real response or throws.

import {
  type TwilioPort,
  type PlaceCallInput,
  type PlacedCall,
  type CallStatus,
  type CallStatusValue,
  type CallRecording,
  type TtsInput,
  type TtsResult,
} from './adapter';

const TWILIO_API_BASE = 'https://api.twilio.com/2010-04-01';

interface TwilioEnv {
  accountSid: string;
  authToken: string;
  phoneNumber: string;
}

function readEnv(): TwilioEnv {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const phoneNumber = process.env.TWILIO_PHONE_NUMBER;
  if (!accountSid) throw new Error('TWILIO_ACCOUNT_SID not set');
  if (!authToken) throw new Error('TWILIO_AUTH_TOKEN not set');
  if (!phoneNumber) throw new Error('TWILIO_PHONE_NUMBER not set');
  return { accountSid, authToken, phoneNumber };
}

function authHeader(env: TwilioEnv): string {
  return `Basic ${Buffer.from(`${env.accountSid}:${env.authToken}`).toString('base64')}`;
}

/**
 * Build the TwiML webhook URL Twilio fetches when the call connects, carrying
 * the negotiation script + correlation id as query params so the app's
 * /api/voice/twiml route can voice the exact script for this call. Throws if no
 * base URL is configured — we never place a call that would <Say> nothing.
 */
function buildTwimlUrl(
  base: string | undefined,
  q: { script: string; negotiationId?: string | undefined },
): string {
  if (!base) throw new Error('TWILIO_VOICE_TWIML_URL not set — cannot host the negotiation TwiML');
  const url = new URL(base);
  url.searchParams.set('script', q.script);
  if (q.negotiationId) url.searchParams.set('negotiationId', q.negotiationId);
  return url.toString();
}

function mapStatus(raw: string): CallStatusValue {
  // Twilio call statuses map 1:1 onto our union; default to 'failed' if the
  // provider returns something unrecognized so we never claim success.
  const known: CallStatusValue[] = [
    'queued',
    'initiated',
    'ringing',
    'in-progress',
    'completed',
    'busy',
    'no-answer',
    'failed',
    'canceled',
  ];
  return (known as string[]).includes(raw) ? (raw as CallStatusValue) : 'failed';
}

export class RealTwilioAdapter implements TwilioPort {
  async placeCall(input: PlaceCallInput): Promise<PlacedCall> {
    const env = readEnv();
    const from = input.from ?? env.phoneNumber;

    // The script is delivered to the call via TwiML built by the app's webhook
    // (apps/web /api/voice/twiml). Twilio fetches that Url when the call
    // connects; we append the script + correlation metadata as query params so
    // the route can voice the exact script for THIS call. The status-callback
    // route (apps/web /api/voice/status) receives call lifecycle events and
    // updates the bill_negotiations row / agent_actions.
    const twimlUrl = buildTwimlUrl(process.env.TWILIO_VOICE_TWIML_URL, {
      script: input.script,
      negotiationId: input.metadata?.negotiationId,
    });
    const body = new URLSearchParams({
      To: input.to,
      From: from,
      // Url must point at the app's TwiML endpoint that voices `script`.
      Url: twimlUrl,
      Record: 'true',
      RecordingChannels: 'dual',
    });
    // Status callbacks → the app's status route, which closes out the row.
    const statusCallback = process.env.TWILIO_VOICE_STATUS_CALLBACK_URL;
    if (statusCallback) {
      body.set('StatusCallback', statusCallback);
      body.set('StatusCallbackMethod', 'POST');
      // Twilio repeats the param key per value for arrays.
      for (const ev of ['initiated', 'ringing', 'answered', 'completed']) {
        body.append('StatusCallbackEvent', ev);
      }
    }

    const res = await fetch(`${TWILIO_API_BASE}/Accounts/${env.accountSid}/Calls.json`, {
      method: 'POST',
      headers: {
        Authorization: authHeader(env),
        'Content-Type': 'application/x-www-form-urlencoded',
        // Twilio dedupes on this header for POSTs that support it.
        'I-Twilio-Idempotency-Token': input.idempotencyKey,
      },
      body,
    });
    if (!res.ok) {
      throw new Error(`Twilio placeCall HTTP ${res.status}: ${await res.text()}`);
    }
    const json = (await res.json()) as { sid: string; status: string };
    return { callSid: json.sid, status: mapStatus(json.status) };
  }

  async getCallStatus(callSid: string): Promise<CallStatus> {
    const env = readEnv();
    const res = await fetch(
      `${TWILIO_API_BASE}/Accounts/${env.accountSid}/Calls/${callSid}.json`,
      { headers: { Authorization: authHeader(env) } },
    );
    if (!res.ok) {
      throw new Error(`Twilio getCallStatus HTTP ${res.status}: ${await res.text()}`);
    }
    const json = (await res.json()) as {
      status: string;
      duration: string | null;
      start_time: string | null;
      end_time: string | null;
    };
    return {
      callSid,
      status: mapStatus(json.status),
      durationSeconds: json.duration ? Number(json.duration) : null,
      startedAt: json.start_time ?? null,
      endedAt: json.end_time ?? null,
    };
  }

  async getRecording(callSid: string): Promise<CallRecording> {
    const env = readEnv();
    const res = await fetch(
      `${TWILIO_API_BASE}/Accounts/${env.accountSid}/Calls/${callSid}/Recordings.json`,
      { headers: { Authorization: authHeader(env) } },
    );
    if (!res.ok) {
      throw new Error(`Twilio getRecording HTTP ${res.status}: ${await res.text()}`);
    }
    const json = (await res.json()) as {
      recordings: Array<{ sid: string; duration: string | null }>;
    };
    const first = json.recordings[0];
    if (!first) {
      return {
        callSid,
        recordingUrl: null,
        transcriptUrl: null,
        transcriptText: null,
        durationSeconds: null,
      };
    }
    // Twilio recording media is served at the recording resource + .mp3.
    const recordingUrl = `${TWILIO_API_BASE}/Accounts/${env.accountSid}/Recordings/${first.sid}.mp3`;

    // Fetch the recording's Transcription resource so the agent can analyze
    // what the rep actually agreed to. Without a transcript the agent cannot
    // honestly report savings — so we retrieve the completed transcript text
    // and surface it (and its URL). If no transcript exists yet (recording not
    // transcribed, or transcription still queued/in-progress), transcriptText
    // stays null and the caller routes the call to human review rather than
    // silently recording it as "no savings".
    const { transcriptText, transcriptUrl } = await this.fetchTranscript(env, first.sid);

    return {
      callSid,
      recordingUrl,
      transcriptUrl,
      transcriptText,
      durationSeconds: first.duration ? Number(first.duration) : null,
    };
  }

  /**
   * Retrieve the completed transcript for a recording via the Twilio
   * Transcriptions resource. Returns nulls (not an error) when no completed
   * transcription is available yet — the agent treats that as "needs review",
   * never as a confirmed no-savings outcome.
   */
  private async fetchTranscript(
    env: TwilioEnv,
    recordingSid: string,
  ): Promise<{ transcriptText: string | null; transcriptUrl: string | null }> {
    const listRes = await fetch(
      `${TWILIO_API_BASE}/Accounts/${env.accountSid}/Recordings/${recordingSid}/Transcriptions.json`,
      { headers: { Authorization: authHeader(env) } },
    );
    if (!listRes.ok) {
      throw new Error(
        `Twilio fetchTranscript(list) HTTP ${listRes.status}: ${await listRes.text()}`,
      );
    }
    const listJson = (await listRes.json()) as {
      transcriptions: Array<{ sid: string; status: string; transcription_text?: string | null }>;
    };
    // Prefer a completed transcription.
    const completed = listJson.transcriptions.find((t) => t.status === 'completed');
    if (!completed) {
      return { transcriptText: null, transcriptUrl: null };
    }
    const transcriptUrl = `${TWILIO_API_BASE}/Accounts/${env.accountSid}/Transcriptions/${completed.sid}.json`;
    // The list payload may already carry the text; if not, fetch the resource.
    if (completed.transcription_text && completed.transcription_text.trim().length > 0) {
      return { transcriptText: completed.transcription_text, transcriptUrl };
    }
    const txtRes = await fetch(transcriptUrl, {
      headers: { Authorization: authHeader(env) },
    });
    if (!txtRes.ok) {
      throw new Error(
        `Twilio fetchTranscript(get) HTTP ${txtRes.status}: ${await txtRes.text()}`,
      );
    }
    const txtJson = (await txtRes.json()) as { transcription_text?: string | null };
    const text =
      txtJson.transcription_text && txtJson.transcription_text.trim().length > 0
        ? txtJson.transcription_text
        : null;
    return { transcriptText: text, transcriptUrl: text ? transcriptUrl : null };
  }

  async synthesize(input: TtsInput): Promise<TtsResult> {
    const key = process.env.ELEVENLABS_API_KEY;
    const voiceId = input.voiceId ?? process.env.ELEVENLABS_VOICE_ID ?? '21m00Tcm4TlvDq8ikWAM';
    if (!key) throw new Error('ELEVENLABS_API_KEY not set');

    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': key,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text: input.text,
        model_id: 'eleven_turbo_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    });
    if (!res.ok) throw new Error(`ElevenLabs HTTP ${res.status}`);
    const buf = new Uint8Array(await res.arrayBuffer());
    // ElevenLabs mp3 ~32 kbps → 4 KB/sec.
    const durationSec = Math.max(1, Math.round(buf.byteLength / 4000));
    return { audioBytes: buf, mimeType: 'audio/mpeg', durationSec };
  }
}
