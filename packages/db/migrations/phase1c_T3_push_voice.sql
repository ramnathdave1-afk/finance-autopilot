-- Phase 1C, T3: tables + storage policy backing @fa/inngest's notify + voice modules.
-- Idempotent — safe to re-run.

-- ─── user_push_tokens ──────────────────────────────────────────────────────
-- One row per (user, device). expo_token OR onesignal_id will be populated;
-- the OTHER is null until the user opts into a fallback provider.
CREATE TABLE IF NOT EXISTS public.user_push_tokens (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  expo_token   text,
  onesignal_id text,
  platform     text CHECK (platform IN ('ios', 'android', 'web')),
  device_label text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  -- At least one provider id present.
  CONSTRAINT user_push_tokens_at_least_one CHECK (expo_token IS NOT NULL OR onesignal_id IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS user_push_tokens_expo_uniq
  ON public.user_push_tokens (expo_token)
  WHERE expo_token IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS user_push_tokens_onesignal_uniq
  ON public.user_push_tokens (onesignal_id)
  WHERE onesignal_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS user_push_tokens_user_idx
  ON public.user_push_tokens (user_id);

ALTER TABLE public.user_push_tokens ENABLE ROW LEVEL SECURITY;

-- A user can see their own tokens; service role writes from mobile registration.
DROP POLICY IF EXISTS user_push_tokens_select_own ON public.user_push_tokens;
CREATE POLICY user_push_tokens_select_own ON public.user_push_tokens
  FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS user_push_tokens_insert_own ON public.user_push_tokens;
CREATE POLICY user_push_tokens_insert_own ON public.user_push_tokens
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS user_push_tokens_delete_own ON public.user_push_tokens;
CREATE POLICY user_push_tokens_delete_own ON public.user_push_tokens
  FOR DELETE
  USING (user_id = auth.uid());

-- ─── voice-memos storage bucket ───────────────────────────────────────────
-- Service-role uploads (the daily_brief voice agent). Users can only read
-- their own audio via signed URLs (which @fa/inngest synthesizeAndStore
-- generates and stashes on agent_actions.voice_recording_url).
INSERT INTO storage.buckets (id, name, public)
  VALUES ('voice-memos', 'voice-memos', false)
  ON CONFLICT (id) DO NOTHING;

-- Owner-only read policy. Path convention: ${userId}/${actionId}.mp3 — so
-- the first path segment IS the owner.
DROP POLICY IF EXISTS voice_memos_read_own ON storage.objects;
CREATE POLICY voice_memos_read_own ON storage.objects
  FOR SELECT
  USING (bucket_id = 'voice-memos' AND (storage.foldername(name))[1] = auth.uid()::text);

-- No INSERT/UPDATE/DELETE policies = only service_role can mutate. Intentional.
