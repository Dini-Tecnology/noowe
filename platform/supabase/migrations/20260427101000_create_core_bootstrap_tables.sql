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
