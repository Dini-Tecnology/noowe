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
