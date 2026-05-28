-- Phase 2 / Terminal 2 — Tier-2 agent data layer (PRD §8.3, §21)
-- Adds tables that T4's Tier-2 agents (Bill Negotiation, Charge Dispute,
-- Credit Card Optimizer, Missing Money, Refinance Watcher, Insurance Shopper)
-- read from / write to.
--
-- All new tables follow the user_id RLS pattern from Phase 1.

create extension if not exists "pgcrypto";

-- ===== Enums =====
do $$ begin
  create type dispute_status as enum (
    'detected', 'awaiting_user', 'filing', 'filed', 'resolved_won', 'resolved_lost', 'cancelled'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type bill_negotiation_status as enum (
    'pending', 'preparing_call', 'calling', 'negotiating', 'succeeded', 'failed', 'no_savings'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type loan_type as enum ('mortgage', 'student', 'auto', 'personal', 'heloc');
exception when duplicate_object then null; end $$;

do $$ begin
  create type insurance_kind as enum ('auto', 'renters', 'home', 'life', 'health');
exception when duplicate_object then null; end $$;

-- ===== bills (Bill Negotiation, Agent 7) =====
create table if not exists public.bills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  provider_name text not null,                 -- "Comcast", "Verizon", etc.
  account_number_masked text,
  current_amount numeric(12,2) not null,
  billing_period text,                          -- "monthly" | "annual"
  source text not null default 'upload',        -- "upload" | "ocr" | "manual"
  ocr_raw jsonb,                                -- Claude vision output if OCR
  uploaded_at timestamptz not null default now(),
  last_negotiated_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists bills_user_idx on public.bills(user_id);

-- ===== bill_negotiations (one row per call attempt) =====
create table if not exists public.bill_negotiations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  bill_id uuid not null references public.bills(id) on delete cascade,
  agent_action_id uuid references public.agent_actions(id) on delete set null,
  status bill_negotiation_status not null default 'pending',
  target_amount numeric(12,2),
  achieved_amount numeric(12,2),
  monthly_savings numeric(12,2),
  call_started_at timestamptz,
  call_ended_at timestamptz,
  call_duration_seconds int,
  voice_recording_url text,
  transcript_url text,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists bill_neg_user_idx on public.bill_negotiations(user_id, created_at desc);
create index if not exists bill_neg_bill_idx on public.bill_negotiations(bill_id);

-- ===== disputes (Charge Dispute, Agent 8) =====
create table if not exists public.disputes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  agent_action_id uuid references public.agent_actions(id) on delete set null,
  status dispute_status not null default 'detected',
  reason text not null,                         -- "duplicate" | "unauthorized" | "incorrect_amount" | "subscription_cancelled" | "service_not_rendered"
  detection_score numeric(4,3),                 -- ML/heuristic confidence
  amount numeric(12,2) not null,
  recovered_amount numeric(12,2),
  bank text,                                    -- "chase" | "boa" | ...
  bank_case_id text,
  filed_at timestamptz,
  resolved_at timestamptz,
  evidence jsonb not null default '{}'::jsonb,  -- screenshots, transaction context
  created_at timestamptz not null default now()
);
create index if not exists disputes_user_idx on public.disputes(user_id, status);
create index if not exists disputes_txn_idx on public.disputes(transaction_id);
create unique index if not exists disputes_txn_open_uniq
  on public.disputes(transaction_id)
  where status not in ('resolved_won', 'resolved_lost', 'cancelled');

-- ===== cards (rewards database — shared across users) =====
create table if not exists public.cards (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  issuer text not null,
  network text not null,                        -- "visa" | "mastercard" | "amex" | "discover"
  annual_fee numeric(8,2) not null default 0,
  signup_bonus jsonb,                           -- { points, spend_required, months }
  rewards jsonb not null,                       -- [{ category, multiplier, cap_annual }]
  benefits jsonb not null default '[]'::jsonb,
  application_url text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists cards_active_idx on public.cards(active);

-- ===== user_cards (cards the user actually holds) =====
create table if not exists public.user_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  card_id uuid references public.cards(id) on delete set null,
  display_name text,
  last4 text,
  estimated_monthly_value numeric(10,2),
  status text not null default 'active',
  added_at timestamptz not null default now()
);
create index if not exists user_cards_user_idx on public.user_cards(user_id, status);

-- ===== unclaimed_finds (Missing Money, Agent 10) =====
create table if not exists public.unclaimed_finds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  source text not null,                         -- "naupa" | "missingmoney" | state code | "401k_db"
  state text,
  holder text,                                  -- entity holding the funds
  amount_estimate text,                         -- often "Under $50" / "Under $100" — keep as text
  property_id text,
  details jsonb,
  claim_url text,
  status text not null default 'detected',      -- "detected" | "claimed" | "ignored"
  detected_at timestamptz not null default now()
);
create index if not exists unclaimed_user_idx on public.unclaimed_finds(user_id, status);
create unique index if not exists unclaimed_dedup_uniq
  on public.unclaimed_finds(user_id, source, property_id)
  where property_id is not null;

