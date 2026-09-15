-- Supabase Auth as the only identity provider for Okinawa / NOOWE.
-- Adds app roles, auth.users -> public profile sync, custom JWT claims, and
-- closes RLS gaps left by generated parity tables.

create extension if not exists "pgcrypto" with schema extensions;

create schema if not exists private;

revoke all on schema private from anon, authenticated;
grant usage on schema private to postgres, service_role;

create table if not exists public.roles (
  key text primary key,
  label text not null,
  description text,
  privilege_level integer not null default 0,
  is_system boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint roles_key_format check (key ~ '^[a-z][a-z0-9_]*$')
);

insert into public.roles (key, label, description, privilege_level, is_system)
values
  ('customer', 'Customer', 'Consumer account with access to its own data.', 10, true),
  ('waiter', 'Waiter', 'Restaurant floor staff.', 20, true),
  ('barman', 'Barman', 'Bar station staff.', 25, true),
  ('chef', 'Chef', 'Kitchen station staff.', 30, true),
  ('maitre', 'Maitre', 'Host and waitlist staff.', 35, true),
  ('manager', 'Manager', 'Restaurant manager with operational permissions.', 70, true),
  ('owner', 'Owner', 'Restaurant owner with full restaurant permissions.', 80, true),
  ('admin', 'Admin', 'Platform administrator.', 100, true)
on conflict (key) do update set
  label = excluded.label,
  description = excluded.description,
  privilege_level = excluded.privilege_level,
  is_system = excluded.is_system,
  updated_at = now();

create table if not exists public.profile_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  role_key text not null references public.roles(key) on update cascade,
  restaurant_id uuid references public.restaurants(id) on delete cascade,
  assigned_by uuid references public.profiles(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_profile_roles_global
  on public.profile_roles (user_id, role_key)
  where restaurant_id is null;

create unique index if not exists uq_profile_roles_restaurant
  on public.profile_roles (user_id, role_key, restaurant_id)
  where restaurant_id is not null;

create index if not exists idx_profile_roles_user_active
  on public.profile_roles (user_id, role_key)
  where is_active;

create index if not exists idx_profile_roles_restaurant_active
  on public.profile_roles (restaurant_id, role_key, user_id)
  where restaurant_id is not null and is_active;

create table if not exists public.simulation_leads (
  id uuid primary key default gen_random_uuid(),
  profile text not null,
  model text not null,
  pillar text,
  pain_points text[],
  acts_completed integer,
  completed boolean not null default false,
  cta_clicked text,
  language text,
  total_time_seconds integer,
  time_per_act jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_simulation_leads_created_at
  on public.simulation_leads (created_at desc);

create or replace function private.user_role_names(target_user_id uuid)
returns text[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with collected as (
    select array(
      select distinct role_name
      from (
        select pr.role_key as role_name
        from public.profile_roles pr
        where pr.user_id = target_user_id
          and pr.is_active
        union
        select ur.role::text as role_name
        from public.user_roles ur
        where ur.user_id = target_user_id
          and ur.is_active
      ) roles
      order by role_name
    ) as role_names
  )
  select case
    when cardinality(role_names) > 0 then role_names
    else array['customer']::text[]
  end
  from collected;
$$;

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
      ) restaurant_scope
      where restaurant_id is not null
      order by restaurant_id
    ),
    array[]::uuid[]
  );
$$;

create or replace function private.has_any_app_role(required_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from unnest(private.user_role_names(auth.uid())) as role_name
      where role_name = any(required_roles)
    );
$$;

create or replace function private.jwt_text_array(claim_name text)
returns text[]
language sql
stable
as $$
  select coalesce(
    array(
      select jsonb_array_elements_text(
        coalesce(auth.jwt() -> claim_name, auth.jwt() -> 'app_metadata' -> claim_name, '[]'::jsonb)
      )
    ),
    array[]::text[]
  );
$$;

create or replace function private.jwt_restaurant_ids()
returns uuid[]
language sql
stable
as $$
  select coalesce(
    array(
      select restaurant_id::uuid
      from unnest(private.jwt_text_array('restaurant_ids')) as restaurant_id
      where restaurant_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ),
    array[]::uuid[]
  );
$$;

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $$
declare
  claims jsonb;
  target_user_id uuid;
  role_names text[];
  restaurant_ids text[];
  primary_role text;
