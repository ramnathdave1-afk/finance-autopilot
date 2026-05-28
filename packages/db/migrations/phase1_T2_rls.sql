-- Phase 1 / Terminal 2 — Row-Level Security
-- Every user-scoped table: user_id = auth.uid()

alter table public.users               enable row level security;
alter table public.connected_accounts  enable row level security;
alter table public.provider_items      enable row level security;
alter table public.transactions        enable row level security;
alter table public.subscriptions       enable row level security;
alter table public.goals               enable row level security;
alter table public.rules               enable row level security;
alter table public.agents              enable row level security;
alter table public.agent_actions       enable row level security;
alter table public.waitlist_signups    enable row level security;

drop policy if exists users_self on public.users;
create policy users_self on public.users
  for all using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists connected_accounts_self on public.connected_accounts;
create policy connected_accounts_self on public.connected_accounts
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists provider_items_self on public.provider_items;
create policy provider_items_self on public.provider_items
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists transactions_self on public.transactions;
create policy transactions_self on public.transactions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists subscriptions_self on public.subscriptions;
create policy subscriptions_self on public.subscriptions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists goals_self on public.goals;
create policy goals_self on public.goals
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists rules_self on public.rules;
create policy rules_self on public.rules
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists agents_self on public.agents;
create policy agents_self on public.agents
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists agent_actions_self on public.agent_actions;
create policy agent_actions_self on public.agent_actions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Waitlist: anonymous can insert (signup), no public read
drop policy if exists waitlist_insert_any on public.waitlist_signups;
create policy waitlist_insert_any on public.waitlist_signups
  for insert with check (true);
