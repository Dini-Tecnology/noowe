
-- ═══════════════════════════════════════════════════════════════════════════════
-- FILE: 20260318004427_5dd946ed-cdff-49d1-b420-e4d2ef008066.sql
-- ═══════════════════════════════════════════════════════════════════════════════

-- Create waitlist table for B2C app signups
CREATE TABLE IF NOT EXISTS public.waitlist (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  city TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert (public signup)
DROP POLICY IF EXISTS "Anyone can join waitlist" ON public.waitlist;
CREATE POLICY "Anyone can join waitlist"
ON public.waitlist
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- No public reads of personal data
DROP POLICY IF EXISTS "No public reads" ON public.waitlist;
CREATE POLICY "No public reads"
ON public.waitlist
FOR SELECT
TO anon, authenticated
USING (false);
-- ═══════════════════════════════════════════════════════════════════════════════
-- FILE: 20260318011542_dade4b94-74c2-4f70-8506-d62464f17374.sql
-- ═══════════════════════════════════════════════════════════════════════════════


CREATE TABLE IF NOT EXISTS public.demo_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  name text NOT NULL,
  restaurant text NOT NULL,
  email text NOT NULL,
  phone text,
  access_code text NOT NULL,
  verified boolean NOT NULL DEFAULT false
);

ALTER TABLE public.demo_leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public insert" ON public.demo_leads;
CREATE POLICY "Allow public insert" ON public.demo_leads
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "No public reads" ON public.demo_leads;
CREATE POLICY "No public reads" ON public.demo_leads
  FOR SELECT TO anon, authenticated
  USING (false);

-- ═══════════════════════════════════════════════════════════════════════════════
-- FILE: 20260323021545_c4df10e1-4031-4a34-8a0d-b965ffd0a49c.sql
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.demo_feedback (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT,
  feedback_type TEXT NOT NULL DEFAULT 'improvement',
  rating INTEGER,
  description TEXT,
  page_route TEXT,
  demo_step TEXT,
  viewport_mode TEXT,
  active_role TEXT,
  journey_step TEXT,
  recent_actions JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.demo_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anonymous inserts on demo_feedback" ON public.demo_feedback;
CREATE POLICY "Allow anonymous inserts on demo_feedback"
ON public.demo_feedback
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "Allow reading demo_feedback for authenticated" ON public.demo_feedback;
CREATE POLICY "Allow reading demo_feedback for authenticated"
ON public.demo_feedback
FOR SELECT
TO authenticated
USING (true);
-- ═══════════════════════════════════════════════════════════════════════════════
-- FILE: 20260323023154_63a50d9b-2c0b-4766-8d65-39db7d5aba5e.sql
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.waitlist ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.waitlist ADD COLUMN IF NOT EXISTS state text;
-- ═══════════════════════════════════════════════════════════════════════════════
-- FILE: 20260427101000_create_core_bootstrap_tables.sql
-- ═══════════════════════════════════════════════════════════════════════════════

-- Core tables required for no-legacy bootstrap flow.
-- This is intentionally minimal and can be expanded later by full baseline migrations.

create extension if not exists "pgcrypto" with schema extensions;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'user_roles_role_enum'
  ) then
    create type public.user_roles_role_enum as enum (
      'customer',
      'owner',
      'manager',
      'chef',
      'waiter',
      'barman',
      'maitre'
    );
  end if;
end
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  full_name text,
  avatar_url text,
  phone text,
  phone_verified boolean not null default false,
  provider varchar(10),
  google_id varchar unique,
  apple_id varchar unique,
  biometric_enabled boolean not null default false,
  fcm_token varchar,
  last_login_at timestamptz,
  default_address text,
  dietary_restrictions text[],
  favorite_cuisines text[],
  preferences jsonb,
  birth_date date,
  marketing_consent boolean not null default false,
  is_active boolean not null default true,
  deletion_requested_at timestamptz,
  deletion_scheduled_for timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.restaurants (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete restrict,
  name text not null,
  description text,
  address text not null,
  city text not null,
  state text not null,
  zip_code text not null,
  phone text not null,
  email text not null,
  logo_url text,
  banner_url text,
  location jsonb,
  service_type text not null,
  cuisine_types jsonb,
  opening_hours jsonb,
  average_ticket numeric(10,2),
  rating numeric(3,2) not null default 0,
  total_reviews integer not null default 0,
  is_active boolean not null default true,
  service_config jsonb,
  setup_progress jsonb not null default '[]'::jsonb,
  lat numeric(10,7),
  lng numeric(10,7),
  geofence_radius integer default 500,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_restaurants_owner_id on public.restaurants(owner_id);

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  role public.user_roles_role_enum not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_user_roles_user_restaurant_role
  on public.user_roles (user_id, restaurant_id, role);
create index if not exists idx_user_roles_restaurant_active
  on public.user_roles (restaurant_id, role, user_id)
  where is_active;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'orders_status_enum'
  ) then
    create type public.orders_status_enum as enum (
      'pending',
      'confirmed',
      'preparing',
      'ready',
      'delivered',
      'completed',
      'cancelled'
    );
  end if;

  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'orders_order_type_enum'
  ) then
    create type public.orders_order_type_enum as enum (
      'dine_in',
      'pickup',
      'delivery'
    );
  end if;

  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'order_items_status_enum'
  ) then
    create type public.order_items_status_enum as enum (
      'pending',
      'preparing',
      'ready',
      'delivered',
      'cancelled'
    );
  end if;

  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'reservations_status_enum'
  ) then
    create type public.reservations_status_enum as enum (
      'pending',
      'confirmed',
      'seated',
      'completed',
      'cancelled',
      'no_show'
    );
  end if;

  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'notifications_notification_type_enum'
  ) then
    create type public.notifications_notification_type_enum as enum (
      'order_placed',
      'order_confirmed',
      'order_ready',
      'order_delivered',
      'order_cancelled',
      'reservation_confirmed',
      'reservation_reminder',
      'reservation_cancelled',
      'payment_received',
      'payment_failed',
      'promotion',
      'system'
    );
  end if;

  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'notifications_related_type_enum'
  ) then
    create type public.notifications_related_type_enum as enum (
      'order',
      'reservation',
      'payment',
      'loyalty',
      'review',
      'restaurant',
      'promotion'
    );
  end if;

  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'waitlist_entries_status_enum'
  ) then
    create type public.waitlist_entries_status_enum as enum (
      'waiting',
      'called',
      'seated',
      'no_show',
      'cancelled'
    );
  end if;

  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'waitlist_entries_preference_enum'
  ) then
    create type public.waitlist_entries_preference_enum as enum (
      'salao',
      'terraco',
      'qualquer'
    );
  end if;