begin
  target_user_id := (event ->> 'user_id')::uuid;
  claims := coalesce(event -> 'claims', '{}'::jsonb);
  role_names := private.user_role_names(target_user_id);

  select r.key
  into primary_role
  from unnest(role_names) role_name
  join public.roles r on r.key = role_name
  order by r.privilege_level desc, r.key
  limit 1;

  if primary_role is null then
    primary_role := 'customer';
  end if;

  select coalesce(array_agg(restaurant_id::text order by restaurant_id::text), array[]::text[])
  into restaurant_ids
  from unnest(private.user_restaurant_ids(target_user_id)) restaurant_id;

  claims := jsonb_set(claims, '{app_role}', to_jsonb(primary_role), true);
  claims := jsonb_set(claims, '{roles}', to_jsonb(role_names), true);
  claims := jsonb_set(claims, '{restaurant_ids}', to_jsonb(restaurant_ids), true);

  return jsonb_set(event, '{claims}', claims, true);
end;
$$;

create or replace function private.sync_auth_user_to_app_profile()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  display_name text;
  avatar text;
  auth_provider text;
begin
  display_name := coalesce(
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name'
  );
  avatar := new.raw_user_meta_data ->> 'avatar_url';
  auth_provider := coalesce(
    new.raw_app_meta_data ->> 'provider',
    new.raw_user_meta_data ->> 'provider',
    'email'
  );

  insert into public.users (id, email, updated_at)
  values (new.id, new.email, now())
  on conflict (id) do update set
    email = excluded.email,
    updated_at = now();

  insert into public.profiles (
    id,
    email,
    full_name,
    avatar_url,
    phone,
    phone_verified,
    provider,
    created_at,
    updated_at
  )
  values (
    new.id,
    new.email,
    display_name,
    avatar,
    new.phone,
    coalesce(new.phone_confirmed_at is not null, false),
    left(auth_provider, 10),
    coalesce(new.created_at, now()),
    now()
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url),
    phone = coalesce(excluded.phone, public.profiles.phone),
    phone_verified = public.profiles.phone_verified or excluded.phone_verified,
    provider = coalesce(excluded.provider, public.profiles.provider),
    updated_at = now();

  insert into public.profile_roles (user_id, role_key)
  select new.id, 'customer'
  where not exists (
    select 1
    from public.profile_roles pr
    where pr.user_id = new.id
      and pr.role_key = 'customer'
      and pr.restaurant_id is null
  );

  return new;
end;
$$;

revoke all on function private.user_role_names(uuid) from public;
revoke all on function private.user_restaurant_ids(uuid) from public;
revoke all on function private.has_any_app_role(text[]) from public;
revoke all on function private.jwt_text_array(text) from public;
revoke all on function private.jwt_restaurant_ids() from public;
revoke all on function private.sync_auth_user_to_app_profile() from public;
revoke all on function public.custom_access_token_hook(jsonb) from public;

grant execute on function private.has_any_app_role(text[]) to authenticated, service_role;
grant execute on function private.jwt_text_array(text) to authenticated, service_role;
grant execute on function private.jwt_restaurant_ids() to authenticated, service_role;
grant execute on function public.custom_access_token_hook(jsonb) to service_role;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    grant usage on schema public, private to supabase_auth_admin;
    grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
    grant execute on function private.user_role_names(uuid) to supabase_auth_admin;
    grant execute on function private.user_restaurant_ids(uuid) to supabase_auth_admin;
    grant select on public.roles, public.profile_roles, public.user_roles, public.profiles to supabase_auth_admin;
  end if;
end;
$$;

drop trigger if exists on_auth_user_sync on auth.users;
drop trigger if exists on_auth_user_profile_sync on auth.users;
create trigger on_auth_user_profile_sync
  after insert or update of email, phone, phone_confirmed_at, raw_user_meta_data, raw_app_meta_data
  on auth.users
  for each row
  execute function private.sync_auth_user_to_app_profile();

insert into public.profile_roles (user_id, role_key)
select p.id, 'customer'
from public.profiles p
where not exists (
  select 1
  from public.profile_roles pr
  where pr.user_id = p.id
    and pr.role_key = 'customer'
    and pr.restaurant_id is null
);

do $$
declare
  table_record record;
begin
  for table_record in
    select schemaname, tablename
    from pg_tables
    where schemaname = 'public'
      and tablename <> 'spatial_ref_sys'
  loop
    execute format('alter table %I.%I enable row level security', table_record.schemaname, table_record.tablename);
  end loop;
end;
$$;

grant usage on schema public to anon, authenticated;
grant select on public.roles to anon, authenticated;
grant select, insert, update, delete on public.profile_roles to authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select on public.users to authenticated;
grant select on public.demo_feedback, public.demo_leads, public.simulation_leads, public.waitlist to authenticated;
grant insert on public.demo_feedback, public.demo_leads, public.simulation_leads, public.waitlist to anon, authenticated;

drop policy if exists roles_select_all on public.roles;
create policy roles_select_all
on public.roles
for select
to anon, authenticated
using (true);

