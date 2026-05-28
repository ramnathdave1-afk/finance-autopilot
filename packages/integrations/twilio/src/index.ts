// Public surface of @fa/twilio.

export {
  StubAdapter,
  setAdapter,
  getAdapter,
  _resetAdapter,
  type TwilioPort,
  type PlaceCallInput,
  type PlacedCall,
  type CallStatus,
  type CallStatusValue,
  type CallRecording,
  type TtsInput,
  type TtsResult,
} from './adapter';

export { RealTwilioAdapter } from './real-adapter';

export {
  placeCall,
  getCallStatus,
  getRecording,
  synthesize,
  isTerminalStatus,
  isConnectedCompletion,
} from './voice';