end
$$;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  customer_id uuid not null references public.profiles(id) on delete restrict,
  order_type public.orders_order_type_enum not null default 'dine_in',
  table_id uuid,
  delivery_address jsonb,
  status public.orders_status_enum not null default 'pending',
  estimated_time integer,
  cancellation_reason text,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_orders_customer_id on public.orders(customer_id);
create index if not exists idx_orders_restaurant_id on public.orders(restaurant_id);
create index if not exists idx_orders_restaurant_customer on public.orders(restaurant_id, customer_id);
create index if not exists idx_orders_status on public.orders(status);
create index if not exists idx_orders_created_at on public.orders(created_at desc);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  menu_item_id uuid not null,
  quantity integer not null check (quantity > 0),
  unit_price numeric(10,2) not null default 0,
  total_price numeric(10,2) not null default 0,
  status public.order_items_status_enum not null default 'pending',
  special_instructions text,
  customizations jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_order_items_order_id on public.order_items(order_id);
create index if not exists idx_order_items_menu_item_id on public.order_items(menu_item_id);

create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  customer_id uuid not null references public.profiles(id) on delete restrict,
  table_id uuid,
  reservation_time timestamptz not null,
  party_size integer not null check (party_size > 0),
  special_requests text,
  status public.reservations_status_enum not null default 'pending',
  cancellation_reason text,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_reservations_customer_id on public.reservations(customer_id);
create index if not exists idx_reservations_restaurant_id on public.reservations(restaurant_id);
create index if not exists idx_reservations_restaurant_customer on public.reservations(restaurant_id, customer_id);
create index if not exists idx_reservations_status on public.reservations(status);
create index if not exists idx_reservations_time on public.reservations(reservation_time);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  message text not null,
  notification_type public.notifications_notification_type_enum not null default 'system',
  related_id uuid,
  related_type public.notifications_related_type_enum,
  is_read boolean not null default false,
  read_at timestamptz,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_user_id on public.notifications(user_id);
create index if not exists idx_notifications_user_read on public.notifications(user_id, is_read, created_at desc);

create table if not exists public.waitlist_entries (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  customer_id uuid references public.profiles(id) on delete set null,
  customer_name text not null,
  customer_phone text,
  party_size integer not null check (party_size > 0),
  preference public.waitlist_entries_preference_enum not null default 'qualquer',
  has_kids boolean not null default false,
  kids_ages jsonb,
  kids_allergies jsonb,
  waitlist_bar_orders jsonb not null default '[]'::jsonb,
  status public.waitlist_entries_status_enum not null default 'waiting',
  estimated_wait_minutes integer,
  position integer not null,
  notes text,
  table_number text,
  called_at timestamptz,
  seated_at timestamptz,
  no_show_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_waitlist_entries_restaurant_id on public.waitlist_entries(restaurant_id);
create index if not exists idx_waitlist_entries_customer_id on public.waitlist_entries(customer_id);
create index if not exists idx_waitlist_entries_status on public.waitlist_entries(status);
create index if not exists idx_waitlist_entries_position on public.waitlist_entries(restaurant_id, position);

alter table public.profiles enable row level security;
alter table public.restaurants enable row level security;
alter table public.user_roles enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.reservations enable row level security;
alter table public.notifications enable row level security;
alter table public.waitlist_entries enable row level security;

-- ═══════════════════════════════════════════════════════════════════════════════
-- FILE: 20260427115000_public_users_auth_sync.sql
-- ═══════════════════════════════════════════════════════════════════════════════

-- Canonical public.users row per auth user (identity + audit).
-- Runs before okinawa_bigbang_bootstrap so the RLS sweep includes this table.

create schema if not exists private;

revoke all on schema private from anon, authenticated;
grant usage on schema private to postgres, service_role;

create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_users_email_lower on public.users (lower(email));

insert into public.users (id, email, created_at, updated_at)
select
  id,
  email,
  coalesce(created_at, now()),
  coalesce(updated_at, now())
from auth.users
on conflict (id) do update set
  email = excluded.email,
  updated_at = excluded.updated_at;

create or replace function private.sync_auth_user_to_public_users()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.users (id, email, updated_at)
  values (new.id, new.email, now())
  on conflict (id) do update set
    email = excluded.email,
    updated_at = now();
  return new;
end;
$$;

revoke all on function private.sync_auth_user_to_public_users() from public;
grant execute on function private.sync_auth_user_to_public_users() to postgres, service_role;

drop trigger if exists on_auth_user_sync on auth.users;
create trigger on_auth_user_sync
  after insert or update of email on auth.users
  for each row
  execute function private.sync_auth_user_to_public_users();

comment on table public.users is
  'Application identity mirror of auth.users; kept in sync via private.sync_auth_user_to_public_users.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- FILE: 20260427122300_okinawa_bigbang_bootstrap.sql
-- ═══════════════════════════════════════════════════════════════════════════════

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

-- ═══════════════════════════════════════════════════════════════════════════════
-- FILE: 20260429120000_menu_categories_and_menu_items.sql
-- ═══════════════════════════════════════════════════════════════════════════════

-- Menu catalog aligned with backend MenuCategory / MenuItem entities (TypeORM).
-- Adds FK from order_items.menu_item_id → menu_items.id for integrity with Supabase direct writes.
--
-- Prerequisite: orphaned order_items.menu_item_id rows (not present in menu_items) must be fixed
-- before applying this migration, or the FK step will fail.

-- ─── Categories ─────────────────────────────────────────────────────────────

create table if not exists public.menu_categories (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null,
  description text,
  display_order integer not null default 0,
  is_active boolean not null default true,
  icon text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_menu_categories_restaurant_id on public.menu_categories(restaurant_id);

-- ─── Items (station_id = logical link to KDS station UUID; no FK — cook_stations not in Supabase DDL)

create table if not exists public.menu_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null,
  description text,
  price numeric(10, 2) not null,
  category_id uuid references public.menu_categories(id) on delete set null,
  image_url text,
  is_available boolean not null default true,
  preparation_time integer,
  calories integer,
  allergens jsonb,
  dietary_info jsonb,
  customizations jsonb,
  display_order integer not null default 0,
  station_id uuid,
  estimated_prep_minutes integer not null default 10,
  course varchar(20) not null default 'main',
  ncm varchar(8) not null default '00000000',
  cfop varchar(4) not null default '5102',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_menu_items_restaurant_id on public.menu_items(restaurant_id);
create index if not exists idx_menu_items_category_id on public.menu_items(category_id);
create index if not exists idx_menu_items_available on public.menu_items(is_available);
create index if not exists idx_menu_items_display_order on public.menu_items(display_order);

-- ─── FK order_items → menu_items ────────────────────────────────────────────

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'order_items_menu_item_id_fkey'
      and conrelid = 'public.order_items'::regclass
  ) then
    alter table public.order_items
      add constraint order_items_menu_item_id_fkey
      foreign key (menu_item_id) references public.menu_items(id)
      on delete restrict;
  end if;
end
$$;

-- ─── RLS ─────────────────────────────────────────────────────────────────────

alter table public.menu_categories enable row level security;
alter table public.menu_items enable row level security;

grant select on public.menu_categories to anon, authenticated;
grant select, insert, update, delete on public.menu_categories to authenticated;

grant select on public.menu_items to anon, authenticated;
grant select, insert, update, delete on public.menu_items to authenticated;

drop policy if exists menu_categories_select_public on public.menu_categories;
drop policy if exists menu_categories_select_staff on public.menu_categories;
drop policy if exists menu_categories_insert_staff on public.menu_categories;
drop policy if exists menu_categories_update_staff on public.menu_categories;
drop policy if exists menu_categories_delete_staff on public.menu_categories;

create policy menu_categories_select_public
on public.menu_categories
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.restaurants r
    where r.id = menu_categories.restaurant_id
      and r.is_active
  )
);

