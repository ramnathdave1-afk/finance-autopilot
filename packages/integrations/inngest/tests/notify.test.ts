import { describe, it, expect, beforeEach, vi } from 'vitest';

const dbState = {
  tokens: new Map<string, Array<{ expo_token: string | null; onesignal_id: string | null }>>(),
  tableExists: true,
};

vi.mock('@fa/db', () => ({
  createServiceClient: () => ({
    from: () => ({
      select: () => ({
        eq: async (_col: string, userId: string) => {
          if (!dbState.tableExists) {
            return { data: null, error: { code: '42P01', message: 'undefined_table' } };
          }
          return { data: dbState.tokens.get(userId) ?? [], error: null };
        },
      }),
    }),
  }),
}));

import { notifyUser, setPushAdapter, _resetPushAdapter } from '../src/notify';

const expoSpy = vi.fn(async (_tokens: string[]) => ({ failed: [] as string[] }));
const oneSignalSpy = vi.fn(async (_ids: string[]) => {});

beforeEach(() => {
  dbState.tokens.clear();
  dbState.tableExists = true;
  expoSpy.mockReset();
  expoSpy.mockResolvedValue({ failed: [] });
  oneSignalSpy.mockReset();
  oneSignalSpy.mockResolvedValue(undefined);
  setPushAdapter({ sendExpo: expoSpy, sendOneSignal: oneSignalSpy });
});

describe('notifyUser', () => {
  it('delivers via Expo when tokens succeed', async () => {
    dbState.tokens.set('u1', [{ expo_token: 'ExpoToken[abc]', onesignal_id: null }]);
    const r = await notifyUser('u1', { title: 'hi', body: 'there' });
    expect(r.delivered).toBe('expo');
    expect(expoSpy).toHaveBeenCalledTimes(1);
    expect(oneSignalSpy).not.toHaveBeenCalled();
  });

  it('falls back to OneSignal when Expo returns failed tokens', async () => {
    dbState.tokens.set('u1', [
      { expo_token: 'ExpoToken[abc]', onesignal_id: null },
      { expo_token: null, onesignal_id: 'os-1' },
    ]);
    expoSpy.mockResolvedValueOnce({ failed: ['ExpoToken[abc]'] });
    const r = await notifyUser('u1', { title: 'hi', body: 'there' });
    expect(r.delivered).toBe('onesignal');
    expect(r.failedTokens).toEqual(['ExpoToken[abc]']);
    expect(oneSignalSpy).toHaveBeenCalledTimes(1);
  });

  it('falls back to OneSignal when Expo throws', async () => {
    dbState.tokens.set('u1', [
      { expo_token: 'tok', onesignal_id: 'os-1' },
    ]);
    expoSpy.mockRejectedValueOnce(new Error('500'));
    const r = await notifyUser('u1', { title: 'hi', body: 'there' });
    expect(r.delivered).toBe('onesignal');
  });

  it('reports delivered=none when user has no tokens', async () => {
    const r = await notifyUser('ghost', { title: 'x', body: 'y' });
    expect(r.delivered).toBe('none');
    expect(r.reason).toBe('no_tokens');
  });

  it('reports delivered=none when user_push_tokens migration not applied', async () => {
    dbState.tableExists = false;
    const r = await notifyUser('u1', { title: 'x', body: 'y' });
    expect(r.delivered).toBe('none');
    expect(r.reason).toBe('no_tokens');
  });

  it('includes voiceUrl in data payload for voice briefs', async () => {
    dbState.tokens.set('u1', [{ expo_token: 'tok', onesignal_id: null }]);
    await notifyUser('u1', { title: 'Morning brief', body: 'Tap to listen', voiceUrl: 'https://x/brief.mp3' });
    const call = expoSpy.mock.calls[0] as unknown as [string[], { voiceUrl?: string }] | undefined;
    expect(call?.[1]?.voiceUrl).toBe('https://x/brief.mp3');
  });

  afterAll();
});

// Workaround: avoid unused-import warning if not all tests use it
function afterAll() {
  _resetPushAdapter();
}
