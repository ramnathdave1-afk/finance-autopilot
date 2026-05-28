// Shared test helpers — MockTwilioAdapter. Mirrors @fa/stripe's MockAdapter.
//
// The mock is fully scriptable so the bill-negotiation agent tests can drive
// happy-path, no-savings, and call-failed scenarios without any network I/O.

import { vi } from 'vitest';
import type {
  TwilioPort,
  PlaceCallInput,
  PlacedCall,
  CallStatus,
  CallStatusValue,
  CallRecording,
  TtsInput,
  TtsResult,
} from '../src/adapter';

export interface MockTwilioOptions {
  /** Status returned by placeCall. Default 'in-progress'. */
  placeStatus?: CallStatusValue;
  /** Terminal status returned by getCallStatus. Default 'completed'. */
  finalStatus?: CallStatusValue;
  /** Connected duration reported on completion. Default 240. */
  durationSeconds?: number;
  /** Recording URL returned by getRecording. Default a test URL. */
  recordingUrl?: string | null;
  /** Transcript URL returned by getRecording. Default null. */
  transcriptUrl?: string | null;
  /** Transcript text returned by getRecording. Default null. */
  transcriptText?: string | null;
  /** If set, placeCall rejects with this message (provider-side failure). */
  placeCallError?: string;
}

export class MockTwilioAdapter implements TwilioPort {
  constructor(private readonly opts: MockTwilioOptions = {}) {}

  placeCall = vi.fn(async (input: PlaceCallInput): Promise<PlacedCall> => {
    if (this.opts.placeCallError) throw new Error(this.opts.placeCallError);
    return {
      callSid: `CA_${input.idempotencyKey}`,
      status: this.opts.placeStatus ?? 'in-progress',
    };
  });

  getCallStatus = vi.fn(async (callSid: string): Promise<CallStatus> => {
    const status = this.opts.finalStatus ?? 'completed';
    const connected = status === 'completed';
    return {
      callSid,
      status,
      durationSeconds: connected ? (this.opts.durationSeconds ?? 240) : null,
      startedAt: '2026-05-28T17:00:00.000Z',
      endedAt: connected ? '2026-05-28T17:04:00.000Z' : null,
    };
  });

  getRecording = vi.fn(async (callSid: string): Promise<CallRecording> => {
    const recordingUrl =
      this.opts.recordingUrl === undefined
        ? `https://recordings.twilio.test/${callSid}.mp3`
        : this.opts.recordingUrl;
    return {
      callSid,
      recordingUrl,
      transcriptUrl: this.opts.transcriptUrl ?? null,
      transcriptText: this.opts.transcriptText ?? null,
      durationSeconds: this.opts.durationSeconds ?? 240,
    };
  });

  synthesize = vi.fn(async (input: TtsInput): Promise<TtsResult> => ({
    audioBytes: new Uint8Array([0x49, 0x44, 0x33]), // "ID3"
    mimeType: 'audio/mpeg',
    durationSec: Math.max(1, Math.round(input.text.length / 12)),
  }));
}
