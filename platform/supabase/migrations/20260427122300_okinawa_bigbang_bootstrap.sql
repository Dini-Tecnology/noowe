-- Bootstrap helpers for the Okinawa Big Bang migration.
-- The operational schema should be loaded from the consolidated TypeORM baseline
-- before domain-specific RLS policies are finalized.

create extension if not exists "pgcrypto" with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;

create schema if not exists private;

revoke all on schema private from anon, authenticated;
grant usage on schema private to postgres, service_role, authenticated;

create or replace function private.jwt_app_metadata()
returns jsonb
language sql
stable
as $$
  select coalesce((auth.jwt() -> 'app_metadata')::jsonb, '{}'::jsonb);
$$;

create or replace function private.jwt_text_array(claim_name text)
returns text[]
language sql
stable
as $$
  select coalesce(
    array(
      select jsonb_array_elements_text(private.jwt_app_metadata() -> claim_name)
    ),
    array[]::text[]
  );
$$;

create or replace function private.has_any_app_role(required_roles text[])
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from unnest(private.jwt_text_array('roles')) as jwt_role(role_name)
    where jwt_role.role_name = any(required_roles)
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

create or replace function private.can_access_restaurant(target_restaurant_id uuid)
returns boolean
language sql
stable
as $$
  select target_restaurant_id = any(private.jwt_restaurant_ids());
$$;

