-- Phase 3 / Terminal 2 — Premium-tier agent enum values + net_worth_snapshots
--
-- Frontend already calls dispatchAction with Premium agent screens using
-- credit_card_optimizer as a placeholder. Adding the real enum values lets
-- Inngest workflows route correctly.
--
-- New AgentType values (per PRD §8.4):
--   tax_prep             (Agent 13)
--   investment_rebalancer (Agent 14)
--   net_worth_strategy   (Agent 15)
--   human_backup         (Agent 16)

alter type agent_type add value if not exists 'tax_prep';
alter type agent_type add value if not exists 'investment_rebalancer';
alter type agent_type add value if not exists 'net_worth_strategy';
alter type agent_type add value if not exists 'human_backup';

-- ===== net_worth_snapshots =====
-- One row per (user_id, date). Nightly cron writes the current snapshot.
-- T1's net-worth view + the Net Worth Strategy agent read from here.

create table if not exists public.net_worth_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  snapshot_date date not null,
  total_assets numeric(14,2) not null,
  total_liabilities numeric(14,2) not null,
  net_worth numeric(14,2) not null,
  breakdown jsonb not null default '{}'::jsonb,  -- {cash, investments, credit_debt, loans, …}
  created_at timestamptz not null default now()
);

create unique index if not exists net_worth_snapshots_user_date_uniq
  on public.net_worth_snapshots(user_id, snapshot_date);
create index if not exists net_worth_snapshots_user_recent_idx
  on public.net_worth_snapshots(user_id, snapshot_date desc);

alter table public.net_worth_snapshots enable row level security;

drop policy if exists net_worth_snapshots_self on public.net_worth_snapshots;
create policy net_worth_snapshots_self on public.net_worth_snapshots
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
