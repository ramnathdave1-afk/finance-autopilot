-- Cross-cutting review pass after T1–T5 Phase 1 reports.
-- Adds:
--   1. Atomic founder-100 cohort claim on user signup.
--   2. waitlist table for the landing-page email capture.
--   3. Helper for tier enforcement: a SECURITY DEFINER function that returns
--      the effective tier of a user without exposing the users table to
--      callers who only need the tier.
--
-- All additive. Existing tables untouched.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Atomic founder-pricing cohort claim.
--
-- Naive ("count(*) < 100 then set") races under concurrent inserts. We use
-- a transaction-scoped advisory lock + recount inside the lock to make the
-- claim exactly-once across concurrent signups. The lock key (74301) is
-- arbitrary but stable.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.claim_founder_slot_if_available()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cohort_size constant int := 100;
  current_count int;
BEGIN
  -- Only consider rows where the column isn't already set (idempotent retries).
  IF NEW.founder_pricing_locked IS TRUE THEN
    RETURN NEW;
  END IF;

  -- Serialize concurrent claims on a single advisory lock for the duration
  -- of this transaction. Postgres releases it on commit/rollback.
  PERFORM pg_advisory_xact_lock(74301);

  SELECT count(*) INTO current_count
  FROM public.users
  WHERE founder_pricing_locked = true;

  IF current_count < cohort_size THEN
    NEW.founder_pricing_locked := true;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_claim_founder_slot ON public.users;
CREATE TRIGGER users_claim_founder_slot
  BEFORE INSERT ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.claim_founder_slot_if_available();

-- ---------------------------------------------------------------------------
-- 2. waitlist (landing page email capture).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.waitlist (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text UNIQUE NOT NULL,
  source      text,
  utm         jsonb,
  position    int GENERATED ALWAYS AS IDENTITY,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS waitlist_email_idx ON public.waitlist (lower(email));
CREATE INDEX IF NOT EXISTS waitlist_created_at_idx ON public.waitlist (created_at);

ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;
-- No policies: service_role only (mirrors stripe_events / stripe_refunds).

-- ---------------------------------------------------------------------------
-- 3. effective_tier helper.
--
-- Tier-enforcement middleware (apps/web/src/middleware.ts) needs to read
-- the user's tier on every protected request without granting it broad
-- access to the users table.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.effective_tier(p_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pricing_tier::text
  FROM public.users
  WHERE id = p_user_id;
$$;

GRANT EXECUTE ON FUNCTION public.effective_tier(uuid) TO authenticated;

COMMIT;
