-- Stock / Inventory RPCs
-- Covers: list items, update level, restock, get low-stock alerts

create index if not exists idx_inventory_items_restaurant_active
  on public.inventory_items(restaurant_id, is_active, current_level);

-- ─── get stock list ───────────────────────────────────────────────────────────
create or replace function public.restaurant_get_stock(
  p_restaurant_id uuid,
  p_include_inactive boolean default false
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
    array['owner','manager','chef']::public.user_roles_role_enum[]
  );

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', i.id,
      'name', i.name,
      'category', i.category,
      'current_level', i.current_level,
      'unit', i.unit,
      'min_level', i.min_level,
      'max_level', i.max_level,
      'unit_cost', i.unit_cost,
      'supplier', i.supplier,
      'is_active', i.is_active,
      'notes', i.notes,
      'last_restocked_at', i.last_restocked_at,
      'status', case
        when i.current_level <= 0 then 'out'
        when i.current_level <= i.min_level then 'low'
        when i.max_level is not null and i.current_level >= i.max_level then 'full'
        else 'ok'
      end,
      'created_at', i.created_at,
      'updated_at', i.updated_at
    ) order by i.category, i.name
  ), '[]'::jsonb)
  into result
  from public.inventory_items i
  where i.restaurant_id = p_restaurant_id
    and (p_include_inactive or i.is_active = true);

  return result;
end;
$$;

-- ─── get low stock alerts ─────────────────────────────────────────────────────
create or replace function public.restaurant_get_low_stock_alerts(
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
    array['owner','manager','chef']::public.user_roles_role_enum[]
  );

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', i.id,
      'name', i.name,
      'category', i.category,
      'current_level', i.current_level,
      'min_level', i.min_level,
      'unit', i.unit,
      'status', case when i.current_level <= 0 then 'out' else 'low' end
    ) order by i.current_level asc
  ), '[]'::jsonb)
  into result
  from public.inventory_items i
  where i.restaurant_id = p_restaurant_id
    and i.is_active = true
    and i.current_level <= i.min_level;

  return result;
end;
$$;

-- ─── update stock level ───────────────────────────────────────────────────────
create or replace function public.restaurant_update_stock_level(
  p_item_id uuid,
  p_quantity_delta numeric,
  p_notes text default null
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
  select * into v_item from public.inventory_items where id = p_item_id;
  if v_item.id is null then
    raise exception 'Inventory item not found' using errcode = 'P0002';
  end if;

  perform private.require_restaurant_role(
    v_item.restaurant_id,
    array['owner','manager','chef']::public.user_roles_role_enum[]
  );

  update public.inventory_items
  set
    current_level = greatest(0, current_level + p_quantity_delta),
    notes = coalesce(p_notes, notes),
    last_restocked_at = case when p_quantity_delta > 0 then now() else last_restocked_at end,
    updated_at = now()
  where id = p_item_id
  returning * into v_updated;

  return to_jsonb(v_updated);
end;
$$;

-- ─── create inventory item ────────────────────────────────────────────────────
create or replace function public.restaurant_create_stock_item(
  p_restaurant_id uuid,
  p_name text,
  p_category text,
  p_unit text,
  p_current_level numeric default 0,
  p_min_level numeric default 0,
  p_max_level numeric default null,
  p_unit_cost numeric default null,
  p_supplier text default null,
  p_notes text default null
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
    array['owner','manager','chef']::public.user_roles_role_enum[]
  );

  insert into public.inventory_items(
    restaurant_id, name, category, unit, current_level, min_level, max_level,
    unit_cost, supplier, is_active, notes, created_at, updated_at
  )
  values(
    p_restaurant_id, p_name, p_category, p_unit, p_current_level, p_min_level, p_max_level,
    p_unit_cost, p_supplier, true, p_notes, now(), now()
  )
  returning * into v_item;

  return to_jsonb(v_item);
end;
$$;

revoke all on function public.restaurant_get_stock(uuid, boolean) from public;
revoke all on function public.restaurant_get_low_stock_alerts(uuid) from public;
revoke all on function public.restaurant_update_stock_level(uuid, numeric, text) from public;
revoke all on function public.restaurant_create_stock_item(uuid,text,text,text,numeric,numeric,numeric,numeric,text,text) from public;

grant execute on function public.restaurant_get_stock(uuid, boolean) to authenticated, service_role;
grant execute on function public.restaurant_get_low_stock_alerts(uuid) to authenticated, service_role;
grant execute on function public.restaurant_update_stock_level(uuid, numeric, text) to authenticated, service_role;
grant execute on function public.restaurant_create_stock_item(uuid,text,text,text,numeric,numeric,numeric,numeric,text,text) to authenticated, service_role;

alter table public.inventory_items enable row level security;

drop policy if exists "inventory_items_staff" on public.inventory_items;
create policy "inventory_items_staff" on public.inventory_items
  for all using (
    private.has_restaurant_role(restaurant_id, array['owner','manager','chef']::public.user_roles_role_enum[])
  );
