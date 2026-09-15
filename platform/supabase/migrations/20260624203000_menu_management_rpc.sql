-- Menu Management RPCs
-- Covers: get menu with categories, create/update/delete items, reorder categories

alter table public.menu_categories
  add column if not exists image_url text,
  add column if not exists sort_order integer not null default 0;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'menu_categories'
      and column_name = 'display_order'
  ) then
    update public.menu_categories
    set sort_order = display_order::integer
    where sort_order = 0
      and display_order is not null;
  end if;
end
$$;

alter table public.menu_items
  add column if not exists original_price numeric(10, 2),
  add column if not exists is_featured boolean not null default false,
  add column if not exists sort_order integer not null default 0,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'menu_items'
      and column_name = 'display_order'
  ) then
    update public.menu_items
    set sort_order = display_order::integer
    where sort_order = 0
      and display_order is not null;
  end if;
end
$$;

create index if not exists idx_menu_categories_restaurant
  on public.menu_categories(restaurant_id, sort_order);

create index if not exists idx_menu_items_category_active
  on public.menu_items(category_id, is_available, sort_order);

-- ─── get full menu ────────────────────────────────────────────────────────────
create or replace function public.restaurant_get_menu(
  p_restaurant_id uuid,
  p_include_unavailable boolean default false
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
  perform private.require_restaurant_role(p_restaurant_id);

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', mc.id,
      'name', mc.name,
      'description', mc.description,
      'sort_order', mc.sort_order,
      'is_active', mc.is_active,
      'image_url', mc.image_url,
      'items', (
        select coalesce(jsonb_agg(
          jsonb_build_object(
            'id', mi.id,
            'name', mi.name,
            'description', mi.description,
            'price', mi.price,
            'original_price', mi.original_price,
            'image_url', mi.image_url,
            'is_available', mi.is_available,
            'is_featured', mi.is_featured,
            'allergens', mi.allergens,
            'dietary_info', mi.dietary_info,
            'preparation_time', mi.preparation_time,
            'course', mi.course,
            'station_id', mi.station_id,
            'sort_order', mi.sort_order,
            'calories', mi.calories,
            'metadata', mi.metadata,
            'created_at', mi.created_at,
            'updated_at', mi.updated_at
          ) order by mi.sort_order asc, mi.name asc
        ), '[]'::jsonb)
        from public.menu_items mi
        where mi.category_id = mc.id
          and (p_include_unavailable or mi.is_available = true)
      )
    ) order by mc.sort_order asc, mc.name asc
  ), '[]'::jsonb)
  into result
  from public.menu_categories mc
  where mc.restaurant_id = p_restaurant_id
    and (p_include_unavailable or mc.is_active = true);

  return result;
end;
$$;