drop policy if exists profile_roles_select_own on public.profile_roles;
drop policy if exists profile_roles_select_admin on public.profile_roles;
drop policy if exists profile_roles_insert_admin_or_restaurant_manager on public.profile_roles;
drop policy if exists profile_roles_update_admin_or_restaurant_manager on public.profile_roles;
drop policy if exists profile_roles_delete_admin_or_restaurant_manager on public.profile_roles;

create policy profile_roles_select_own
on public.profile_roles
for select
to authenticated
using (user_id = auth.uid());

create policy profile_roles_select_admin
on public.profile_roles
for select
to authenticated
using (
  private.has_any_app_role(array['admin'])
  or (
    restaurant_id is not null
    and private.has_restaurant_role(restaurant_id, array['owner', 'manager']::public.user_roles_role_enum[])
  )
);

create policy profile_roles_insert_admin_or_restaurant_manager
on public.profile_roles
for insert
to authenticated
with check (
  private.has_any_app_role(array['admin'])
  or (
    restaurant_id is not null
    and role_key <> 'admin'
    and private.has_restaurant_role(restaurant_id, array['owner', 'manager']::public.user_roles_role_enum[])
  )
);

create policy profile_roles_update_admin_or_restaurant_manager
on public.profile_roles
for update
to authenticated
using (
  private.has_any_app_role(array['admin'])
  or (
    restaurant_id is not null
    and role_key <> 'admin'
    and private.has_restaurant_role(restaurant_id, array['owner', 'manager']::public.user_roles_role_enum[])
  )
)
with check (
  private.has_any_app_role(array['admin'])
  or (
    restaurant_id is not null
    and role_key <> 'admin'
    and private.has_restaurant_role(restaurant_id, array['owner', 'manager']::public.user_roles_role_enum[])
  )
);

create policy profile_roles_delete_admin_or_restaurant_manager
on public.profile_roles
for delete
to authenticated
using (
  private.has_any_app_role(array['admin'])
  or (
    restaurant_id is not null
    and role_key <> 'admin'
    and private.has_restaurant_role(restaurant_id, array['owner', 'manager']::public.user_roles_role_enum[])
  )
);

drop policy if exists profiles_select_admin on public.profiles;
drop policy if exists profiles_update_admin on public.profiles;

create policy profiles_select_admin
on public.profiles
for select
to authenticated
using (private.has_any_app_role(array['admin']));

create policy profiles_update_admin
on public.profiles
for update
to authenticated
using (private.has_any_app_role(array['admin']))
with check (private.has_any_app_role(array['admin']));

drop policy if exists users_select_admin on public.users;
create policy users_select_admin
on public.users
for select
to authenticated
using (private.has_any_app_role(array['admin']));

drop policy if exists "Allow reading demo_feedback for authenticated" on public.demo_feedback;
drop policy if exists demo_feedback_select_admin on public.demo_feedback;
create policy demo_feedback_select_admin
on public.demo_feedback
for select
to authenticated
using (private.has_any_app_role(array['admin', 'owner', 'manager']));

drop policy if exists demo_leads_select_admin on public.demo_leads;
drop policy if exists "No public reads" on public.demo_leads;
create policy demo_leads_select_admin
on public.demo_leads
for select
to authenticated
using (private.has_any_app_role(array['admin', 'owner', 'manager']));

drop policy if exists simulation_leads_insert_public on public.simulation_leads;
drop policy if exists simulation_leads_select_admin on public.simulation_leads;
create policy simulation_leads_insert_public
on public.simulation_leads
for insert
to anon, authenticated
with check (true);

create policy simulation_leads_select_admin
on public.simulation_leads
for select
to authenticated
using (private.has_any_app_role(array['admin', 'owner', 'manager']));

drop policy if exists waitlist_select_admin on public.waitlist;
create policy waitlist_select_admin
on public.waitlist
for select
to authenticated
using (private.has_any_app_role(array['admin', 'owner', 'manager']));

do $$
declare
  table_record record;
