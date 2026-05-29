import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildNegotiationTwiml, escapeXml, validateTwilioSignature } from '../src/twiml';

describe('buildNegotiationTwiml', () => {
  it('voices the script with <Say> and valid TwiML envelope', () => {
    const xml = buildNegotiationTwiml({ script: 'Hello, I would like to lower my bill.' });
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<Response>');
    expect(xml).toContain('<Say');
    expect(xml).toContain('Hello, I would like to lower my bill.');
  });

  it('escapes XML-special characters in the script (no TwiML injection)', () => {
    const xml = buildNegotiationTwiml({ script: 'A & B < C > D "q" \'p\'' });
    expect(xml).toContain('A &amp; B &lt; C &gt; D &quot;q&quot; &apos;p&apos;');
    // No raw closing </Response> can be injected via the script.
    expect(xml).not.toContain('< C');
  });

  it('falls back to a safe generic line when the script is empty', () => {
    const xml = buildNegotiationTwiml({ script: '   ' });
    expect(xml).toContain('<Say');
    expect(xml).toContain('connect me with billing');
  });

  it('uses <Play> when an audioUrl is provided', () => {
    const xml = buildNegotiationTwiml({ script: 'ignored', audioUrl: 'https://cdn.example/tts.mp3' });
    expect(xml).toContain('<Play>https://cdn.example/tts.mp3</Play>');
    expect(xml).not.toContain('<Say');
  });
});

describe('escapeXml', () => {
  it('escapes all five predefined entities', () => {
    expect(escapeXml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&apos;');
  });
});

describe('validateTwilioSignature', () => {
  const authToken = 'test_auth_token';
  const url = 'https://app.example.com/api/voice/status';
  const params = { CallSid: 'CA123', CallStatus: 'completed', CallDuration: '240' };

  function sign(u: string, p: Record<string, string>): string {
    let data = u;
    for (const k of Object.keys(p).sort()) data += k + p[k];
    return createHmac('sha1', authToken).update(Buffer.from(data, 'utf-8')).digest('base64');
  }

  it('accepts a correctly-signed request', () => {
    const signature = sign(url, params);
    expect(validateTwilioSignature({ authToken, signature, url, params })).toBe(true);
  });

  it('rejects a tampered body', () => {
    const signature = sign(url, params);
    const tampered = { ...params, CallStatus: 'busy' };
    expect(validateTwilioSignature({ authToken, signature, url, params: tampered })).toBe(false);
  });

  it('rejects a missing signature', () => {
    expect(validateTwilioSignature({ authToken, signature: null, url, params })).toBe(false);
  });

  it('is order-independent across param insertion order', () => {
    const signature = sign(url, params);
    const reordered = { CallDuration: '240', CallStatus: 'completed', CallSid: 'CA123' };
    expect(validateTwilioSignature({ authToken, signature, url, params: reordered })).toBe(true);
  });
});