-- ─── create menu item ─────────────────────────────────────────────────────────
create or replace function public.restaurant_create_menu_item(
  p_restaurant_id  uuid,
  p_category_id    uuid,
  p_name           text,
  p_description    text default null,
  p_price          numeric default 0,
  p_original_price numeric default null,
  p_image_url      text default null,
  p_is_available   boolean default true,
  p_is_featured    boolean default false,
  p_allergens      text[] default null,
  p_dietary_info   text[] default null,
  p_preparation_time integer default null,
  p_course         text default null,
  p_station_id     uuid default null,
  p_sort_order     integer default 0,
  p_calories       integer default null,
  p_metadata       jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_item record;
begin
  perform private.require_restaurant_role(
    p_restaurant_id,
    array['owner','manager']::public.user_roles_role_enum[]
  );

  -- verify category belongs to restaurant
  if not exists (
    select 1 from public.menu_categories
    where id = p_category_id and restaurant_id = p_restaurant_id
  ) then
    raise exception 'Category not found for this restaurant' using errcode = 'P0002';
  end if;

  insert into public.menu_items(
    restaurant_id, category_id, name, description, price, original_price,
    image_url, is_available, is_featured, allergens, dietary_info,
    preparation_time, course, station_id, sort_order, calories, metadata,
    created_at, updated_at
  )
  values(
    p_restaurant_id, p_category_id, p_name, p_description, p_price, p_original_price,
    p_image_url, p_is_available, p_is_featured, to_jsonb(p_allergens), to_jsonb(p_dietary_info),
    p_preparation_time, p_course, p_station_id, p_sort_order, p_calories, p_metadata,
    now(), now()
  )
  returning * into v_item;

  return to_jsonb(v_item);
end;
$$;

-- ─── update menu item ─────────────────────────────────────────────────────────
create or replace function public.restaurant_update_menu_item(
  p_item_id        uuid,
  p_name           text default null,
  p_description    text default null,
  p_price          numeric default null,
  p_original_price numeric default null,
  p_image_url      text default null,
  p_is_available   boolean default null,
  p_is_featured    boolean default null,
  p_allergens      text[] default null,
  p_dietary_info   text[] default null,
  p_preparation_time integer default null,
  p_course         text default null,
  p_station_id     uuid default null,
  p_sort_order     integer default null,
  p_calories       integer default null,
  p_category_id    uuid default null,
  p_metadata       jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_item record;
  v_updated record;
begin
  select * into v_item from public.menu_items where id = p_item_id;
  if v_item.id is null then
    raise exception 'Menu item not found' using errcode = 'P0002';
  end if;

  perform private.require_restaurant_role(
    v_item.restaurant_id,
    array['owner','manager']::public.user_roles_role_enum[]
  );

  update public.menu_items
  set
    name             = coalesce(p_name, name),
    description      = coalesce(p_description, description),
    price            = coalesce(p_price, price),
    original_price   = coalesce(p_original_price, original_price),
    image_url        = coalesce(p_image_url, image_url),
    is_available     = coalesce(p_is_available, is_available),
    is_featured      = coalesce(p_is_featured, is_featured),
    allergens        = coalesce(to_jsonb(p_allergens), allergens),
    dietary_info     = coalesce(to_jsonb(p_dietary_info), dietary_info),
    preparation_time = coalesce(p_preparation_time, preparation_time),
    course           = coalesce(p_course, course),
    station_id       = coalesce(p_station_id, station_id),
    sort_order       = coalesce(p_sort_order, sort_order),
    calories         = coalesce(p_calories, calories),
    category_id      = coalesce(p_category_id, category_id),
    metadata         = coalesce(p_metadata, metadata),
    updated_at       = now()
  where id = p_item_id
  returning * into v_updated;

  return to_jsonb(v_updated);
end;
$$;

-- ─── toggle item availability ─────────────────────────────────────────────────
create or replace function public.restaurant_toggle_menu_item(
  p_item_id uuid,
  p_is_available boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_item record;
  v_updated record;
begin
  select * into v_item from public.menu_items where id = p_item_id;
  if v_item.id is null then
    raise exception 'Menu item not found' using errcode = 'P0002';
  end if;

  perform private.require_restaurant_role(
    v_item.restaurant_id,
    array['owner','manager','chef']::public.user_roles_role_enum[]
  );

  update public.menu_items
  set is_available = p_is_available, updated_at = now()
  where id = p_item_id
  returning * into v_updated;

  return to_jsonb(v_updated);
end;
$$;

-- ─── delete (soft) menu item ──────────────────────────────────────────────────
create or replace function public.restaurant_delete_menu_item(
  p_item_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_item record;
begin
  select * into v_item from public.menu_items where id = p_item_id;
  if v_item.id is null then
    raise exception 'Menu item not found' using errcode = 'P0002';
  end if;

  perform private.require_restaurant_role(
    v_item.restaurant_id,
    array['owner','manager']::public.user_roles_role_enum[]
  );

  -- soft delete via is_available = false
  update public.menu_items
  set is_available = false, updated_at = now()
  where id = p_item_id;

  return jsonb_build_object('id', p_item_id, 'deleted', true);
end;
$$;

-- ─── create category ──────────────────────────────────────────────────────────
create or replace function public.restaurant_create_menu_category(
  p_restaurant_id uuid,
  p_name text,
  p_description text default null,
  p_image_url text default null,
  p_sort_order integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_cat record;
begin
  perform private.require_restaurant_role(
    p_restaurant_id,
    array['owner','manager']::public.user_roles_role_enum[]
  );

  insert into public.menu_categories(
    restaurant_id, name, description, image_url, sort_order, is_active, created_at, updated_at
  )
  values(
    p_restaurant_id, p_name, p_description, p_image_url, p_sort_order, true, now(), now()
  )
  returning * into v_cat;

  return to_jsonb(v_cat);
end;
$$;

-- ─── update category ──────────────────────────────────────────────────────────
create or replace function public.restaurant_update_menu_category(
  p_category_id uuid,
  p_name text default null,
  p_description text default null,
  p_image_url text default null,
  p_sort_order integer default null,
  p_is_active boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_cat record;
  v_updated record;
begin
  select * into v_cat from public.menu_categories where id = p_category_id;
  if v_cat.id is null then
    raise exception 'Category not found' using errcode = 'P0002';
  end if;

  perform private.require_restaurant_role(
    v_cat.restaurant_id,
    array['owner','manager']::public.user_roles_role_enum[]
  );

  update public.menu_categories
  set
    name        = coalesce(p_name, name),
    description = coalesce(p_description, description),
    image_url   = coalesce(p_image_url, image_url),
    sort_order  = coalesce(p_sort_order, sort_order),
    is_active   = coalesce(p_is_active, is_active),
    updated_at  = now()
  where id = p_category_id
  returning * into v_updated;

  return to_jsonb(v_updated);
end;
$$;

revoke all on function public.restaurant_get_menu(uuid, boolean) from public;
revoke all on function public.restaurant_create_menu_item(uuid,uuid,text,text,numeric,numeric,text,boolean,boolean,text[],text[],integer,text,uuid,integer,integer,jsonb) from public;
revoke all on function public.restaurant_update_menu_item(uuid,text,text,numeric,numeric,text,boolean,boolean,text[],text[],integer,text,uuid,integer,integer,uuid,jsonb) from public;
revoke all on function public.restaurant_toggle_menu_item(uuid, boolean) from public;
revoke all on function public.restaurant_delete_menu_item(uuid) from public;
revoke all on function public.restaurant_create_menu_category(uuid,text,text,text,integer) from public;
revoke all on function public.restaurant_update_menu_category(uuid,text,text,text,integer,boolean) from public;

grant execute on function public.restaurant_get_menu(uuid, boolean) to authenticated, service_role;
grant execute on function public.restaurant_create_menu_item(uuid,uuid,text,text,numeric,numeric,text,boolean,boolean,text[],text[],integer,text,uuid,integer,integer,jsonb) to authenticated, service_role;
grant execute on function public.restaurant_update_menu_item(uuid,text,text,numeric,numeric,text,boolean,boolean,text[],text[],integer,text,uuid,integer,integer,uuid,jsonb) to authenticated, service_role;
grant execute on function public.restaurant_toggle_menu_item(uuid, boolean) to authenticated, service_role;
grant execute on function public.restaurant_delete_menu_item(uuid) to authenticated, service_role;
grant execute on function public.restaurant_create_menu_category(uuid,text,text,text,integer) to authenticated, service_role;
grant execute on function public.restaurant_update_menu_category(uuid,text,text,text,integer,boolean) to authenticated, service_role;