begin
  for table_record in
    select table_name
    from information_schema.columns
    where table_schema = 'public'
      and column_name = 'restaurant_id'
      and table_name not in (
        'restaurants',
        'user_roles',
        'profile_roles',
        'orders',
        'order_items',
        'reservations',
        'waitlist_entries',
        'menu_categories',
        'menu_items'
      )
    group by table_name
  loop
    execute format('drop policy if exists authenticated_select_by_restaurant on public.%I', table_record.table_name);
    execute format('drop policy if exists authenticated_insert_by_restaurant_manager on public.%I', table_record.table_name);
    execute format('drop policy if exists authenticated_update_by_restaurant_manager on public.%I', table_record.table_name);
    execute format('drop policy if exists authenticated_delete_by_restaurant_manager on public.%I', table_record.table_name);

    execute format(
      'create policy authenticated_select_by_restaurant on public.%I for select to authenticated using (private.has_any_app_role(array[''admin'']) or private.has_restaurant_role(restaurant_id))',
      table_record.table_name
    );
    execute format(
      'create policy authenticated_insert_by_restaurant_manager on public.%I for insert to authenticated with check (private.has_any_app_role(array[''admin'']) or private.has_restaurant_role(restaurant_id, array[''owner'', ''manager'']::public.user_roles_role_enum[]))',
      table_record.table_name
    );
    execute format(
      'create policy authenticated_update_by_restaurant_manager on public.%I for update to authenticated using (private.has_any_app_role(array[''admin'']) or private.has_restaurant_role(restaurant_id, array[''owner'', ''manager'']::public.user_roles_role_enum[])) with check (private.has_any_app_role(array[''admin'']) or private.has_restaurant_role(restaurant_id, array[''owner'', ''manager'']::public.user_roles_role_enum[]))',
      table_record.table_name
    );
    execute format(
      'create policy authenticated_delete_by_restaurant_manager on public.%I for delete to authenticated using (private.has_any_app_role(array[''admin'']) or private.has_restaurant_role(restaurant_id, array[''owner'', ''manager'']::public.user_roles_role_enum[]))',
      table_record.table_name
    );
  end loop;
end;
$$;

do $$
declare
  table_record record;
begin
  for table_record in
    select table_name
    from information_schema.columns
    where table_schema = 'public'
      and column_name = 'user_id'
      and table_name not in (
        'profile_roles',
        'user_roles'
      )
    group by table_name
  loop
    execute format('drop policy if exists authenticated_select_own_user_id on public.%I', table_record.table_name);
    execute format('drop policy if exists authenticated_insert_own_user_id on public.%I', table_record.table_name);
    execute format('drop policy if exists authenticated_update_own_user_id on public.%I', table_record.table_name);
    execute format('drop policy if exists authenticated_delete_own_user_id on public.%I', table_record.table_name);

    execute format(
      'create policy authenticated_select_own_user_id on public.%I for select to authenticated using (private.has_any_app_role(array[''admin'']) or user_id = auth.uid())',
      table_record.table_name
    );
    execute format(
      'create policy authenticated_insert_own_user_id on public.%I for insert to authenticated with check (private.has_any_app_role(array[''admin'']) or user_id = auth.uid())',
      table_record.table_name
    );
    execute format(
      'create policy authenticated_update_own_user_id on public.%I for update to authenticated using (private.has_any_app_role(array[''admin'']) or user_id = auth.uid()) with check (private.has_any_app_role(array[''admin'']) or user_id = auth.uid())',
      table_record.table_name
    );
    execute format(
      'create policy authenticated_delete_own_user_id on public.%I for delete to authenticated using (private.has_any_app_role(array[''admin'']) or user_id = auth.uid())',
      table_record.table_name
    );
  end loop;
end;
$$;

do $$
declare
  table_record record;
begin
  for table_record in
    select table_name
    from information_schema.columns
    where table_schema = 'public'
      and column_name = 'customer_id'
      and table_name not in (
        'orders',
        'reservations',
        'waitlist_entries'
      )
    group by table_name
  loop
    execute format('drop policy if exists authenticated_select_own_customer_id on public.%I', table_record.table_name);
    execute format('drop policy if exists authenticated_insert_own_customer_id on public.%I', table_record.table_name);
    execute format('drop policy if exists authenticated_update_own_customer_id on public.%I', table_record.table_name);
    execute format('drop policy if exists authenticated_delete_own_customer_id on public.%I', table_record.table_name);

    execute format(
      'create policy authenticated_select_own_customer_id on public.%I for select to authenticated using (private.has_any_app_role(array[''admin'']) or customer_id = auth.uid())',
      table_record.table_name
    );
    execute format(
      'create policy authenticated_insert_own_customer_id on public.%I for insert to authenticated with check (private.has_any_app_role(array[''admin'']) or customer_id = auth.uid())',
      table_record.table_name
    );
    execute format(
      'create policy authenticated_update_own_customer_id on public.%I for update to authenticated using (private.has_any_app_role(array[''admin'']) or customer_id = auth.uid()) with check (private.has_any_app_role(array[''admin'']) or customer_id = auth.uid())',
      table_record.table_name
    );
    execute format(
      'create policy authenticated_delete_own_customer_id on public.%I for delete to authenticated using (private.has_any_app_role(array[''admin'']) or customer_id = auth.uid())',
      table_record.table_name
    );
  end loop;
end;
$$;

comment on table public.roles is 'Application role catalog used by Supabase Auth, RLS, and UI authorization.';
comment on table public.profile_roles is 'Global and optional restaurant-scoped roles for profiles; default customer is assigned by auth trigger.';
comment on function public.custom_access_token_hook(jsonb) is 'Configure this function as the Supabase Auth Custom Access Token hook to expose app_role, roles, and restaurant_ids claims.';
