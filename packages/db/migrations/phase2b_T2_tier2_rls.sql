-- Phase 2 / Terminal 2 — RLS for Tier-2 tables.
-- `cards` and `rate_snapshots` are catalog tables (shared across users):
-- read-only for authenticated, no anon, no writes from clients.

alter table public.bills                enable row level security;
alter table public.bill_negotiations    enable row level security;
alter table public.disputes             enable row level security;
alter table public.cards                enable row level security;
alter table public.user_cards           enable row level security;
alter table public.unclaimed_finds      enable row level security;
alter table public.loans                enable row level security;
alter table public.rate_snapshots       enable row level security;
alter table public.insurance_policies   enable row level security;
alter table public.insurance_quotes     enable row level security;
alter table public.investment_holdings  enable row level security;

drop policy if exists bills_self on public.bills;
create policy bills_self on public.bills
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists bill_negotiations_self on public.bill_negotiations;
create policy bill_negotiations_self on public.bill_negotiations
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists disputes_self on public.disputes;
create policy disputes_self on public.disputes
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists user_cards_self on public.user_cards;
create policy user_cards_self on public.user_cards
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists unclaimed_finds_self on public.unclaimed_finds;
create policy unclaimed_finds_self on public.unclaimed_finds
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists loans_self on public.loans;
create policy loans_self on public.loans
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists insurance_policies_self on public.insurance_policies;
create policy insurance_policies_self on public.insurance_policies
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists insurance_quotes_self on public.insurance_quotes;
create policy insurance_quotes_self on public.insurance_quotes
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists investment_holdings_self on public.investment_holdings;
create policy investment_holdings_self on public.investment_holdings
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Catalog tables: any authenticated user can read; writes restricted to service_role.
drop policy if exists cards_read on public.cards;
create policy cards_read on public.cards
  for select using (auth.role() = 'authenticated');

drop policy if exists rate_snapshots_read on public.rate_snapshots;
create policy rate_snapshots_read on public.rate_snapshots
  for select using (auth.role() = 'authenticated');