create policy menu_categories_select_staff
on public.menu_categories
for select
to authenticated
using (private.has_restaurant_role(restaurant_id));

create policy menu_categories_insert_staff
on public.menu_categories
for insert
to authenticated
with check (
  private.has_restaurant_role(restaurant_id, array['owner', 'manager']::public.user_roles_role_enum[])
);

create policy menu_categories_update_staff
on public.menu_categories
for update
to authenticated
using (
  private.has_restaurant_role(restaurant_id, array['owner', 'manager']::public.user_roles_role_enum[])
)
with check (
  private.has_restaurant_role(restaurant_id, array['owner', 'manager']::public.user_roles_role_enum[])
);

create policy menu_categories_delete_staff
on public.menu_categories
for delete
to authenticated
using (
  private.has_restaurant_role(restaurant_id, array['owner', 'manager']::public.user_roles_role_enum[])
);

drop policy if exists menu_items_select_public on public.menu_items;
drop policy if exists menu_items_select_staff on public.menu_items;
drop policy if exists menu_items_insert_staff on public.menu_items;
drop policy if exists menu_items_update_staff on public.menu_items;
drop policy if exists menu_items_delete_staff on public.menu_items;

create policy menu_items_select_public
on public.menu_items
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.restaurants r
    where r.id = menu_items.restaurant_id
      and r.is_active
  )
);

create policy menu_items_select_staff
on public.menu_items
for select
to authenticated
using (private.has_restaurant_role(restaurant_id));

create policy menu_items_insert_staff
on public.menu_items
for insert
to authenticated
with check (
  private.has_restaurant_role(restaurant_id, array['owner', 'manager']::public.user_roles_role_enum[])
);

create policy menu_items_update_staff
on public.menu_items
for update
to authenticated
using (
  private.has_restaurant_role(restaurant_id, array['owner', 'manager']::public.user_roles_role_enum[])
)
with check (
  private.has_restaurant_role(restaurant_id, array['owner', 'manager']::public.user_roles_role_enum[])
);

create policy menu_items_delete_staff
on public.menu_items
for delete
to authenticated
using (
  private.has_restaurant_role(restaurant_id, array['owner', 'manager']::public.user_roles_role_enum[])
);

comment on table public.menu_categories is
  'Menu sections per restaurant; mirrors backend menu_categories.';
comment on table public.menu_items is
  'Sellable dishes/drinks; mirrors backend menu_items. station_id optional UUID when KDS stations exist elsewhere.';
comment on column public.menu_items.station_id is
  'Optional cook station UUID; no FK in Supabase bootstrap — align manually if stations are replicated.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- FILE: 20260430180000_generated_rest_platform_tables.sql
-- ═══════════════════════════════════════════════════════════════════════════════

-- Gerado por generate-backend-parity-schema.mjs
-- Fonte: backend/tmp/supabase-migration/schema-inventory.json
-- Enums TypeORM como text (podem virar CREATE TYPE depois).
-- Sem FKs aqui — adicionar em migração dedicada quando estáveis.