create or replace function private.has_restaurant_role(
  target_restaurant_id uuid,
  required_roles public.user_roles_role_enum[] default array[
    'owner',
    'manager',
    'chef',
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
  );
$$;

revoke all on function private.jwt_app_metadata() from public;
revoke all on function private.jwt_text_array(text) from public;
revoke all on function private.has_any_app_role(text[]) from public;
revoke all on function private.jwt_restaurant_ids() from public;
revoke all on function private.can_access_restaurant(uuid) from public;
revoke all on function private.has_restaurant_role(uuid, public.user_roles_role_enum[]) from public;

grant execute on function private.jwt_app_metadata() to authenticated, service_role;
grant execute on function private.jwt_text_array(text) to authenticated, service_role;
grant execute on function private.has_any_app_role(text[]) to authenticated, service_role;
grant execute on function private.jwt_restaurant_ids() to authenticated, service_role;
grant execute on function private.can_access_restaurant(uuid) to authenticated, service_role;
grant execute on function private.has_restaurant_role(uuid, public.user_roles_role_enum[]) to authenticated, service_role;

do $$
declare
  table_record record;
begin
  for table_record in
    select schemaname, tablename
    from pg_tables
    where schemaname = 'public'
      and tablename not like 'spatial_ref_sys'
  loop
    execute format('alter table %I.%I enable row level security', table_record.schemaname, table_record.tablename);
  end loop;
end;
$$;

grant usage on schema public to anon, authenticated;

grant select on public.restaurants to anon, authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.user_roles to authenticated;
grant select, insert, update on public.orders to authenticated;
grant select, insert, update on public.order_items to authenticated;
grant select, insert, update on public.reservations to authenticated;
grant select, insert, update on public.notifications to authenticated;
grant select, insert, update on public.waitlist_entries to authenticated;
revoke all on public.users from anon, authenticated;
grant select on public.users to authenticated;

drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_select_for_restaurant_staff on public.profiles;
drop policy if exists profiles_insert_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;

create policy profiles_select_own
on public.profiles
for select
to authenticated
using (id = auth.uid());

create policy profiles_select_for_restaurant_staff
on public.profiles
for select
to authenticated
using (
  exists (
    select 1
    from public.orders o
    where o.customer_id = profiles.id
      and private.has_restaurant_role(o.restaurant_id)
  )
  or exists (
    select 1
    from public.reservations r
    where r.customer_id = profiles.id
      and private.has_restaurant_role(r.restaurant_id)
  )
  or exists (
    select 1
    from public.waitlist_entries w
    where w.customer_id = profiles.id
      and private.has_restaurant_role(w.restaurant_id)
  )
);

create policy profiles_insert_own
on public.profiles
for insert
to authenticated
with check (id = auth.uid());

create policy profiles_update_own
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists users_select_own on public.users;
drop policy if exists users_select_for_restaurant_staff on public.users;
drop policy if exists users_insert_own on public.users;
drop policy if exists users_update_own on public.users;

create policy users_select_own
on public.users
for select
to authenticated
using (id = auth.uid());

create policy users_select_for_restaurant_staff
on public.users
for select
to authenticated
using (
  exists (
    select 1
    from public.orders o
    where o.customer_id = users.id
      and private.has_restaurant_role(o.restaurant_id)
  )
  or exists (
    select 1
    from public.reservations r
    where r.customer_id = users.id
      and private.has_restaurant_role(r.restaurant_id)
  )
  or exists (
    select 1
    from public.waitlist_entries w
    where w.customer_id = users.id
      and private.has_restaurant_role(w.restaurant_id)
  )
);

drop policy if exists restaurants_select_active on public.restaurants;
drop policy if exists restaurants_select_staff on public.restaurants;
drop policy if exists restaurants_insert_owner on public.restaurants;
drop policy if exists restaurants_update_owner_or_manager on public.restaurants;
drop policy if exists restaurants_delete_owner on public.restaurants;

create policy restaurants_select_active
on public.restaurants
for select
to anon, authenticated
using (is_active);

create policy restaurants_select_staff
on public.restaurants
for select
to authenticated
using (owner_id = auth.uid() or private.has_restaurant_role(id));

create policy restaurants_insert_owner
on public.restaurants
for insert
to authenticated
with check (owner_id = auth.uid());

create policy restaurants_update_owner_or_manager
on public.restaurants
for update
to authenticated
using (
  owner_id = auth.uid()
  or private.has_restaurant_role(id, array['owner', 'manager']::public.user_roles_role_enum[])
)
with check (
  owner_id = auth.uid()
  or private.has_restaurant_role(id, array['owner', 'manager']::public.user_roles_role_enum[])
);

create policy restaurants_delete_owner
on public.restaurants
for delete
to authenticated
using (owner_id = auth.uid());

drop policy if exists user_roles_select_own on public.user_roles;
drop policy if exists user_roles_select_managed_restaurant on public.user_roles;
drop policy if exists user_roles_insert_managed_restaurant on public.user_roles;
drop policy if exists user_roles_update_managed_restaurant on public.user_roles;
drop policy if exists user_roles_delete_managed_restaurant on public.user_roles;

create policy user_roles_select_own
on public.user_roles
for select
to authenticated
using (user_id = auth.uid());

create policy user_roles_select_managed_restaurant
on public.user_roles
for select
to authenticated
using (
  private.has_restaurant_role(restaurant_id, array['owner', 'manager']::public.user_roles_role_enum[])
);

create policy user_roles_insert_managed_restaurant
on public.user_roles
for insert
to authenticated
with check (
  private.has_restaurant_role(restaurant_id, array['owner', 'manager']::public.user_roles_role_enum[])
);

create policy user_roles_update_managed_restaurant
on public.user_roles
for update
to authenticated
using (
  private.has_restaurant_role(restaurant_id, array['owner', 'manager']::public.user_roles_role_enum[])
)
with check (
  private.has_restaurant_role(restaurant_id, array['owner', 'manager']::public.user_roles_role_enum[])
);

create policy user_roles_delete_managed_restaurant
on public.user_roles
for delete
to authenticated
using (
  private.has_restaurant_role(restaurant_id, array['owner', 'manager']::public.user_roles_role_enum[])
);

drop policy if exists orders_select_customer on public.orders;
drop policy if exists orders_select_restaurant_staff on public.orders;
drop policy if exists orders_insert_customer on public.orders;
drop policy if exists orders_update_customer on public.orders;
drop policy if exists orders_update_restaurant_staff on public.orders;

create policy orders_select_customer
on public.orders
for select
to authenticated
using (customer_id = auth.uid());

create policy orders_select_restaurant_staff
on public.orders
for select
to authenticated
using (private.has_restaurant_role(restaurant_id));

create policy orders_insert_customer
on public.orders
for insert
to authenticated
with check (customer_id = auth.uid());

create policy orders_update_customer
on public.orders
for update
to authenticated
using (customer_id = auth.uid())
with check (customer_id = auth.uid());

create policy orders_update_restaurant_staff
on public.orders
for update
to authenticated
using (private.has_restaurant_role(restaurant_id))
with check (private.has_restaurant_role(restaurant_id));

drop policy if exists order_items_select_accessible_order on public.order_items;
drop policy if exists order_items_insert_accessible_order on public.order_items;
drop policy if exists order_items_update_restaurant_staff on public.order_items;

create policy order_items_select_accessible_order
on public.order_items
for select
to authenticated
using (
  exists (
    select 1
    from public.orders o
    where o.id = order_items.order_id
      and (o.customer_id = auth.uid() or private.has_restaurant_role(o.restaurant_id))
  )
);

create policy order_items_insert_accessible_order
on public.order_items
for insert
to authenticated
with check (
  exists (
    select 1
    from public.orders o
    where o.id = order_items.order_id
      and (o.customer_id = auth.uid() or private.has_restaurant_role(o.restaurant_id))
  )
);

create policy order_items_update_restaurant_staff
on public.order_items
for update
to authenticated
using (
  exists (
    select 1
    from public.orders o
    where o.id = order_items.order_id
      and private.has_restaurant_role(o.restaurant_id)
  )
)
with check (
  exists (
    select 1
    from public.orders o
    where o.id = order_items.order_id
      and private.has_restaurant_role(o.restaurant_id)
  )
);

drop policy if exists reservations_select_customer on public.reservations;
drop policy if exists reservations_select_restaurant_staff on public.reservations;
drop policy if exists reservations_insert_customer on public.reservations;
drop policy if exists reservations_update_customer on public.reservations;
drop policy if exists reservations_update_restaurant_staff on public.reservations;

create policy reservations_select_customer
on public.reservations
for select
to authenticated
using (customer_id = auth.uid());

create policy reservations_select_restaurant_staff
on public.reservations
for select
to authenticated
using (private.has_restaurant_role(restaurant_id));

create policy reservations_insert_customer
on public.reservations
for insert
to authenticated
with check (customer_id = auth.uid());

create policy reservations_update_customer
on public.reservations
for update
to authenticated
using (customer_id = auth.uid())
with check (customer_id = auth.uid());

create policy reservations_update_restaurant_staff
on public.reservations
for update
to authenticated
using (private.has_restaurant_role(restaurant_id))
with check (private.has_restaurant_role(restaurant_id));

drop policy if exists notifications_select_own on public.notifications;
drop policy if exists notifications_insert_own on public.notifications;
drop policy if exists notifications_update_own on public.notifications;

create policy notifications_select_own
on public.notifications
for select
to authenticated
using (user_id = auth.uid());

create policy notifications_insert_own
on public.notifications
for insert
to authenticated
with check (user_id = auth.uid());

create policy notifications_update_own
on public.notifications
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists waitlist_entries_select_customer on public.waitlist_entries;
drop policy if exists waitlist_entries_select_restaurant_staff on public.waitlist_entries;
drop policy if exists waitlist_entries_insert_customer on public.waitlist_entries;
drop policy if exists waitlist_entries_update_customer on public.waitlist_entries;
drop policy if exists waitlist_entries_update_restaurant_staff on public.waitlist_entries;

create policy waitlist_entries_select_customer
on public.waitlist_entries
for select
to authenticated
using (customer_id = auth.uid());

create policy waitlist_entries_select_restaurant_staff
on public.waitlist_entries
for select
to authenticated
using (private.has_restaurant_role(restaurant_id));

create policy waitlist_entries_insert_customer
on public.waitlist_entries
for insert
to authenticated
with check (customer_id is null or customer_id = auth.uid());

create policy waitlist_entries_update_customer
on public.waitlist_entries
for update
to authenticated
using (customer_id = auth.uid())
with check (customer_id = auth.uid());

create policy waitlist_entries_update_restaurant_staff
on public.waitlist_entries
for update
to authenticated
using (private.has_restaurant_role(restaurant_id))
with check (private.has_restaurant_role(restaurant_id));

do $$
declare
  realtime_table text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    -- Keep PR1/PR2 realtime scoped to top-level streams consumed by mobile.
    -- order_items remain available through nested order refetches until a direct item stream is contracted.
    foreach realtime_table in array array[
      'orders',
      'reservations',
      'notifications',
      'waitlist_entries'
    ]
    loop
      execute format('alter table public.%I replica identity full', realtime_table);

      if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = realtime_table
      ) then
        execute format('alter publication supabase_realtime add table public.%I', realtime_table);
      end if;
    end loop;
  end if;
end;
$$;

comment on schema private is
  'Private helper schema for Supabase RLS and migration support. Do not expose through the Data API.';
