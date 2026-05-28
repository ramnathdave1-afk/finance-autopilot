// Notification dispatcher. Stubs at launch — real push (Expo Push, OneSignal)
// + voice memo (Twilio + RKV voice stack) plug in here later. Single seam so
// agents call sendPush() / sendVoiceMemo() without knowing the transport.

export interface NotificationDispatcher {
  push(userId: string, msg: { title: string; body: string; data?: Record<string, unknown> }): Promise<void>;
  voiceMemo(userId: string, audioUrl: string, transcript: string): Promise<void>;
}

class StubDispatcher implements NotificationDispatcher {
  async push(userId: string, msg: { title: string; body: string }): Promise<void> {
    // TODO(integrate-push-provider): wire to Expo Push + OneSignal
    // eslint-disable-next-line no-console
    console.log(`[push:${userId}] ${msg.title} — ${msg.body}`);
  }
  async voiceMemo(userId: string, audioUrl: string, transcript: string): Promise<void> {
    // TODO(integrate-voice): wire to push provider w/ voice attachment
    // eslint-disable-next-line no-console
    console.log(`[voice:${userId}] ${audioUrl} (${transcript.slice(0, 80)}...)`);
  }
}

let _dispatcher: NotificationDispatcher = new StubDispatcher();

export function setNotificationDispatcher(d: NotificationDispatcher): void {
  _dispatcher = d;
}

export async function sendPush(
  userId: string,
  msg: { title: string; body: string; data?: Record<string, unknown> },
): Promise<void> {
  return _dispatcher.push(userId, msg);
}

export async function sendVoiceMemo(userId: string, audioUrl: string, transcript: string): Promise<void> {
  return _dispatcher.voiceMemo(userId, audioUrl, transcript);
}
