-- Bootstrap restaurant ownership for new owners.
-- Problem: choosing "Dono" in the app only set a local intent; guarded screens and RPCs
-- require a row in public.user_roles (or profile_roles). Inserting into user_roles via RLS
-- is chicken-and-egg (needs existing owner/manager). This migration:
-- 1) treats restaurants.owner_id as ownership authority
-- 2) auto-creates user_roles.owner when a restaurant is inserted
-- 3) exposes create_my_restaurant() for the restaurant app onboarding

-- ─── 1. has_restaurant_role also honors restaurants.owner_id ──────────────────
create or replace function private.has_restaurant_role(
  target_restaurant_id uuid,
  required_roles public.user_roles_role_enum[] default array[
    'owner',
    'manager',
    'chef',
    'cook',
    'waiter',
    'barman',
    'maitre'
  ]::public.user_roles_role_enum[]
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.user_roles ur
    where ur.restaurant_id = target_restaurant_id
      and ur.user_id = auth.uid()
      and ur.role = any(required_roles)
      and ur.is_active
  )
  or exists (
    select 1
    from public.profile_roles pr
    where pr.restaurant_id = target_restaurant_id
      and pr.user_id = auth.uid()
      and pr.role_key = any(required_roles::text[])
      and pr.is_active
  )
  or (
    'owner'::public.user_roles_role_enum = any(required_roles)
    and exists (
      select 1
      from public.restaurants r
      where r.id = target_restaurant_id
        and r.owner_id = auth.uid()
    )
  );
$$;

revoke all on function private.has_restaurant_role(uuid, public.user_roles_role_enum[]) from public;
grant execute on function private.has_restaurant_role(uuid, public.user_roles_role_enum[]) to authenticated, service_role;

-- ─── 2. user_restaurant_ids includes owned restaurants ───────────────────────
create or replace function private.user_restaurant_ids(target_user_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    array(
      select distinct restaurant_id
      from (
        select pr.restaurant_id
        from public.profile_roles pr
        where pr.user_id = target_user_id
          and pr.restaurant_id is not null
          and pr.is_active
        union
        select ur.restaurant_id
        from public.user_roles ur
        where ur.user_id = target_user_id
          and ur.is_active
        union
        select r.id as restaurant_id
        from public.restaurants r
        where r.owner_id = target_user_id
      ) restaurant_scope
      where restaurant_id is not null
      order by restaurant_id
    ),
    array[]::uuid[]
  );
$$;

revoke all on function private.user_restaurant_ids(uuid) from public;
grant execute on function private.user_restaurant_ids(uuid) to authenticated, service_role;

-- ─── 3. Trigger: restaurant insert → ensure owner user_roles row ─────────────
create or replace function private.on_restaurant_created_ensure_owner_role()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.user_roles (user_id, restaurant_id, role, is_active, created_at, updated_at)
  values (new.owner_id, new.id, 'owner', true, now(), now())
  on conflict (user_id, restaurant_id, role) do update
    set is_active = true,
        updated_at = now();

  insert into public.profile_roles (user_id, role_key, restaurant_id, is_active)
  select new.owner_id, 'owner', new.id, true
  where not exists (
    select 1
    from public.profile_roles pr
    where pr.user_id = new.owner_id
      and pr.role_key = 'owner'
      and pr.restaurant_id = new.id
  );

  return new;
end;
$$;

drop trigger if exists trg_restaurants_ensure_owner_role on public.restaurants;
create trigger trg_restaurants_ensure_owner_role
  after insert on public.restaurants
  for each row
  execute function private.on_restaurant_created_ensure_owner_role();

-- ─── 4. Backfill missing owner roles for existing restaurants ────────────────
insert into public.user_roles (user_id, restaurant_id, role, is_active, created_at, updated_at)
select r.owner_id, r.id, 'owner'::public.user_roles_role_enum, true, now(), now()
from public.restaurants r
where not exists (
  select 1
  from public.user_roles ur
  where ur.user_id = r.owner_id
    and ur.restaurant_id = r.id
    and ur.role = 'owner'
)
on conflict (user_id, restaurant_id, role) do update
  set is_active = true,
      updated_at = now();

insert into public.profile_roles (user_id, role_key, restaurant_id, is_active)
select r.owner_id, 'owner', r.id, true
from public.restaurants r
where not exists (
  select 1
  from public.profile_roles pr
  where pr.user_id = r.owner_id
    and pr.role_key = 'owner'
    and pr.restaurant_id = r.id
);

-- ─── 5. RPC used by the restaurant app onboarding ────────────────────────────
-- Drop previous signature from 20260713193000 (parameter names/order differ).
drop function if exists public.create_my_restaurant(text, text, text, text, text, text, text, text);

create function public.create_my_restaurant(
  p_name text,
  p_phone text,
  p_email text,
  p_city text default 'São Paulo',
  p_state text default 'SP',
  p_address text default 'Endereço a definir',
  p_zip_code text default '00000-000',
  p_service_type text default 'casual_dining'
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing uuid;
  v_restaurant public.restaurants%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if nullif(trim(coalesce(p_name, '')), '') is null then
    raise exception 'Restaurant name is required' using errcode = '22023';
  end if;

  if nullif(trim(coalesce(p_phone, '')), '') is null then
    raise exception 'Restaurant phone is required' using errcode = '22023';
  end if;

  if nullif(trim(coalesce(p_email, '')), '') is null then
    raise exception 'Restaurant email is required' using errcode = '22023';
  end if;

  -- Idempotent: if the user already owns a restaurant, return it
  select r.id into v_existing
  from public.restaurants r
  where r.owner_id = v_user_id
  order by r.created_at asc
  limit 1;

  if v_existing is not null then
    -- Ensure role rows exist even for older restaurants
    insert into public.user_roles (user_id, restaurant_id, role, is_active, created_at, updated_at)
    values (v_user_id, v_existing, 'owner', true, now(), now())
    on conflict (user_id, restaurant_id, role) do update
      set is_active = true,
          updated_at = now();

    select * into v_restaurant from public.restaurants where id = v_existing;
    return to_jsonb(v_restaurant);
  end if;

  insert into public.restaurants (
    owner_id,
    name,
    address,
    city,
    state,
    zip_code,
    phone,
    email,
    service_type
  )
  values (
    v_user_id,
    trim(p_name),
    coalesce(nullif(trim(p_address), ''), 'Endereço a definir'),
    coalesce(nullif(trim(p_city), ''), 'São Paulo'),
    coalesce(nullif(trim(p_state), ''), 'SP'),
    coalesce(nullif(trim(p_zip_code), ''), '00000-000'),
    trim(p_phone),
    trim(p_email),
    coalesce(nullif(trim(p_service_type), ''), 'casual_dining')
  )
  returning * into v_restaurant;

  return to_jsonb(v_restaurant);
end;
$$;

revoke all on function public.create_my_restaurant(text, text, text, text, text, text, text, text) from public;
grant execute on function public.create_my_restaurant(text, text, text, text, text, text, text, text) to authenticated, service_role;
