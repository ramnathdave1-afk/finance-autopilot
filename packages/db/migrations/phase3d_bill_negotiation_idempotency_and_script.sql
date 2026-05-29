-- Phase 3d — Bill Negotiation (Agent 7, voice) hardening.
--
-- Two fixes for the voice bill-negotiation path:
--
-- 1) Idempotency backstop. The agent dedupes a re-dial in application code
--    (findNegotiationByActionId + resume), but there was NO database constraint
--    guaranteeing at most one bill_negotiations row per agent_action_id. A
--    concurrent retry could still insert a duplicate row. Add a UNIQUE index on
--    agent_action_id so createNegotiation can insert-on-conflict-do-nothing and
--    resolve to the existing row.
--
--    The index is FULL (not partial). A partial unique index (WHERE
--    agent_action_id IS NOT NULL) cannot back a PostgREST `.upsert(...,
--    { onConflict })` — that breaks the upsert at runtime with "there is no
--    unique or exclusion constraint matching the ON CONFLICT specification"
--    (see phase3c_fix_partial_upsert_indexes.sql). NULL agent_action_id is
--    DISTINCT-by-default in Postgres, so rows without an action id (should not
--    happen for agent-driven negotiations) remain permitted.
--
-- 2) Script storage. The negotiation script was previously passed to Twilio in
--    the TwiML Url query param (logged by Twilio + subject to URL length
--    limits). Store it on the row instead; /api/voice/twiml looks it up by
--    negotiationId and only the id rides in the URL.

alter table public.bill_negotiations
  add column if not exists call_script text;

create unique index if not exists bill_negotiations_agent_action_uniq
  on public.bill_negotiations(agent_action_id);
