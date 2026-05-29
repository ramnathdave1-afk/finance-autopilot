// TwiML helpers + Twilio webhook signature validation.
//
// These are dependency-light, SDK-free utilities the web app's voice webhook
// routes (apps/web /api/voice/twiml + /api/voice/status) use to:
//   1. render valid TwiML that voices the negotiation script, and
//   2. validate the X-Twilio-Signature on inbound webhook requests.
//
// Kept inside @fa/twilio (not the web app) so the telephony seam owns the
// provider contract and it can be unit-tested without Next.js.

import { createHmac } from 'node:crypto';

/** Escape the five XML predefined entities so a script can't break the TwiML. */
export function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export interface TwimlSayOptions {
  /** The negotiation script text the AI voice reads aloud. */
  script: string;
  /**
   * Optional fully-qualified URL to a pre-rendered TTS audio file (e.g. an
   * ElevenLabs mp3 stored in Supabase). When present we `<Play>` it instead of
   * Twilio's built-in `<Say>` for a more natural voice.
   */
  audioUrl?: string | null;
  /** Twilio <Say> voice. Default 'Polly.Joanna' (a natural Amazon Polly voice). */
  voice?: string;
}

/**
 * Build a TwiML document that voices the negotiation script. Falls back to a
 * safe, generic line if the script is empty so Twilio never receives invalid
 * TwiML (which would drop the call). When `audioUrl` is provided we `<Play>`
 * the pre-rendered TTS instead of `<Say>`.
 */
export function buildNegotiationTwiml(opts: TwimlSayOptions): string {
  const voice = opts.voice ?? 'Polly.Joanna';
  const inner =
    opts.audioUrl && opts.audioUrl.trim().length > 0
      ? `<Play>${escapeXml(opts.audioUrl)}</Play>`
      : `<Say voice="${escapeXml(voice)}">${escapeXml(
          opts.script.trim().length > 0
            ? opts.script
            : 'Hello, I am calling on behalf of a customer to review their account. Could you please connect me with billing?',
        )}</Say>`;
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`;
}

/**
 * Validate Twilio's X-Twilio-Signature for a webhook request.
 *
 * Twilio signs: the full request URL + the alphabetically-sorted, concatenated
 * POST form key/value pairs, HMAC-SHA1 with the account AuthToken, base64.
 * See https://www.twilio.com/docs/usage/security#validating-requests.
 *
 * `params` is the parsed application/x-www-form-urlencoded body. For GET/query
 * webhooks pass an empty object and include the query string in `url`.
 *
 * Returns false (never throws) on any mismatch so callers can branch.
 */
export function validateTwilioSignature(args: {
  authToken: string;
  signature: string | null | undefined;
  url: string;
  params: Record<string, string>;
}): boolean {
  if (!args.signature) return false;
  const sortedKeys = Object.keys(args.params).sort();
  let data = args.url;
  for (const k of sortedKeys) data += k + args.params[k];
  const expected = createHmac('sha1', args.authToken).update(Buffer.from(data, 'utf-8')).digest('base64');
  // Constant-time-ish comparison.
  if (expected.length !== args.signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ args.signature.charCodeAt(i);
  return diff === 0;
}
