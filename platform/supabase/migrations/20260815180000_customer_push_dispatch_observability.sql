-- Make database-triggered push delivery observable and provide a
-- service-role-only, auditable way to provision the two encrypted Vault
-- values required by pg_net.

alter table public.notifications
  add column if not exists push_dispatched_at timestamptz,
  add column if not exists push_delivery jsonb;

create or replace function public.configure_customer_push_dispatch(
  p_project_url text,
  p_service_role_key text
)
returns void
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $$
declare
  v_secret_id uuid;
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if nullif(trim(p_project_url), '') is null or nullif(trim(p_service_role_key), '') is null then
    raise exception 'Project URL and service role key are required' using errcode = '22023';
  end if;

  select id into v_secret_id from vault.secrets where name = 'project_url' limit 1;
  if v_secret_id is null then
    perform vault.create_secret(trim(p_project_url), 'project_url', 'Supabase project URL for customer push dispatch');
  else
    perform vault.update_secret(v_secret_id, trim(p_project_url));
  end if;

  select id into v_secret_id from vault.secrets where name = 'service_role_key' limit 1;
  if v_secret_id is null then
    perform vault.create_secret(trim(p_service_role_key), 'service_role_key', 'Service role key for customer push dispatch');
  else
    perform vault.update_secret(v_secret_id, trim(p_service_role_key));
  end if;
end;
$$;

revoke all on function public.configure_customer_push_dispatch(text, text) from public;
grant execute on function public.configure_customer_push_dispatch(text, text) to service_role;

comment on function public.configure_customer_push_dispatch(text, text)
  is 'Service-role-only provisioning of encrypted Vault values used by the notification pg_net trigger.';