create table if not exists public.bills (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  description text not null,
  supplier text,
  category text not null,
  amount numeric not null,
  due_date timestamptz not null,
  paid_date timestamptz,
  status text not null,
  is_recurring boolean not null,
  recurrence text,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  restaurant_id uuid,
  label text not null,
  street text not null,
  number text not null,
  complement text,
  neighborhood text not null,
  city text not null,
  state text not null,
  postal_code text not null,
  country text not null,
  latitude numeric,
  longitude numeric,
  is_default boolean not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.approvals (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  type text not null,
  item_name text not null,
  table_id uuid,
  requester_id uuid not null,
  resolver_id uuid,
  reason text not null,
  resolution_note text,
  amount numeric not null,
  status text not null,
  order_id uuid,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  resolved_at timestamptz
);

create table if not exists public.biometric_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  device_id uuid not null,
  token_hash text not null,
  biometric_type text not null,
  public_key text,
  expires_at timestamptz not null,
  platform text,
  is_revoked boolean not null,
  revoked_at timestamptz,
  revoke_reason text,
  last_used_at timestamptz,
  ip_address text,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.otp_tokens (
  id uuid primary key default gen_random_uuid(),
  phone_number text not null,
  code_hash text not null,
  channel text not null,
  purpose text not null,
  expires_at timestamptz not null,
  attempts numeric not null,
  is_used boolean not null,
  used_at timestamptz,
  ip_address text,
  created_at timestamptz not null
);

create table if not exists public.service_calls (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  table_id uuid,
  user_id uuid not null,
  call_type text not null,
  status text not null,
  message text,
  called_at timestamptz not null,
  acknowledged_at timestamptz,
  acknowledged_by text,
  resolved_at timestamptz,
  resolved_by text,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.cash_register_movements (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  type text not null,
  amount numeric not null,
  is_cash boolean not null,
  order_id uuid,
  created_by text not null,
  description text,
  created_at timestamptz not null
);

create table if not exists public.cash_register_sessions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  opened_by text not null,
  closed_by text,
  opening_balance numeric not null,
  expected_balance numeric,
  actual_balance numeric,
  difference numeric,
  status text not null,
  opened_at timestamptz not null,
  closed_at timestamptz,
  closing_notes text
);

create table if not exists public.club_birthday_entries (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  user_id uuid not null,
  event_date timestamptz not null,
  birth_date timestamptz not null,
  document_type text not null,
  document_number text not null,
  document_photo_url text,
  companions_allowed numeric not null,
  companions_registered numeric not null,
  free_entry boolean not null,
  discount_percentage numeric,
  credit_amount numeric not null,
  qr_code text not null,
  status text not null,
  rejection_reason text,
  approved_by text,
  approved_at timestamptz,
  used_at timestamptz,
  name text,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.club_check_in_outs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  user_id uuid not null,
  entry_id uuid,
  check_in_at timestamptz not null,
  check_out_at timestamptz,
  created_at timestamptz not null
);

create table if not exists public.club_entries (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  user_id uuid not null,
  event_date timestamptz not null,
  variation_id uuid not null,
  variation_name text,
  quantity numeric not null,
  unit_price numeric not null,
  total_price numeric not null,
  credit_amount numeric not null,
  purchase_type text not null,
  qr_code text not null,
  status text not null,
  transaction_id uuid,
  used_at timestamptz,
  metadata jsonb,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.guest_list_entries (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  event_date timestamptz not null,
  user_id uuid not null,
  name text not null,
  party_size numeric not null,
  promoter_id uuid,
  status text not null,
  qr_code text not null,
  used_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.lineup_slots (
  id uuid primary key default gen_random_uuid(),
  lineup_id uuid not null,
  artist_name text not null,
  artist_type text not null,
  photo_url text,
  start_time text not null,
  end_time text not null,
  stage text,
  genre text,
  is_headliner boolean not null,
  display_order numeric not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.lineups (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  event_date timestamptz not null,
  event_name text,
  description text,
  cover_image_url text,
  is_active boolean not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.promoters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  restaurant_id uuid not null,
  name text not null,
  nickname text,
  phone text,
  email text,
  photo_url text,
  promoter_code text not null,
  commission_type text not null,
  commission_rate numeric not null,
  fixed_commission_amount numeric not null,
  tier numeric,
  status text not null,
  total_entries_sold numeric not null,
  total_tables_sold numeric not null,
  total_revenue_generated numeric not null,
  total_commission_earned numeric not null,
  pending_commission numeric not null,
  pix_key text,
  bank text,
  notes text,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.promoter_sales (
  id uuid primary key default gen_random_uuid(),
  promoter_id uuid not null,
  restaurant_id uuid not null,
  event_date timestamptz not null,
  sale_type text not null,
  reference_id text not null,
  customer_name text,
  customer_phone text,
  quantity numeric not null,
  sale_amount numeric not null,
  commission_amount numeric not null,
  commission_status text not null,
  paid_at timestamptz,
  payment_reference text,
  notes text,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.promoter_payments (
  id uuid primary key default gen_random_uuid(),
  promoter_id uuid not null,
  restaurant_id uuid not null,
  amount numeric not null,
  payment_method text not null,
  status text not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  sales_count numeric not null,
  sale_ids jsonb not null,
  payment_proof_url text,
  transaction_id text,
  processed_by uuid,
  processed_at timestamptz,
  notes text,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.queue_entries (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  user_id uuid not null,
  party_size numeric not null,
  priority_level_id uuid not null,
  priority_level_name text,
  position numeric not null,
  estimated_wait_minutes numeric not null,
  status text not null,
  called_at timestamptz,
  entered_at timestamptz,
  left_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.vip_table_guests (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null,
  user_id uuid,
  name text,
  email text,
  phone text,
  invite_token text not null,
  status text not null,
  entry_id uuid,
  credit_contribution numeric not null,
  invited_at timestamptz not null,
  responded_at timestamptz,
  checked_in_at timestamptz,
  updated_at timestamptz not null
);

create table if not exists public.vip_table_reservations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  table_type_id uuid not null,
  table_id uuid,
  host_user_id uuid not null,
  event_date timestamptz not null,
  party_size numeric not null,
  minimum_spend numeric not null,
  deposit_amount numeric not null,
  deposit_credit numeric not null,
  deposit_transaction_id uuid,
  status text not null,
  confirmation_deadline timestamptz,
  confirmed_at timestamptz,
  cancellation_reason text,
  cancelled_at timestamptz,
  invite_token text,
  special_requests text,
  metadata jsonb,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.vip_table_tab_items (
  id uuid primary key default gen_random_uuid(),
  table_tab_id uuid not null,
  menu_item_id uuid not null,
  ordered_by_user_id uuid not null,
  quantity numeric not null,
  unit_price numeric not null,
  total_price numeric not null,
  status text not null,
  special_instructions text,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.vip_table_tabs (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null,
  status text not null,
  deposit_credit numeric not null,
  entry_credits_total numeric not null,
  subtotal numeric not null,
  total_amount numeric not null,
  amount_paid numeric not null,
  minimum_spend_progress numeric not null,
  created_at timestamptz not null,
  closed_at timestamptz,
  updated_at timestamptz not null
);

create table if not exists public.ingredient_prices (
  id uuid primary key default gen_random_uuid(),
  ingredient_id uuid not null,
  price_per_unit numeric not null,
  supplier text,
  effective_date timestamptz not null,
  created_at timestamptz not null
);

create table if not exists public.ingredient_suppliers (
  id uuid primary key default gen_random_uuid(),
  ingredient_id uuid not null,
  supplier_id uuid not null,
  is_preferred boolean not null,
  last_price numeric,
  notes text,
  created_at timestamptz not null
);

create table if not exists public.ingredients (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  name text not null,
  unit text not null,
  category text,
  is_active boolean not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null,
  ingredient_id uuid not null,
  quantity numeric not null
);

create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  menu_item_id uuid not null,
  restaurant_id uuid not null,
  calculated_cost numeric,
  calculated_margin_pct numeric,
  last_calculated_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  name text not null,
  cnpj text,
  contact_name text,
  phone text,
  email text,
  address text,
  notes text,
  is_active boolean not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.customer_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  restaurant_id uuid not null,
  total_visits numeric not null,
  total_spent numeric not null,
  avg_ticket numeric not null,
  last_visit_at timestamptz,
  favorite_items text not null,
  dietary_preferences text not null,
  segment text not null,
  birthday timestamptz,
  notes text,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  restaurant_id uuid not null,
  notes text,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.financial_transactions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  type text not null,
  category text not null,
  amount numeric not null,
  description text,
  reference_id uuid,
  reference_type text,
  metadata jsonb,
  transaction_date timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.fiscal_configs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  cnpj text not null,
  ie text,
  razao_social text not null,
  nome_fantasia text,
  state_code text not null,
  endereco jsonb not null,
  regime_tributario text not null,
  tax_defaults jsonb not null,
  csc_id uuid,
  csc_token text,
  current_series numeric not null,
  next_number numeric not null,
  fiscal_provider text not null,
  focus_nfe_token text,
  certificate_uploaded boolean not null,
  certificate_base64 text,
  certificate_password text,
  auto_emit boolean not null,
  is_active boolean not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.fiscal_documents (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  order_id uuid not null,
  type text not null,
  status text not null,
  provider text not null,
  access_key text,
  number numeric,
  series numeric,
  xml text,
  qr_code_url text,
  danfe_url text,
  protocol text,
  total_amount numeric not null,
  items_snapshot text,
  external_ref text,
  error_message text,
  created_at timestamptz not null
);

create table if not exists public.fraud_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  alert_type text not null,
  severity text not null,
  details jsonb not null,
  status text not null,
  resolved_by text,
  resolved_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.user_sanctions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  sanction_type text not null,
  reason text not null,
  evidence jsonb not null,
  notice_sent_at timestamptz,
  defense_deadline timestamptz,
  defense_submitted boolean not null,
  defense_text text,
  reviewed_by text,
  reviewed_at timestamptz,
  active boolean not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.attendances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  restaurant_id uuid not null,
  date timestamptz not null,
  check_in text,
  check_out text,
  hours_worked numeric not null,
  status text not null,
  notes text,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  restaurant_id uuid not null,
  leave_type text not null,
  start_date timestamptz not null,
  end_date timestamptz not null,
  status text not null,
  reason text,
  rejection_reason text,
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.shifts (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null,
  restaurant_id uuid not null,
  date timestamptz not null,
  start_time text not null,
  end_time text not null,
  role text,
  status text not null,
  actual_start_time text,
  actual_end_time text,
  break_minutes numeric,
  notes text,
  is_overtime boolean not null,
  hourly_rate numeric,
  total_pay numeric,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  email text,
  action text not null,
  entity_type text,
  entity_id uuid,
  ip_address text,
  user_agent text,
  success boolean not null,
  failure_reason text,
  metadata jsonb,
  created_at timestamptz not null
);

create table if not exists public.password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  token text not null,
  expires_at timestamptz not null,
  is_used boolean not null,
  used_at timestamptz,
  ip_address text,
  user_agent text,
  created_at timestamptz not null
);

create table if not exists public.token_blacklist (
  id uuid primary key default gen_random_uuid(),
  token_jti text not null,
  user_id uuid not null,
  token_type text not null,
  expires_at timestamptz not null,
  revoked_reason text,
  revoked_ip text,
  created_at timestamptz not null
);

create table if not exists public.user_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  consent_type text not null,
  version text not null,
  version_hash text,
  ip_address text not null,
  device_id uuid,
  user_agent text,
  accepted_at timestamptz not null,
  revoked_at timestamptz,
  metadata jsonb
);

create table if not exists public.user_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  password_hash text not null,
  failed_login_attempts numeric not null,
  locked_until text,
  last_login_at timestamptz,
  last_login_ip text,
  password_changed_at timestamptz,
  password_history text,
  mfa_enabled boolean not null,
  mfa_secret text,
  mfa_backup_codes text,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz not null
);

create table if not exists public.security_incidents (
  id uuid primary key default gen_random_uuid(),
  incident_type text not null,
  severity text not null,
  title text not null,
  description text not null,
  affected_users_count numeric not null,
  affected_data_types text not null,
  status text not null,
  detected_at timestamptz not null,
  contained_at timestamptz,
  resolved_at timestamptz,
  response_deadline timestamptz not null,
  anpd_notified boolean not null,
  anpd_notified_at timestamptz,
  users_notified boolean not null,
  users_notified_at timestamptz,
  root_cause text,
  remediation_steps text,
  reported_by text not null,
  assigned_to text,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.external_menu_mappings (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  platform text not null,
  external_item_id uuid not null,
  external_item_name text not null,
  internal_menu_item_id uuid not null,
  is_active boolean not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.platform_connections (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  platform text not null,
  credentials jsonb,
  webhook_secret text,
  is_active boolean not null,
  auto_accept boolean not null,
  max_concurrent_orders numeric not null,
  high_load_threshold numeric not null,
  last_sync_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  name text not null,
  category text not null,
  current_level numeric not null,
  unit text not null,
  min_level numeric not null,
  max_level numeric,
  unit_cost numeric,
  supplier text,
  is_active boolean not null,
  notes text,
  last_restocked_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.cook_stations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  name text not null,
  type text not null,
  emoji text,
  late_threshold_minutes numeric not null,
  display_order numeric not null,
  is_active boolean not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.fire_schedules (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null,
  order_item_id uuid not null,
  station_id uuid not null,
  course text,
  fire_at timestamptz,
  expected_ready_at timestamptz,
  actual_ready_at timestamptz,
  fired boolean not null,
  fire_mode text not null,
  created_at timestamptz not null
);

create table if not exists public.kds_brain_configs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  course_gap_mode text not null,
  course_gap_minutes numeric not null,
  delivery_buffer_minutes numeric not null,
  auto_accept_delivery boolean not null,
  sound_enabled boolean not null,
  sound_volume numeric not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.prep_analytics (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  station_id uuid not null,
  menu_item_id uuid not null,
  order_item_id uuid not null,
  expected_prep_minutes numeric not null,
  actual_prep_minutes numeric,
  was_late boolean not null,
  shift text,
  source text,
  day_of_week text,
  recorded_at timestamptz not null
);

create table if not exists public.prep_time_suggestions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  menu_item_id uuid not null,
  station_id uuid,
  menu_item_name text not null,
  current_prep_minutes numeric not null,
  suggested_prep_minutes numeric not null,
  sample_size numeric not null,
  confidence_score numeric not null,
  status text not null,
  decided_at timestamptz,
  decided_by text,
  created_at timestamptz not null
);

create table if not exists public.loyalty_configs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  cashback_enabled boolean not null,
  cashback_percentage numeric not null,
  points_enabled boolean not null,
  points_per_real numeric not null,
  points_redemption_rate numeric not null,
  min_points_for_redemption numeric not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.loyalty_programs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  restaurant_id uuid not null,
  points numeric not null,
  total_visits numeric not null,
  total_spent numeric not null,
  tier text not null,
  last_visit timestamptz,
  rewards_claimed jsonb,
  available_rewards jsonb,
  awarded_order_ids text not null,
  is_active boolean not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.stamp_cards (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  user_id uuid not null,
  service_type text not null,
  current_stamps numeric not null,
  required_stamps numeric not null,
  reward_description text not null,
  completed_cycles numeric not null,
  completed boolean not null,
  completed_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.menu_item_customization_groups (
  id uuid primary key default gen_random_uuid(),
  menu_item_id uuid not null,
  name text not null,
  min_select numeric not null,
  max_select numeric not null,
  is_required boolean not null,
  sort_order numeric not null,
  options text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.order_guests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null,
  guest_user_id uuid,
  guest_name text,
  is_host boolean not null,
  status text not null,
  amount_due numeric not null,
  amount_paid numeric not null,
  payment_completed boolean not null,
  payment_completed_at timestamptz,
  joined_at timestamptz not null,
  left_at timestamptz,
  updated_at timestamptz not null
);

create table if not exists public.gateway_configs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  provider text not null,
  credentials jsonb,
  is_active boolean not null,
  settings jsonb,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.gateway_transactions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  order_id uuid,
  provider text not null,
  external_id uuid,
  payment_method text not null,
  amount_cents numeric not null,
  status text not null,
  idempotency_key text not null,
  correlation_id uuid,
  metadata jsonb,
  error_code text,
  error_message text,
  refunded_amount_cents numeric not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  method_type text not null,
  card_last_four text,
  card_brand text,
  card_exp_month text,
  card_exp_year text,
  pix_key text,
  external_payment_method_id uuid,
  is_default boolean not null,
  is_active boolean not null,
  metadata jsonb,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.payment_splits (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null,
  guest_user_id uuid not null,
  split_mode text not null,
  amount_due numeric not null,
  amount_paid numeric not null,
  status text not null,
  payment_id uuid,
  payment_transaction_id uuid,
  selected_items text,
  custom_amount numeric,
  service_charge numeric not null,
  tip_amount numeric not null,
  notes text,
  created_at timestamptz not null,
  paid_at timestamptz,
  updated_at timestamptz not null
);

create table if not exists public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null,
  transaction_type text not null,
  amount numeric not null,
  balance_before numeric not null,
  balance_after numeric not null,
  description text,
  order_id uuid,
  payment_method_id uuid,
  external_transaction_id uuid,
  metadata jsonb,
  idempotency_key text,
  created_at timestamptz not null
);

create table if not exists public.wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  restaurant_id uuid,
  wallet_type text not null,
  balance numeric not null,
  max_balance numeric not null,
  daily_limit numeric not null,
  monthly_limit numeric not null,
  is_active boolean not null,
  metadata jsonb,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.promotions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  code text not null,
  title text not null,
  description text,
  type text not null,
  status text not null,
  discount_value numeric,
  free_item_id uuid,
  min_order_value numeric,
  max_uses numeric,
  current_uses numeric not null,
  max_uses_per_user numeric not null,
  valid_from timestamptz not null,
  valid_until timestamptz not null,
  days_of_week numeric,
  hours_from text,
  hours_until text,
  applicable_categories text,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.purchase_records (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  supplier_name text not null,
  invoice_number text,
  invoice_date timestamptz not null,
  total_amount numeric not null,
  items jsonb not null,
  import_method text not null,
  status text not null,
  created_at timestamptz not null,
  created_by text
);

create table if not exists public.supplier_item_mappings (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  supplier_cnpj text not null,
  external_item_description text not null,
  external_ncm text,
  ingredient_id uuid not null,
  conversion_factor numeric,
  created_at timestamptz not null
);

create table if not exists public.receipts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null,
  payment_id uuid,
  user_id uuid not null,
  restaurant_id uuid not null,
  table_id uuid,
  items_snapshot text not null,
  subtotal numeric not null,
  service_fee numeric not null,
  tip numeric not null,
  total numeric not null,
  payment_method text not null,
  generated_at timestamptz not null,
  created_at timestamptz not null
);

create table if not exists public.drink_recipes (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid,
  name text not null,
  category text not null,
  description text,
  difficulty text not null,
  preparation_time_minutes numeric not null,
  glass_type text not null,
  garnish text,
  base_spirit text,
  serving_temp text not null,
  ingredients text not null,
  estimated_cost numeric,
  margin_percentage numeric,
  steps text not null,
  tags text,
  price numeric not null,
  image_url text,
  is_active boolean not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.delivery_settlements (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  platform text not null,
  settlement_date timestamptz not null,
  gross_amount numeric not null,
  commission_amount numeric not null,
  expected_net numeric not null,
  actual_received numeric,
  difference numeric,
  status text not null,
  order_count numeric not null,
  created_at timestamptz not null
);

create table if not exists public.reservation_guests (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null,
  guest_user_id uuid,
  guest_name text,
  guest_phone text,
  guest_email text,
  status text not null,
  is_host boolean not null,
  invited_by text,
  invite_method text,
  invite_token text,
  invited_at timestamptz not null,
  responded_at timestamptz,
  has_arrived boolean not null,
  arrived_at timestamptz,
  requires_host_approval boolean not null,
  updated_at timestamptz not null
);

create table if not exists public.restaurant_service_configs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  service_type text not null,
  is_active boolean not null,
  sommelier_available boolean,
  dress_code text,
  reservation_required boolean,
  average_meal_duration numeric,
  skip_the_line_enabled boolean,
  pickup_zones text,
  avg_preparation_time numeric,
  build_your_own_enabled boolean,
  customization_options jsonb,
  work_friendly boolean,
  wifi_available boolean,
  power_outlets_available boolean,
  noise_level text,
  price_per_kg numeric,
  fixed_price numeric,
  payment_mode text,
  smart_scales_enabled boolean,
  drive_thru_lanes numeric,
  geofencing_enabled boolean,
  geofencing_radius numeric,
  license_plate_recognition boolean,
  current_location jsonb,
  schedule jsonb,
  offline_mode_enabled boolean,
  seats_available numeric,
  experience_duration numeric,
  pre_booking_required boolean,
  tasting_menu_only boolean,
  reservations_optional boolean,
  reservation_grace_period numeric,
  waitlist_enabled boolean,
  waitlist_advance_drinks boolean,
  estimated_wait_display boolean,
  table_service boolean,
  order_at_table boolean,
  call_waiter_button boolean,
  partial_order_enabled boolean,
  group_friendly boolean,
  max_group_size numeric,
  group_reservation_required numeric,
  suggested_tip_percentage numeric,
  service_charge_included boolean,
  split_bill_promoted boolean,
  table_turnover_target numeric,
  special_instructions text,
  experience_highlights text,
  config_metadata jsonb,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  restaurant_id uuid not null,
  order_id uuid,
  rating numeric not null,
  food_rating numeric,
  service_rating numeric,
  ambiance_rating numeric,
  value_rating numeric,
  comment text,
  images text,
  sentiment text,
  sentiment_analysis jsonb,
  is_verified boolean not null,
  is_visible boolean not null,
  helpful_count numeric not null,
  owner_response text,
  owner_responded_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz not null
);

create table if not exists public.restaurant_configs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  profile text,
  service_types text,
  experience_flags text,
  floor_layout text,
  kitchen_stations text,
  payment_config text,
  enabled_features text,
  team_config text,
  setup_complete boolean not null,
  setup_completed_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

-- Correção manual: inventário fundiu sessão de contagem e linhas — duas tabelas (sem FK aqui, ver cabeçalho).
create table if not exists public.inventory_counts (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  status text not null default 'in_progress',
  started_by uuid not null,
  completed_by uuid,
  started_at timestamptz not null,
  completed_at timestamptz,
  total_deviation_value numeric,
  notes text
);

create table if not exists public.inventory_count_items (
  id uuid primary key default gen_random_uuid(),
  count_id uuid not null,
  stock_item_id uuid not null,
  ingredient_id uuid not null,
  ingredient_name text not null,
  unit text not null,
  system_quantity numeric not null,
  counted_quantity numeric,
  deviation numeric,
  deviation_value numeric,
  is_counted boolean not null
);

create table if not exists public.stock_items (
  id uuid primary key default gen_random_uuid(),
  ingredient_id uuid not null,
  restaurant_id uuid not null,
  current_quantity numeric not null,
  unit text not null,
  min_quantity numeric,
  max_quantity numeric,
  last_purchase_price numeric,
  last_purchase_date timestamptz,
  updated_at timestamptz not null
);

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  stock_item_id uuid not null,
  restaurant_id uuid not null,
  ingredient_id uuid not null,
  type text not null,
  quantity numeric not null,
  quantity_before numeric not null,
  quantity_after numeric not null,
  unit_cost numeric,
  reference_id uuid,
  reference_type text,
  created_by text,
  notes text,
  created_at timestamptz not null
);

create table if not exists public.unit_conversions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid,
  ingredient_id uuid,
  from_unit text not null,
  to_unit text not null,
  factor numeric not null,
  created_at timestamptz not null
);

create table if not exists public.qr_scan_logs (
  id uuid primary key default gen_random_uuid(),
  qr_code_id uuid not null,
  restaurant_id uuid not null,
  table_id uuid not null,
  scanned_by text,
  device_info jsonb,
  ip_address text,
  scan_result text not null,
  session_id uuid,
  scanned_at timestamptz not null
);

create table if not exists public.tables (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  table_number text not null,
  seats numeric not null,
  status text not null,
  section text,
  assigned_waiter_id uuid,
  position_x numeric,
  position_y numeric,
  qr_code text,
  shape text not null,
  width numeric not null,
  height numeric not null,
  occupied_since timestamptz,
  notes text,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.table_qr_codes (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  table_id uuid not null,
  qr_code_data text not null,
  qr_code_image text,
  signature text not null,
  style text not null,
  color_primary text not null,
  color_secondary text,
  logo_included boolean not null,
  version numeric not null,
  is_active boolean not null,
  expires_at timestamptz,
  generated_by text,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.table_sessions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  table_id uuid not null,
  qr_code_id uuid,
  customer_id uuid,
  primary_user_id uuid,
  guest_user_ids text not null,
  guest_name text,
  guest_count numeric not null,
  status text not null,
  started_at timestamptz not null,
  last_activity timestamptz not null,
  ended_at timestamptz,
  total_orders numeric not null,
  total_spent numeric not null,
  total_amount numeric,
  notes text,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.happy_hour_schedules (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  name text not null,
  description text,
  days text not null,
  start_time text not null,
  end_time text not null,
  discount_type text not null,
  discount_value numeric not null,
  applies_to text not null,
  category_ids text,
  item_ids text,
  is_active boolean not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.tab_items (
  id uuid primary key default gen_random_uuid(),
  tab_id uuid not null,
  menu_item_id uuid not null,
  ordered_by_user_id uuid not null,
  quantity numeric not null,
  unit_price numeric not null,
  discount_amount numeric not null,
  discount_reason text,
  total_price numeric not null,
  status text not null,
  customizations jsonb,
  special_instructions text,
  is_round_repeat boolean not null,
  prepared_by text,
  prepared_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.tab_members (
  id uuid primary key default gen_random_uuid(),
  tab_id uuid not null,
  user_id uuid not null,
  role text not null,
  status text not null,
  amount_consumed numeric not null,
  amount_paid numeric not null,
  credit_contribution numeric not null,
  joined_at timestamptz not null,
  left_at timestamptz,
  updated_at timestamptz not null
);

create table if not exists public.tab_payments (
  id uuid primary key default gen_random_uuid(),
  tab_id uuid not null,
  user_id uuid not null,
  amount numeric not null,
  tip_amount numeric not null,
  payment_method text not null,
  transaction_id uuid,
  status text not null,
  payment_details jsonb,
  idempotency_key text,
  created_at timestamptz not null
);

create table if not exists public.tabs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  table_id uuid,
  host_user_id uuid not null,
  status text not null,
  type text not null,
  preauth_transaction_id uuid,
  preauth_amount numeric,
  cover_charge_credit numeric not null,
  deposit_credit numeric not null,
  subtotal numeric not null,
  discount_amount numeric not null,
  tip_amount numeric not null,
  total_amount numeric not null,
  amount_paid numeric not null,
  invite_token text,
  metadata jsonb,
  created_at timestamptz not null,
  closed_at timestamptz,
  updated_at timestamptz not null
);

create table if not exists public.waiter_calls (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  table_id uuid,
  user_id uuid not null,
  tab_id uuid,
  reason text not null,
  notes text,
  status text not null,
  acknowledged_by text,
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null
);

create table if not exists public.tips (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null,
  restaurant_id uuid not null,
  staff_id uuid,
  order_id uuid,
  amount numeric not null,
  tip_type text not null,
  status text not null,
  distributed_at timestamptz,
  distribution_details jsonb,
  message text,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null,
  event_type text not null,
  payload jsonb not null,
  status text not null,
  response_code numeric,
  response_body text,
  retry_count numeric not null,
  max_retries numeric not null,
  next_retry_at timestamptz,
  delivered_at timestamptz,
  error_message text,
  created_at timestamptz not null
);

create table if not exists public.webhook_subscriptions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  url text not null,
  events text not null,
  secret text,
  is_active boolean not null,
  description text,
  failure_count numeric not null,
  last_triggered_at timestamptz,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  headers jsonb,
  created_at timestamptz not null,
  updated_at timestamptz not null
);


-- ═══════════════════════════════════════════════════════════════════════════════
-- FILE: 20260430180100_orders_order_items_expand.sql
-- ═══════════════════════════════════════════════════════════════════════════════

-- Expandir pedidos para campos esperados pela API mobile / modelo legado sem Nest.
-- Mantém customer_id (bootstrap); expõe user_id como coluna gerada equivalente.

-- ─── Novos valores nos enums já criados no bootstrap ─────────────────────────
-- Requer Postgres ≥15 para ADD VALUE IF NOT EXISTS (Supabase padrão).

alter type public.orders_status_enum add value if not exists 'delivering';
alter type public.orders_status_enum add value if not exists 'open_for_additions';
alter type public.orders_order_type_enum add value if not exists 'tab';
alter type public.orders_order_type_enum add value if not exists 'table_tab';

-- ─── orders — colunas adicionais ────────────────────────────────────────────

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'orders' and column_name = 'user_id'
  ) then
    alter table public.orders
      add column user_id uuid generated always as (customer_id) stored;
  end if;
end $$;

alter table public.orders add column if not exists waiter_id uuid;
alter table public.orders add column if not exists party_size integer not null default 1;

alter table public.orders add column if not exists subtotal numeric(10, 2);
alter table public.orders add column if not exists tax_amount numeric(10, 2) not null default 0;
alter table public.orders add column if not exists tip_amount numeric(10, 2) not null default 0;
alter table public.orders add column if not exists discount_amount numeric(10, 2) not null default 0;
alter table public.orders add column if not exists total_amount numeric(10, 2);

alter table public.orders add column if not exists special_instructions text;
alter table public.orders add column if not exists delivery_phone text;

-- Snapshot texto do endereço (bootstrap já usa delivery_address jsonb)
alter table public.orders add column if not exists delivery_address_text text;

alter table public.orders add column if not exists estimated_ready_at timestamptz;
alter table public.orders add column if not exists actual_ready_at timestamptz;
alter table public.orders add column if not exists completed_at timestamptz;

alter table public.orders add column if not exists is_shared boolean not null default false;
alter table public.orders add column if not exists payment_split_mode text;

alter table public.orders add column if not exists source varchar(20) not null default 'noowe';
alter table public.orders add column if not exists source_order_id varchar(255);
alter table public.orders add column if not exists delivery_rider_eta timestamptz;

comment on column public.orders.user_id is 'Espelho de customer_id para compatibilidade com APIs que usam user_id.';
comment on column public.orders.delivery_address_text is 'Endereço em texto livre; delivery_address (jsonb) permanece para estrutura completa.';

-- ─── order_items — colunas adicionais ───────────────────────────────────────

alter table public.order_items add column if not exists ordered_by uuid;
alter table public.order_items add column if not exists ordered_by_name varchar(100);
alter table public.order_items add column if not exists prepared_by uuid;
alter table public.order_items add column if not exists prepared_at timestamptz;
alter table public.order_items add column if not exists station_id uuid;
alter table public.order_items add column if not exists fire_at timestamptz;
alter table public.order_items add column if not exists expected_ready_at timestamptz;
alter table public.order_items add column if not exists course varchar(20);

create index if not exists idx_orders_waiter_id on public.orders(waiter_id);
create index if not exists idx_order_items_ordered_by on public.order_items(ordered_by);
create index if not exists idx_order_items_station_id on public.order_items(station_id);
