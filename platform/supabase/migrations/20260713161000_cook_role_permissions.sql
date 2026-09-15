-- Wire 'cook' into role helpers, KDS/kitchen RPCs, and barman stock access.
-- Depends on 20260713160000_add_cook_role_enum.sql (enum value committed).

-- ─── 1. Default staff roles (has / require) include cook ──────────────────────
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
  );
$$;

create or replace function private.require_restaurant_role(
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
returns void
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if not (
    private.has_any_app_role(array['admin'])
    or private.has_restaurant_role(target_restaurant_id, required_roles)
  ) then
    raise exception 'Restaurant access denied' using errcode = '42501';
  end if;
end;
$$;

-- ─── 2. Owners/managers can assign cook ───────────────────────────────────────
create or replace function private.can_manage_profile_role(
  target_role text,
  target_restaurant_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select
    private.has_any_app_role(array['admin'])
    or (
      target_restaurant_id is not null
      and target_role = any (array['manager', 'waiter', 'barman', 'chef', 'cook', 'maitre'])
      and private.has_restaurant_role(target_restaurant_id, array['owner']::public.user_roles_role_enum[])
    )
    or (
      target_restaurant_id is not null
      and target_role = any (array['waiter', 'barman', 'chef', 'cook', 'maitre'])
      and private.has_restaurant_role(target_restaurant_id, array['manager']::public.user_roles_role_enum[])
    );
$$;

create or replace function private.can_manage_user_role(
  target_role public.user_roles_role_enum,
  target_restaurant_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select
    private.has_any_app_role(array['admin'])
    or (
      target_restaurant_id is not null
      and target_role = any (
        array[
          'manager'::public.user_roles_role_enum,
          'waiter'::public.user_roles_role_enum,
          'barman'::public.user_roles_role_enum,
          'chef'::public.user_roles_role_enum,
          'cook'::public.user_roles_role_enum,
          'maitre'::public.user_roles_role_enum
        ]
      )
      and private.has_restaurant_role(target_restaurant_id, array['owner']::public.user_roles_role_enum[])
    )
    or (
      target_restaurant_id is not null
      and target_role = any (
        array[
          'waiter'::public.user_roles_role_enum,
          'barman'::public.user_roles_role_enum,
          'chef'::public.user_roles_role_enum,
          'cook'::public.user_roles_role_enum,
          'maitre'::public.user_roles_role_enum
        ]
      )
      and private.has_restaurant_role(target_restaurant_id, array['manager']::public.user_roles_role_enum[])
    );
$$;

-- ─── 3. Kitchen KDS / item status — cook can operate ──────────────────────────
create or replace function public.restaurant_update_order_item_status(
  p_item_id uuid,
  p_status  text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_item record;
  v_order record;
  v_updated record;
  v_all_ready boolean;
begin
  select * into v_item from public.order_items where id = p_item_id;
  if v_item.id is null then
    raise exception 'Order item not found' using errcode = 'P0002';
  end if;

  select * into v_order from public.orders where id = v_item.order_id;

  perform private.require_restaurant_role(
    v_order.restaurant_id,
    array['owner','manager','chef','cook','barman']::public.user_roles_role_enum[]
  );

  if p_status not in ('pending','preparing','ready','served','cancelled') then
    raise exception 'Invalid item status: %', p_status using errcode = '22023';
  end if;

  update public.order_items
  set
    status = p_status,
    prepared_at = case when p_status = 'ready' then coalesce(prepared_at, now()) else prepared_at end,
    updated_at = now()
  where id = p_item_id
  returning * into v_updated;

  if p_status = 'ready' then
    select bool_and(oi.status::text in ('ready','served','cancelled'))
    into v_all_ready
    from public.order_items oi
    where oi.order_id = v_item.order_id;

    if v_all_ready and v_order.status::text = 'preparing' then
      update public.orders
      set status = 'ready', actual_ready_at = now(), updated_at = now()
      where id = v_item.order_id;
    end if;
  end if;

  return to_jsonb(v_updated);
end;
$$;

create or replace function public.restaurant_get_kds_queue(
  p_restaurant_id uuid,
  p_station_id uuid default null
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
    array['owner', 'manager', 'chef', 'cook', 'barman']::public.user_roles_role_enum[]
  );

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', oi.id,
        'order_id', o.id,
        'restaurant_id', o.restaurant_id,
        'table_id', o.table_id,
        'table_number', t.table_number,
        'customer_name', p.full_name,
        'menu_item_id', oi.menu_item_id,
        'name', coalesce(mi.name, 'Item'),
        'quantity', oi.quantity,
        'status', oi.status,
        'order_status', o.status,
        'station_id', coalesce(oi.station_id, mi.station_id),
        'course', coalesce(oi.course, mi.course),
        'special_instructions', oi.special_instructions,
        'customizations', oi.customizations,
        'fire_at', oi.fire_at,
        'expected_ready_at', oi.expected_ready_at,
        'created_at', oi.created_at,
        'order_created_at', o.created_at
      )
      order by coalesce(oi.fire_at, o.created_at) asc, oi.created_at asc
    ),
    '[]'::jsonb
  )
  into result
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  left join public.menu_items mi on mi.id = oi.menu_item_id
  left join public.tables t on t.id = o.table_id
  left join public.profiles p on p.id = o.customer_id
  where o.restaurant_id = p_restaurant_id
    and o.status::text in ('confirmed', 'preparing', 'open_for_additions')
    and oi.status::text in ('pending', 'preparing')
    and (p_station_id is null or coalesce(oi.station_id, mi.station_id) = p_station_id);

  return result;
end;
$$;

-- ─── 4. Stock — barman can view inventory (Chef Controlo + Bar Controlo) ───────
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
    array['owner','manager','chef','barman']::public.user_roles_role_enum[]
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
    array['owner','manager','chef','barman']::public.user_roles_role_enum[]
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

-- ─── 5. RLS policies ──────────────────────────────────────────────────────────
drop policy if exists "cook_stations_staff" on public.cook_stations;
create policy "cook_stations_staff" on public.cook_stations
  for all using (
    private.has_restaurant_role(
      restaurant_id,
      array['owner','manager','chef','cook','barman']::public.user_roles_role_enum[]
    )
  );

drop policy if exists "inventory_items_staff" on public.inventory_items;
create policy "inventory_items_staff" on public.inventory_items
  for all using (
    private.has_restaurant_role(
      restaurant_id,
      array['owner','manager','chef','barman']::public.user_roles_role_enum[]
    )
  );

comment on function private.can_manage_user_role(public.user_roles_role_enum, uuid) is
  'Restricts user_roles mutations: admins all; owners manager+staff (incl. cook); managers staff only (incl. cook).';
