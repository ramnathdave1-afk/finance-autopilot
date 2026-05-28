-- Phase 1 / Terminal 2 — Supabase Vault helpers for Plaid access tokens
-- Per PRD §16: "Plaid access tokens stored in Supabase Vault, never logged."
--
-- Supabase exposes `vault.secrets` + `vault.create_secret(secret, name, description)`.
-- We wrap with SECURITY DEFINER service functions so the API layer doesn't need
-- direct vault grants. Only callable by service_role (RLS off on these functions
-- — they check the role explicitly).

create or replace function public.vault_store_access_token(
  p_user_id uuid,
  p_provider_item_id text,
  p_access_token text
) returns uuid
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_secret_id uuid;
  v_name text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'vault_store_access_token requires service_role';
  end if;
  v_name := format('plaid_at_%s_%s', p_user_id, p_provider_item_id);
  select vault.create_secret(p_access_token, v_name, 'Plaid access token') into v_secret_id;
  return v_secret_id;
end;
$$;

create or replace function public.vault_read_access_token(
  p_secret_id uuid
) returns text
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_token text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'vault_read_access_token requires service_role';
  end if;
  select decrypted_secret into v_token
    from vault.decrypted_secrets
    where id = p_secret_id;
  return v_token;
end;
$$;

create or replace function public.vault_delete_access_token(
  p_secret_id uuid
) returns void
language plpgsql
security definer
set search_path = public, vault
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'vault_delete_access_token requires service_role';
  end if;
  delete from vault.secrets where id = p_secret_id;
end;
$$;

revoke all on function public.vault_store_access_token(uuid, text, text) from public;
revoke all on function public.vault_read_access_token(uuid) from public;
revoke all on function public.vault_delete_access_token(uuid) from public;
grant execute on function public.vault_store_access_token(uuid, text, text) to service_role;
grant execute on function public.vault_read_access_token(uuid) to service_role;
grant execute on function public.vault_delete_access_token(uuid) to service_role;
