// Push notifications — Expo Push (primary) + OneSignal (fallback).
// Adapter pattern: real adapters call the providers, tests inject a MockAdapter.
//
// Env vars (see root .env.example):
//   EXPO_ACCESS_TOKEN      — primary, used for Expo push tokens (mobile bundle)
//   ONESIGNAL_APP_ID       — fallback, used when Expo returns DeviceNotRegistered
//   ONESIGNAL_REST_API_KEY
//
// Wired into defineAgent via onComplete hook (see define-agent.ts) — every
// terminal status flip (succeeded / failed / escalated / awaiting_approval)
// sends a notification.

import { createServiceClient } from '@fa/db';

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  /** Optional URL to a voice memo (daily_brief voice variant). */
  voiceUrl?: string;
}

export interface PushTarget {
  userId: string;
  /** Expo push tokens registered for this user. */
  expoTokens: string[];
  /** OneSignal player ids — only used if Expo fails. */
  oneSignalIds: string[];
}

export interface PushResult {
  delivered: 'expo' | 'onesignal' | 'none';
  failedTokens?: string[];
  reason?: string;
}

export interface PushAdapter {
  /** Send via Expo Push API. Returns failed tokens for fallback. */
  sendExpo(tokens: string[], msg: PushPayload): Promise<{ failed: string[] }>;
  /** Send via OneSignal. */
  sendOneSignal(playerIds: string[], msg: PushPayload): Promise<void>;
}

// ─── Production adapter ────────────────────────────────────────────────────
class ProductionAdapter implements PushAdapter {
  async sendExpo(tokens: string[], msg: PushPayload): Promise<{ failed: string[] }> {
    if (tokens.length === 0) return { failed: [] };
    const token = process.env.EXPO_ACCESS_TOKEN;
    if (!token) throw new Error('EXPO_ACCESS_TOKEN not set');

    const messages = tokens.map((to) => ({
      to,
      sound: 'default',
      title: msg.title,
      body: msg.body,
      data: { ...(msg.data ?? {}), ...(msg.voiceUrl ? { voiceUrl: msg.voiceUrl } : {}) },
    }));

    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(messages),
    });
    if (!res.ok) throw new Error(`Expo push HTTP ${res.status}`);
    const body = (await res.json()) as { data?: Array<{ status: string; details?: { error?: string } }> };

    const failed: string[] = [];
    (body.data ?? []).forEach((tk, i) => {
      if (tk.status !== 'ok') {
        const t = tokens[i];
        if (t) failed.push(t);
      }
    });
    return { failed };
  }

  async sendOneSignal(playerIds: string[], msg: PushPayload): Promise<void> {
    if (playerIds.length === 0) return;
    const appId = process.env.ONESIGNAL_APP_ID;
    const key = process.env.ONESIGNAL_REST_API_KEY;
    if (!appId || !key) throw new Error('ONESIGNAL_APP_ID / ONESIGNAL_REST_API_KEY not set');

    const res = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${key}`,
      },
      body: JSON.stringify({
        app_id: appId,
        include_player_ids: playerIds,
        headings: { en: msg.title },
        contents: { en: msg.body },
        data: { ...(msg.data ?? {}), ...(msg.voiceUrl ? { voiceUrl: msg.voiceUrl } : {}) },
      }),
    });
    if (!res.ok) throw new Error(`OneSignal HTTP ${res.status}`);
  }
}

let _adapter: PushAdapter = new ProductionAdapter();

export function setPushAdapter(a: PushAdapter): void {
  _adapter = a;
}
export function _resetPushAdapter(): void {
  _adapter = new ProductionAdapter();
}

// ─── Token resolution ──────────────────────────────────────────────────────
/**
 * Look up push tokens for a user. Expects a `user_push_tokens` table — if it
 * doesn't exist yet (TODO(integrate-t2-migration: add user_push_tokens table)),
 * gracefully returns empty arrays so notifies become no-ops.
 */
export async function getPushTargetForUser(userId: string): Promise<PushTarget> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('user_push_tokens')
    .select('expo_token, onesignal_id')
    .eq('user_id', userId);

  if (error) {
    // 42P01 = undefined_table (migration not applied yet). Don't throw.
    if (error.code === '42P01') {
      return { userId, expoTokens: [], oneSignalIds: [] };
    }
    throw new Error(`getPushTargetForUser: ${error.message}`);
  }

  const expoTokens: string[] = [];
  const oneSignalIds: string[] = [];
  for (const row of (data ?? []) as Array<{ expo_token: string | null; onesignal_id: string | null }>) {
    if (row.expo_token) expoTokens.push(row.expo_token);
    if (row.onesignal_id) oneSignalIds.push(row.onesignal_id);
  }
  return { userId, expoTokens, oneSignalIds };
}

// ─── Public send ──────────────────────────────────────────────────────────
/**
 * Send a push notification to a user. Tries Expo first, falls back to
 * OneSignal for any tokens Expo couldn't deliver to.
 */
export async function notifyUser(userId: string, msg: PushPayload): Promise<PushResult> {
  const target = await getPushTargetForUser(userId);

  if (target.expoTokens.length === 0 && target.oneSignalIds.length === 0) {
    return { delivered: 'none', reason: 'no_tokens' };
  }

  let expoFailed: string[] = [];
  if (target.expoTokens.length > 0) {
    try {
      const r = await _adapter.sendExpo(target.expoTokens, msg);
      expoFailed = r.failed;
      if (expoFailed.length === 0) return { delivered: 'expo' };
    } catch (e) {
      expoFailed = target.expoTokens;
      // fall through to OneSignal
      const err = e instanceof Error ? e.message : String(e);
      if (target.oneSignalIds.length === 0) {
        return { delivered: 'none', reason: `expo_failed:${err}`, failedTokens: expoFailed };
      }
    }
  }

  if (target.oneSignalIds.length > 0) {
    try {
      await _adapter.sendOneSignal(target.oneSignalIds, msg);
      return { delivered: 'onesignal', ...(expoFailed.length > 0 ? { failedTokens: expoFailed } : {}) };
    } catch (e) {
      return { delivered: 'none', reason: `onesignal_failed:${e instanceof Error ? e.message : String(e)}` };
    }
  }

  return { delivered: 'none', reason: 'expo_failed_no_onesignal', failedTokens: expoFailed };
}
