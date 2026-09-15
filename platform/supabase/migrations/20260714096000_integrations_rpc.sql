-- Delivery marketplace integrations (iFood, Rappi, Uber Eats) — connection
-- state only. Actual order-sync with each marketplace is a separate,
-- much larger integration project; this backs the on/off toggle UI for now.
create table if not exists public.restaurant_integrations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  provider text not null check (provider in ('ifood', 'rappi', 'uber_eats')),
  is_connected boolean not null default false,
  external_store_id text,
  connected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, provider)
);

alter table public.restaurant_integrations enable row level security;

drop policy if exists restaurant_integrations_staff on public.restaurant_integrations;
create policy restaurant_integrations_staff on public.restaurant_integrations
  for all using (
    private.has_restaurant_role(restaurant_id, array['owner','manager']::public.user_roles_role_enum[])
  )
  with check (
    private.has_restaurant_role(restaurant_id, array['owner','manager']::public.user_roles_role_enum[])
  );

create or replace function public.restaurant_get_integrations(
  p_restaurant_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $$
declare
  result jsonb;
begin
  perform private.require_restaurant_role(
    p_restaurant_id,
    array['owner','manager']::public.user_roles_role_enum[]
  );

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'provider', i.provider,
      'is_connected', i.is_connected,
      'external_store_id', i.external_store_id,
      'connected_at', i.connected_at
    )
  ), '[]'::jsonb)
  into result
  from public.restaurant_integrations i
  where i.restaurant_id = p_restaurant_id;

  return result;
end;
$$;

create or replace function public.restaurant_set_integration_connection(
  p_restaurant_id uuid,
  p_provider text,
  p_is_connected boolean,
  p_external_store_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_row record;
begin
  perform private.require_restaurant_role(
    p_restaurant_id,
    array['owner','manager']::public.user_roles_role_enum[]
  );

  if p_provider not in ('ifood', 'rappi', 'uber_eats') then
    raise exception 'Invalid provider: %', p_provider using errcode = '22023';
  end if;

  insert into public.restaurant_integrations(
    restaurant_id, provider, is_connected, external_store_id, connected_at, created_at, updated_at
  )
  values (
    p_restaurant_id, p_provider, p_is_connected, p_external_store_id,
    case when p_is_connected then now() else null end, now(), now()
  )
  on conflict (restaurant_id, provider)
  do update set
    is_connected = p_is_connected,
    external_store_id = coalesce(p_external_store_id, public.restaurant_integrations.external_store_id),
    connected_at = case when p_is_connected then now() else null end,
    updated_at = now()
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

revoke all on function public.restaurant_get_integrations(uuid) from public;
revoke all on function public.restaurant_set_integration_connection(uuid, text, boolean, text) from public;

grant execute on function public.restaurant_get_integrations(uuid) to authenticated, service_role;
grant execute on function public.restaurant_set_integration_connection(uuid, text, boolean, text) to authenticated, service_role;