-- ===== loans (Refinance Watcher, Agent 11) =====
create table if not exists public.loans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  loan_type loan_type not null,
  servicer text,
  principal numeric(14,2) not null,
  current_balance numeric(14,2),
  apr numeric(7,4) not null,                    -- 0.0625 = 6.25%
  term_months int not null,
  remaining_months int,
  origination_date date,
  account_id uuid references public.connected_accounts(id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists loans_user_idx on public.loans(user_id);

-- ===== rate_snapshots (daily public rates per loan_type) =====
create table if not exists public.rate_snapshots (
  id uuid primary key default gen_random_uuid(),
  loan_type loan_type not null,
  source text not null,                         -- "freddie_mac" | "bankrate" | etc.
  apr_low numeric(7,4) not null,
  apr_avg numeric(7,4) not null,
  apr_high numeric(7,4) not null,
  captured_on date not null,
  created_at timestamptz not null default now()
);
create unique index if not exists rate_snapshots_uniq
  on public.rate_snapshots(loan_type, source, captured_on);

-- ===== insurance_policies (Insurance Shopper, Agent 12) =====
create table if not exists public.insurance_policies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  kind insurance_kind not null,
  carrier text not null,
  policy_number_masked text,
  monthly_premium numeric(10,2) not null,
  annual_premium numeric(10,2),
  renewal_date date,
  coverage jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists insurance_user_idx on public.insurance_policies(user_id, kind);

-- ===== insurance_quotes (rotating Pro-tier quotes per policy) =====
create table if not exists public.insurance_quotes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  policy_id uuid not null references public.insurance_policies(id) on delete cascade,
  carrier text not null,
  monthly_premium numeric(10,2) not null,
  annual_premium numeric(10,2),
  coverage_match jsonb,                         -- diff vs current
  quote_url text,
  expires_at timestamptz,
  captured_at timestamptz not null default now()
);
create index if not exists insurance_quotes_user_idx on public.insurance_quotes(user_id, policy_id);

-- ===== investments (Pro-tier net worth, PRD §13) =====
create table if not exists public.investment_holdings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  account_id uuid not null references public.connected_accounts(id) on delete cascade,
  security_id text,
  ticker text,
  name text,
  type text,                                     -- "equity" | "etf" | "cash" | "fixed_income" | "crypto"
  quantity numeric(20,6) not null,
  cost_basis numeric(14,2),
  current_price numeric(14,4),
  current_value numeric(14,2),
  iso_currency_code text not null default 'USD',
  as_of date not null,
  created_at timestamptz not null default now()
);
create unique index if not exists holdings_uniq
  on public.investment_holdings(account_id, security_id, as_of)
  where security_id is not null;
create index if not exists holdings_user_idx on public.investment_holdings(user_id, as_of desc);
