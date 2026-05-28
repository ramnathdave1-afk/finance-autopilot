-- Phase 1B follow-up migration. Resolves TODO(integrate-t2-migration) markers
-- left by T4 (refund_eligible) and T5 (stripe_events, stripe_refunds,
-- billing_cycle). Idempotent — safe to re-run.

-- T4: refund_eligible flag on agent_actions.
-- Set true when an agent terminally fails AND the user is owed a partial
-- refund for the current month. Consumed by @fa/stripe issueFailureRefund.
ALTER TABLE public.agent_actions
  ADD COLUMN IF NOT EXISTS refund_eligible boolean NOT NULL DEFAULT false;

-- T5: billing_cycle on users so the founder-pricing cohort count can
-- distinguish monthly vs annual signups without joining stripe subscriptions.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'billing_cycle'
  ) THEN
    CREATE TYPE billing_cycle AS ENUM ('monthly', 'annual');
  END IF;
END$$;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS billing_cycle billing_cycle;

-- T5: webhook idempotency table. Every processed Stripe event_id is recorded
-- so retries from Stripe are no-ops.
CREATE TABLE IF NOT EXISTS public.stripe_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb
);

-- T5: refund-issuance idempotency. Keyed by action_id so issueFailureRefund
-- is exactly-once even under concurrent webhook + manual triggers.
CREATE TABLE IF NOT EXISTS public.stripe_refunds (
  action_id uuid PRIMARY KEY REFERENCES public.agent_actions(id) ON DELETE CASCADE,
  stripe_refund_id text NOT NULL,
  amount_cents integer NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now()
);

-- Service-role only. RLS off on these two — only webhooks + workers touch them.
ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_refunds ENABLE ROW LEVEL SECURITY;

-- No policies = no access except via service_role. Intentional.
