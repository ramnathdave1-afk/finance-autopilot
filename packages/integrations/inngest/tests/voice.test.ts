import { describe, it, expect, beforeEach, vi } from 'vitest';

const supabaseState = {
  uploads: [] as Array<{ bucket: string; path: string; bytes: number }>,
  signedUrls: new Map<string, string>(),
  agentActionUpdates: [] as Array<{ id: string; voice_recording_url: string }>,
  uploadError: null as null | { message: string },
  signError: null as null | { message: string },
};

vi.mock('@fa/db', () => ({
  createServiceClient: () => ({
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, bytes: Uint8Array) => {
          if (supabaseState.uploadError) return { error: supabaseState.uploadError };
          supabaseState.uploads.push({ bucket, path, bytes: bytes.byteLength });
          return { error: null };
        },
        createSignedUrl: async (path: string, _ttl: number) => {
          if (supabaseState.signError) return { data: null, error: supabaseState.signError };
          const url = supabaseState.signedUrls.get(path) ?? `https://signed/${path}`;
          return { data: { signedUrl: url }, error: null };
        },
      }),
    },
    from: () => ({
      update: (patch: { voice_recording_url: string }) => ({
        eq: async (_col: string, id: string) => {
          supabaseState.agentActionUpdates.push({ id, voice_recording_url: patch.voice_recording_url });
          return { error: null };
        },
      }),
    }),
  }),
}));

import { synthesizeAndStore, setTTSAdapters, _resetTTSAdapters, type TTSAdapter } from '../src/voice';

const primary: TTSAdapter = {
  name: 'mock-primary',
  synthesize: vi.fn(async () => ({ audioBytes: new Uint8Array([1, 2, 3, 4]), mimeType: 'audio/mpeg' as const, durationSec: 1 })),
};
const fallback: TTSAdapter = {
  name: 'mock-fallback',
  synthesize: vi.fn(async () => ({ audioBytes: new Uint8Array([5, 6, 7, 8, 9]), mimeType: 'audio/mpeg' as const, durationSec: 1 })),
};

beforeEach(() => {
  supabaseState.uploads.length = 0;
  supabaseState.signedUrls.clear();
  supabaseState.agentActionUpdates.length = 0;
  supabaseState.uploadError = null;
  supabaseState.signError = null;
  (primary.synthesize as ReturnType<typeof vi.fn>).mockClear();
  (primary.synthesize as ReturnType<typeof vi.fn>).mockResolvedValue({
    audioBytes: new Uint8Array([1, 2, 3, 4]),
    mimeType: 'audio/mpeg',
    durationSec: 1,
  });
  (fallback.synthesize as ReturnType<typeof vi.fn>).mockClear();
  (fallback.synthesize as ReturnType<typeof vi.fn>).mockResolvedValue({
    audioBytes: new Uint8Array([5, 6, 7, 8, 9]),
    mimeType: 'audio/mpeg',
    durationSec: 1,
  });
  setTTSAdapters({ primary, fallback });
});

describe('synthesizeAndStore', () => {
  it('happy path: primary adapter → upload → sign → update action', async () => {
    const r = await synthesizeAndStore('hello dave', { userId: 'u1', actionId: 'act-1' });
    expect(r.adapter).toBe('mock-primary');
    expect(r.fallbackUsed).toBe(false);
    expect(r.url).toBe('https://signed/u1/act-1.mp3');
    expect(supabaseState.uploads).toEqual([{ bucket: 'voice-memos', path: 'u1/act-1.mp3', bytes: 4 }]);
    expect(supabaseState.agentActionUpdates).toEqual([{ id: 'act-1', voice_recording_url: 'https://signed/u1/act-1.mp3' }]);
  });

  it('falls back to secondary adapter when primary throws', async () => {
    (primary.synthesize as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('rate_limit'));
    const r = await synthesizeAndStore('hello', { userId: 'u1', actionId: 'act-2' });
    expect(r.fallbackUsed).toBe(true);
    expect(r.adapter).toBe('mock-fallback');
  });

  it('throws when both adapters fail', async () => {
    (primary.synthesize as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('primary boom'));
    (fallback.synthesize as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('fallback boom'));
    await expect(synthesizeAndStore('x', { userId: 'u1', actionId: 'act-3' })).rejects.toThrow(/primary boom/);
  });

  it('throws when storage upload fails', async () => {
    supabaseState.uploadError = { message: 'bucket missing' };
    await expect(synthesizeAndStore('x', { userId: 'u1', actionId: 'act-4' })).rejects.toThrow(/bucket missing/);
  });

  it('respects custom bucket name', async () => {
    await synthesizeAndStore('x', { userId: 'u1', actionId: 'act-5', bucket: 'custom-bucket' });
    expect(supabaseState.uploads[0]?.bucket).toBe('custom-bucket');
  });

  afterEach();
});

function afterEach() {
  _resetTTSAdapters();
}
