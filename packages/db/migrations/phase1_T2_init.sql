-- Phase 1 / Terminal 2 — Initial schema
-- PRD §12 (Data Model) + §10 (Agent Execution) + §16 (Trust/Security)
-- All tables RLS-locked to user_id = auth.uid().

create extension if not exists "pgcrypto";

-- ===== Enums =====
do $$ begin
  create type pricing_tier as enum ('free', 'autopilot', 'pro', 'premium');
exception when duplicate_object then null; end $$;

do $$ begin
  create type subscription_status as enum ('inactive', 'trialing', 'active', 'past_due', 'canceled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type consent_mode as enum ('approve_each', 'auto_small', 'full_auto');
exception when duplicate_object then null; end $$;

do $$ begin
  create type agent_type as enum (
    'subscription_killer',
    'auto_saver',
    'round_up_investor',
    'spending_coach',
    'goal_funder',
    'daily_brief',
    'bill_negotiation',
    'charge_dispute',
    'credit_card_optimizer',
    'missing_money',
    'refinance_watcher',
    'insurance_shopper'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type action_status as enum (
    'pending',
    'awaiting_approval',
    'approved',
    'running',
    'succeeded',
    'failed',
    'cancelled',
    'escalated'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type data_provider as enum ('plaid', 'mx', 'finicity');
exception when duplicate_object then null; end $$;

-- ===== users (1-1 with auth.users) =====
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  pricing_tier pricing_tier not null default 'free',
  founder_pricing_locked boolean not null default false,
  subscription_status subscription_status not null default 'inactive',
  stripe_customer_id text unique,
  display_name text,
  phone text,
  voice_briefing_enabled boolean not null default false,
  briefing_time_local time not null default '07:00',
  pause_all_agents boolean not null default false
);
create index if not exists users_stripe_customer_idx on public.users(stripe_customer_id);

-- ===== connected_accounts =====
create table if not exists public.connected_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  provider data_provider not null default 'plaid',
  provider_item_id text,
  provider_account_id text,
  institution_id text,
  institution_name text not null,
  account_type text not null,
  account_subtype text,
  mask text,
  current_balance numeric(14,2),
  available_balance numeric(14,2),
  iso_currency_code text not null default 'USD',
  status text not null default 'active',
  last_synced_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists connected_accounts_provider_account_uniq
  on public.connected_accounts(provider, provider_account_id)
  where provider_account_id is not null;
create index if not exists connected_accounts_user_idx on public.connected_accounts(user_id);
create index if not exists connected_accounts_provider_item_idx on public.connected_accounts(provider_item_id);

-- ===== provider_items (one Plaid Item = N accounts; access token lives here) =====
create table if not exists public.provider_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  provider data_provider not null default 'plaid',
  provider_item_id text not null,
  institution_id text,
  institution_name text,
  vault_secret_id uuid,           -- references vault.secrets(id); access_token stored encrypted
  cursor text,                    -- Plaid /transactions/sync cursor
  status text not null default 'active',
  error_code text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists provider_items_uniq
  on public.provider_items(provider, provider_item_id);
create index if not exists provider_items_user_idx on public.provider_items(user_id);

-- ===== transactions =====
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  account_id uuid not null references public.connected_accounts(id) on delete cascade,
  provider data_provider not null default 'plaid',
  provider_transaction_id text not null,
  amount numeric(14,2) not null,
  iso_currency_code text not null default 'USD',
  merchant text,
  raw_description text,
  category text,
  ai_category text,
  ai_category_confidence numeric(4,3),
  ai_categorized_at timestamptz,
  date date not null,
  pending boolean not null default false,
  is_subscription boolean not null default false,
  subscription_id uuid,
  created_at timestamptz not null default now()
);
create unique index if not exists transactions_provider_uniq
  on public.transactions(provider, provider_transaction_id);
create index if not exists transactions_user_date_idx on public.transactions(user_id, date desc);
create index if not exists transactions_account_idx on public.transactions(account_id);
create index if not exists transactions_uncategorized_idx
  on public.transactions(user_id) where ai_category is null;
create index if not exists transactions_subscription_idx
  on public.transactions(user_id, is_subscription) where is_subscription;

-- ===== subscriptions (detected recurring charges) =====
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  merchant text not null,
  amount numeric(12,2) not null,
  frequency text not null default 'monthly',
  first_seen_at date,
  last_charged_at date,
  last_used_at date,
  status text not null default 'active',
  cancellation_method text,
  cancellation_url text,
  cancellation_phone text,
  created_at timestamptz not null default now()
);
create index if not exists subscriptions_user_status_idx on public.subscriptions(user_id, status);

alter table public.transactions
  drop constraint if exists transactions_subscription_id_fk;
alter table public.transactions
  add constraint transactions_subscription_id_fk
  foreign key (subscription_id) references public.subscriptions(id) on delete set null;

-- ===== goals =====
create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  target_amount numeric(14,2) not null,
  target_date date,
  current_amount numeric(14,2) not null default 0,
  monthly_funding numeric(12,2) not null default 0,
  status text not null default 'active',
  created_at timestamptz not null default now()
);
create index if not exists goals_user_idx on public.goals(user_id, status);

-- ===== rules =====
create table if not exists public.rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  trigger jsonb not null,
  conditions jsonb not null default '[]'::jsonb,
  actions jsonb not null default '[]'::jsonb,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists rules_user_enabled_idx on public.rules(user_id, enabled);

-- ===== agents =====
create table if not exists public.agents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  agent_type agent_type not null,
  consent_mode consent_mode not null default 'approve_each',
  enabled boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create unique index if not exists agents_user_type_uniq on public.agents(user_id, agent_type);

-- ===== agent_actions (audit log per PRD §10) =====
create table if not exists public.agent_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  agent_type agent_type not null,
  action_type text not null,
  target text,
  status action_status not null default 'pending',
  idempotency_key text,
  requested_at timestamptz not null default now(),
  approved_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  roi_amount numeric(12,2),
  audit_log jsonb not null default '[]'::jsonb,
  voice_recording_url text,
  error_message text,
  retry_count int not null default 0
);
create unique index if not exists agent_actions_idem_uniq
  on public.agent_actions(agent_id, idempotency_key)
  where idempotency_key is not null;
create index if not exists agent_actions_user_status_idx on public.agent_actions(user_id, status);
create index if not exists agent_actions_user_recent_idx on public.agent_actions(user_id, requested_at desc);

-- ===== waitlist (public insert allowed) =====
create table if not exists public.waitlist_signups (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  source text,
  referrer text,
  founder_locked boolean not null default false,
  created_at timestamptz not null default now()
);

-- ===== updated_at trigger =====
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists users_set_updated_at on public.users;
create trigger users_set_updated_at
  before update on public.users
  for each row execute procedure public.set_updated_at();

-- ===== Auto-provision public.users on signup =====
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
