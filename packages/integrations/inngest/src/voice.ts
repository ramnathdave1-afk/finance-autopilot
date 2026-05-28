// Voice memo briefing — TTS for the daily_brief voice variant.
//
// Pipeline:
//   1. Caller passes brief text + userId + actionId.
//   2. TTSAdapter generates an audio buffer (ElevenLabs primary, Twilio Media
//      fallback).
//   3. Upload to Supabase Storage bucket "voice-memos" — path
//      `${userId}/${actionId}.mp3`.
//   4. Update agent_actions.voice_recording_url with the signed URL.
//   5. Return the URL so the agent's notify step can attach it.
//
// Env vars:
//   ELEVENLABS_API_KEY          primary TTS
//   ELEVENLABS_VOICE_ID         e.g. 21m00Tcm4TlvDq8ikWAM (Rachel)
//   TWILIO_ACCOUNT_SID          fallback (Twilio Media TTS)
//   TWILIO_AUTH_TOKEN
//
// Storage:
//   Bucket "voice-memos" must exist with RLS:
//     - owner can read (signed URL flows fine)
//     - service role can write
//   TODO(integrate-t2-migration: voice-memos bucket policy)

import { createServiceClient } from '@fa/db';

export interface TTSInput {
  text: string;
  /** Voice persona — passed through to ElevenLabs voice id; ignored by Twilio. */
  voiceId?: string;
}

export interface TTSResult {
  audioBytes: Uint8Array;
  mimeType: 'audio/mpeg' | 'audio/wav';
  durationSec: number;
}

export interface TTSAdapter {
  synthesize(input: TTSInput): Promise<TTSResult>;
  /** Identifier for logging — 'elevenlabs', 'twilio', or 'mock'. */
  name: string;
}

// ─── ElevenLabs adapter ────────────────────────────────────────────────────
class ElevenLabsAdapter implements TTSAdapter {
  name = 'elevenlabs';
  async synthesize(input: TTSInput): Promise<TTSResult> {
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
    // Rough estimate: ElevenLabs mp3 ~32 kbps → 4 KB/sec.
    const durationSec = Math.max(1, Math.round(buf.byteLength / 4000));
    return { audioBytes: buf, mimeType: 'audio/mpeg', durationSec };
  }
}

// ─── OpenAI TTS fallback adapter ──────────────────────────────────────────
// Originally specced as "Twilio Media" but Twilio's TTS path runs during a
// live call, not as a file artifact. OpenAI TTS is a single HTTP POST that
// returns raw audio bytes — closer to the brief's intent (file-based
// fallback when ElevenLabs hits a quota / outage). Same env var convention.
class OpenAITTSAdapter implements TTSAdapter {
  name = 'openai';
  async synthesize(input: TTSInput): Promise<TTSResult> {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error('OPENAI_API_KEY not set');

    const voice = process.env.OPENAI_TTS_VOICE ?? 'alloy';
    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        model: 'tts-1',
        voice,
        input: input.text,
        response_format: 'mp3',
      }),
    });
    if (!res.ok) throw new Error(`OpenAI TTS HTTP ${res.status}`);
    const buf = new Uint8Array(await res.arrayBuffer());
    // tts-1 mp3 ~32 kbps → 4 KB/sec.
    const durationSec = Math.max(1, Math.round(buf.byteLength / 4000));
    return { audioBytes: buf, mimeType: 'audio/mpeg', durationSec };
  }
}

let _primary: TTSAdapter = new ElevenLabsAdapter();
let _fallback: TTSAdapter = new OpenAITTSAdapter();

export function setTTSAdapters(opts: { primary?: TTSAdapter; fallback?: TTSAdapter }): void {
  if (opts.primary) _primary = opts.primary;
  if (opts.fallback) _fallback = opts.fallback;
}
export function _resetTTSAdapters(): void {
  _primary = new ElevenLabsAdapter();
  _fallback = new OpenAITTSAdapter();
}

// ─── Storage upload ───────────────────────────────────────────────────────
export interface StoreVoiceMemoOptions {
  userId: string;
  actionId: string;
  /** Bucket name; default 'voice-memos'. */
  bucket?: string;
  /** TTL for the signed URL in seconds; default 7 days. */
  signedUrlTtlSec?: number;
}

export interface SynthesizeAndStoreResult {
  url: string;
  durationSec: number;
  adapter: string;
  /** True if the primary adapter failed and we fell back. */
  fallbackUsed: boolean;
}

/**
 * Synthesize text, upload to Supabase Storage, set voice_recording_url on
 * the agent_action. Returns the signed URL ready to attach to the push.
 */
export async function synthesizeAndStore(
  text: string,
  opts: StoreVoiceMemoOptions,
): Promise<SynthesizeAndStoreResult> {
  const bucket = opts.bucket ?? 'voice-memos';
  const ttl = opts.signedUrlTtlSec ?? 60 * 60 * 24 * 7;

  let tts: TTSResult;
  let adapterName: string;
  let fallbackUsed = false;

  try {
    tts = await _primary.synthesize({ text });
    adapterName = _primary.name;
  } catch (primaryErr) {
    fallbackUsed = true;
    try {
      tts = await _fallback.synthesize({ text });
      adapterName = _fallback.name;
    } catch (fallbackErr) {
      const a = primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
      const b = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
      throw new Error(`TTS failed: primary=${a} fallback=${b}`);
    }
  }

  const supabase = createServiceClient();
  const path = `${opts.userId}/${opts.actionId}.mp3`;

  const { error: upErr } = await supabase.storage.from(bucket).upload(path, tts.audioBytes, {
    contentType: tts.mimeType,
    upsert: true,
  });
  if (upErr) throw new Error(`storage upload failed: ${upErr.message}`);

  const { data: signed, error: signErr } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, ttl);
  if (signErr || !signed?.signedUrl) {
    throw new Error(`signed url failed: ${signErr?.message ?? 'no url'}`);
  }

  const { error: updateErr } = await supabase
    .from('agent_actions')
    .update({ voice_recording_url: signed.signedUrl })
    .eq('id', opts.actionId);
  if (updateErr) {
    // Non-fatal — the audio exists, the URL is just not persisted. Log + return.
    // eslint-disable-next-line no-console
    console.warn(`[voice] persisted audio but failed to update action: ${updateErr.message}`);
  }

  return { url: signed.signedUrl, durationSec: tts.durationSec, adapter: adapterName, fallbackUsed };
}
