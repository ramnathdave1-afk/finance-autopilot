import { afterEach, describe, expect, it } from 'vitest';
import {
  setAdapter,
  getAdapter,
  _resetAdapter,
  StubAdapter,
  placeCall,
  getCallStatus,
  getRecording,
  synthesize,
  isTerminalStatus,
  isConnectedCompletion,
} from '../src';
import { MockTwilioAdapter } from './_helpers';

afterEach(() => {
  _resetAdapter();
});

describe('TwilioPort wiring', () => {
  it('defaults to a StubAdapter that throws loudly (never fakes success)', async () => {
    expect(getAdapter()).toBeInstanceOf(StubAdapter);
    await expect(
      placeCall({ to: '+15551234567', script: 'hi', idempotencyKey: 'k1' }),
    ).rejects.toThrow(/TODO\(integrate-twilio-sdk\)/);
    await expect(getCallStatus('CA1')).rejects.toThrow(/TODO\(integrate-twilio-sdk\)/);
    await expect(getRecording('CA1')).rejects.toThrow(/TODO\(integrate-twilio-sdk\)/);
    await expect(synthesize({ text: 'hi' })).rejects.toThrow(/TODO\(integrate-twilio-sdk\)/);
  });

  it('routes facade calls through the injected adapter', async () => {
    const mock = new MockTwilioAdapter();
    setAdapter(mock);

    const placed = await placeCall({
      to: '+15551234567',
      script: 'negotiate please',
      idempotencyKey: 'neg-1',
    });
    expect(placed.callSid).toBe('CA_neg-1');
    expect(placed.status).toBe('in-progress');
    expect(mock.placeCall).toHaveBeenCalledOnce();

    const status = await getCallStatus(placed.callSid);
    expect(status.status).toBe('completed');
    expect(status.durationSeconds).toBe(240);

    const rec = await getRecording(placed.callSid);
    expect(rec.recordingUrl).toContain(placed.callSid);

    const tts = await synthesize({ text: 'hello world' });
    expect(tts.mimeType).toBe('audio/mpeg');
    expect(tts.durationSec).toBeGreaterThan(0);
  });

  it('surfaces a provider-side placeCall failure', async () => {
    setAdapter(new MockTwilioAdapter({ placeCallError: 'rate-limited' }));
    await expect(
      placeCall({ to: '+1', script: 's', idempotencyKey: 'k' }),
    ).rejects.toThrow('rate-limited');
  });

  it('classifies terminal vs connected statuses', () => {
    expect(isTerminalStatus('completed')).toBe(true);
    expect(isTerminalStatus('no-answer')).toBe(true);
    expect(isTerminalStatus('ringing')).toBe(false);
    expect(isConnectedCompletion('completed')).toBe(true);
    expect(isConnectedCompletion('failed')).toBe(false);
  });
});
