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
