import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RealTwilioAdapter } from '../src/real-adapter';

// RealTwilioAdapter is the production seam. These tests drive it with a mocked
// global fetch so a regression where getRecording() stops populating the
// transcript (the original TODO that always returned transcriptText:null, which
// made EVERY completed call read as no_savings) is caught.

const ENV = {
  TWILIO_ACCOUNT_SID: 'AC_test',
  TWILIO_AUTH_TOKEN: 'tok',
  TWILIO_PHONE_NUMBER: '+14155550100',
};

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('RealTwilioAdapter.placeCall', () => {
  const CALL_ENV = { ...ENV, TWILIO_VOICE_TWIML_URL: 'https://app.example.com/api/voice/twiml' };
  beforeEach(() => {
    Object.assign(process.env, CALL_ENV);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    for (const k of Object.keys(CALL_ENV)) delete process.env[k as keyof typeof CALL_ENV];
  });

  function capturePlaceCall() {
    const seen: { url: string; init: RequestInit } = { url: '', init: {} };
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      seen.url = String(url);
      seen.init = init ?? {};
      return jsonResponse({ sid: 'CA_test', status: 'queued' });
    });
    vi.stubGlobal('fetch', fetchMock);
    return seen;
  }

  it('does NOT send the non-existent I-Twilio-Idempotency-Token header (Twilio does not honor it on Create Call)', async () => {
    const seen = capturePlaceCall();
    await new RealTwilioAdapter().placeCall({
      to: '+18005551212',
      script: 'Hello, I would like to lower my bill.',
      idempotencyKey: 'bill-neg:action-1:bill-1',
      metadata: { negotiationId: 'neg-1' },
    });
    const headers = (seen.init.headers ?? {}) as Record<string, string>;
    expect(Object.keys(headers)).not.toContain('I-Twilio-Idempotency-Token');
  });

  it('passes ONLY negotiationId in the TwiML Url — never the full script', async () => {
    const seen = capturePlaceCall();
    const script = 'A very long negotiation script that must never appear in the request URL.';
    await new RealTwilioAdapter().placeCall({
      to: '+18005551212',
      script,
      idempotencyKey: 'bill-neg:action-1:bill-1',
      metadata: { negotiationId: 'neg-42' },
    });
    // The Url form field (sent to Twilio) carries the negotiationId, not the script.
    const body = String((seen.init.body as URLSearchParams) ?? '');
    const params = new URLSearchParams(body);
    const twimlUrl = params.get('Url') ?? '';
    expect(twimlUrl).toContain('negotiationId=neg-42');
    expect(twimlUrl).not.toContain('script=');
    expect(twimlUrl).not.toContain(encodeURIComponent('negotiation script'));
  });

  it('throws when no negotiationId is supplied (script is looked up by id)', async () => {
    capturePlaceCall();
    await expect(
      new RealTwilioAdapter().placeCall({
        to: '+18005551212',
        script: 'whatever',
        idempotencyKey: 'k',
      }),
    ).rejects.toThrow(/negotiationId required/);
  });
});

describe('RealTwilioAdapter.getRecording', () => {
  beforeEach(() => {
    Object.assign(process.env, ENV);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    for (const k of Object.keys(ENV)) delete process.env[k as keyof typeof ENV];
  });

  it('populates transcriptText from a completed Twilio transcription', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request): Promise<Response> => {
      const u = String(url);
      if (u.includes('/Recordings.json')) {
        return jsonResponse({ recordings: [{ sid: 'RE123', duration: '247' }] });
      }
      if (u.includes('/Recordings/RE123/Transcriptions.json')) {
        return jsonResponse({
          transcriptions: [
            { sid: 'TR1', status: 'completed', transcription_text: 'Rep: I can drop you to $60/mo.' },
          ],
        });
      }
      throw new Error(`unexpected fetch ${u}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const rec = await new RealTwilioAdapter().getRecording('CA1');
    expect(rec.transcriptText).toBe('Rep: I can drop you to $60/mo.');
    expect(rec.transcriptUrl).toContain('/Transcriptions/TR1.json');
    expect(rec.recordingUrl).toContain('/Recordings/RE123.mp3');
    expect(rec.durationSeconds).toBe(247);
  });

  it('fetches the transcription resource when the list omits the text', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request): Promise<Response> => {
      const u = String(url);
      if (u.includes('/Recordings.json')) {
        return jsonResponse({ recordings: [{ sid: 'RE9', duration: '120' }] });
      }
      if (u.includes('/Recordings/RE9/Transcriptions.json')) {
        return jsonResponse({ transcriptions: [{ sid: 'TR9', status: 'completed' }] });
      }
      if (u.includes('/Transcriptions/TR9.json')) {
        return jsonResponse({ transcription_text: 'Rep: new rate is $45.' });
      }
      throw new Error(`unexpected fetch ${u}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const rec = await new RealTwilioAdapter().getRecording('CA2');
    expect(rec.transcriptText).toBe('Rep: new rate is $45.');
  });

  it('returns null transcript (not an error) when no completed transcription exists', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request): Promise<Response> => {
      const u = String(url);
      if (u.includes('/Recordings.json')) {
        return jsonResponse({ recordings: [{ sid: 'RE0', duration: '60' }] });
      }
      if (u.includes('/Transcriptions.json')) {
        return jsonResponse({ transcriptions: [{ sid: 'TR0', status: 'in-progress' }] });
      }
      throw new Error(`unexpected fetch ${u}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const rec = await new RealTwilioAdapter().getRecording('CA3');
    expect(rec.transcriptText).toBeNull();
    expect(rec.transcriptUrl).toBeNull();
    // Recording still returned — the agent routes this to human review.
    expect(rec.recordingUrl).toContain('/Recordings/RE0.mp3');
  });

  it('returns all-null when there is no recording at all', async () => {
    const fetchMock = vi.fn(async (): Promise<Response> => jsonResponse({ recordings: [] }));
    vi.stubGlobal('fetch', fetchMock);

    const rec = await new RealTwilioAdapter().getRecording('CA4');
    expect(rec.recordingUrl).toBeNull();
    expect(rec.transcriptText).toBeNull();
  });
});
