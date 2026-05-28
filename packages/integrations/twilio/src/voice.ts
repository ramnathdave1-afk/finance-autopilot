// Programmable Voice facade — the surface agents call. Every function routes
// through the active TwilioPort (StubAdapter by default, MockTwilioAdapter in
// tests, RealTwilioAdapter in prod). Keeping the facade thin means agents
// depend on `@fa/twilio` functions, not on the port shape directly.

import { getAdapter } from './adapter';
import type {
  PlaceCallInput,
  PlacedCall,
  CallStatus,
  CallRecording,
  TtsInput,
  TtsResult,
} from './adapter';

/** Initiate an outbound negotiation call. */
export async function placeCall(input: PlaceCallInput): Promise<PlacedCall> {
  return getAdapter().placeCall(input);
}

/** Poll the live status of a call by SID. */
export async function getCallStatus(callSid: string): Promise<CallStatus> {
  return getAdapter().getCallStatus(callSid);
}

/** Fetch the recording + transcript for a completed call. */
export async function getRecording(callSid: string): Promise<CallRecording> {
  return getAdapter().getRecording(callSid);
}

/** Synthesize a script to speech. */
export async function synthesize(input: TtsInput): Promise<TtsResult> {
  return getAdapter().synthesize(input);
}

/** A call status is terminal when no further transitions are expected. */
export function isTerminalStatus(status: CallStatus['status']): boolean {
  return (
    status === 'completed' ||
    status === 'busy' ||
    status === 'no-answer' ||
    status === 'failed' ||
    status === 'canceled'
  );
}

/** True only when the call actually connected and finished cleanly. */
export function isConnectedCompletion(status: CallStatus['status']): boolean {
  return status === 'completed';
}
