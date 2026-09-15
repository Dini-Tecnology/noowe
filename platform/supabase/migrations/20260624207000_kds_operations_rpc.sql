-- KDS Operations RPCs
-- Covers: update individual item status, fire course, get cook stations, KDS config

alter table public.cook_stations
  add column if not exists station_type text,
  add column if not exists display_color text,
  add column if not exists printer_ip text,
  add column if not exists display_name text;

update public.cook_stations
set
  station_type = coalesce(station_type, type),
  display_color = coalesce(display_color, emoji),
  display_name = coalesce(display_name, name)
where station_type is null
   or display_color is null
   or display_name is null;

alter table public.cook_stations
  alter column station_type set default 'kitchen';

alter table public.kds_brain_configs
  alter column course_gap_mode set default 'time',
  alter column course_gap_minutes set default 5,
  alter column delivery_buffer_minutes set default 10,
  alter column auto_accept_delivery set default false,
  alter column sound_enabled set default true,
  alter column sound_volume set default 0.8;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'uq_kds_brain_configs_restaurant'
      and conrelid = 'public.kds_brain_configs'::regclass
  ) then
    alter table public.kds_brain_configs
      add constraint uq_kds_brain_configs_restaurant
      unique (restaurant_id);
  end if;
end
$$;

-- ─── update order item status ─────────────────────────────────────────────────
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
  v_item    record;
  v_order   record;
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
    array['owner','manager','chef','barman']::public.user_roles_role_enum[]
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

  -- if all non-cancelled items are ready → auto-advance order to 'ready'
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

-- ─── fire course ──────────────────────────────────────────────────────────────
-- Sets fire_at for all items of a given course in an order to trigger KDS display
create or replace function public.restaurant_fire_course(
  p_order_id uuid,
  p_course   text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_order record;
  v_count integer;
begin
  select * into v_order from public.orders where id = p_order_id;
  if v_order.id is null then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  perform private.require_restaurant_role(
    v_order.restaurant_id,
    array['owner','manager','chef','maitre','waiter']::public.user_roles_role_enum[]
  );

  update public.order_items
  set fire_at = now(), updated_at = now()
  where order_id = p_order_id
    and course = p_course
    and status = 'pending'
    and fire_at is null;

  get diagnostics v_count = row_count;

  return jsonb_build_object(
    'order_id', p_order_id,
    'course', p_course,
    'items_fired', v_count,
    'fired_at', now()
  );
end;
$$;

-- ─── get cook stations ────────────────────────────────────────────────────────
create or replace function public.restaurant_get_cook_stations(
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
  perform private.require_restaurant_role(p_restaurant_id);

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', cs.id,
      'name', cs.name,
      'station_type', cs.station_type,
      'display_color', cs.display_color,
      'is_active', cs.is_active,
      'printer_ip', cs.printer_ip,
      'display_name', cs.display_name
    ) order by cs.name
  ), '[]'::jsonb)
  into result
  from public.cook_stations cs
  where cs.restaurant_id = p_restaurant_id
    and cs.is_active = true;

  return result;
end;
$$;

-- ─── get/upsert KDS brain config ─────────────────────────────────────────────
create or replace function public.restaurant_get_kds_config(
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
  perform private.require_restaurant_role(p_restaurant_id);

  select to_jsonb(k)
  into result
  from public.kds_brain_configs k
  where k.restaurant_id = p_restaurant_id
  limit 1;

  return coalesce(result, jsonb_build_object(
    'restaurant_id', p_restaurant_id,
    'course_gap_mode', 'time',
    'auto_accept_delivery', false
  ));
end;
$$;

create or replace function public.restaurant_update_kds_config(
  p_restaurant_id uuid,
  p_config jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_result record;
begin
  perform private.require_restaurant_role(
    p_restaurant_id,
    array['owner','manager','chef']::public.user_roles_role_enum[]
  );

  insert into public.kds_brain_configs(restaurant_id, created_at, updated_at)
  values(p_restaurant_id, now(), now())
  on conflict (restaurant_id) do nothing;

  update public.kds_brain_configs
  set
    course_gap_mode       = coalesce((p_config->>'course_gap_mode'), course_gap_mode),
    auto_accept_delivery  = coalesce((p_config->>'auto_accept_delivery')::boolean, auto_accept_delivery),
    updated_at            = now()
  where restaurant_id = p_restaurant_id
  returning * into v_result;

  return to_jsonb(v_result);
end;
$$;

-- ─── barman KDS queue (drinks only) ──────────────────────────────────────────
create or replace function public.restaurant_get_bar_queue(
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
    array['owner','manager','barman','chef']::public.user_roles_role_enum[]
  );

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', oi.id,
      'order_id', o.id,
      'table_number', t.table_number,
      'customer_name', p.full_name,
      'name', coalesce(mi.name, 'Item'),
      'quantity', oi.quantity,
      'status', oi.status,
      'course', coalesce(oi.course, mi.course),
      'special_instructions', oi.special_instructions,
      'fire_at', oi.fire_at,
      'order_created_at', o.created_at,
      'created_at', oi.created_at
    ) order by coalesce(oi.fire_at, o.created_at) asc
  ), '[]'::jsonb)
  into result
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  left join public.menu_items mi on mi.id = oi.menu_item_id
  left join public.tables t on t.id = o.table_id
  left join public.profiles p on p.id = o.customer_id
  where o.restaurant_id = p_restaurant_id
    and o.status::text in ('confirmed','preparing','open_for_additions')
    and oi.status::text in ('pending','preparing')
    and (
      coalesce(oi.course, mi.course) = 'drink'
      or exists (
        select 1 from public.cook_stations cs
        where cs.id = coalesce(oi.station_id, mi.station_id)
          and cs.station_type in ('bar','drinks')
      )
    );

  return result;
end;
$$;

revoke all on function public.restaurant_update_order_item_status(uuid, text) from public;
revoke all on function public.restaurant_fire_course(uuid, text) from public;
revoke all on function public.restaurant_get_cook_stations(uuid) from public;
revoke all on function public.restaurant_get_kds_config(uuid) from public;
revoke all on function public.restaurant_update_kds_config(uuid, jsonb) from public;
revoke all on function public.restaurant_get_bar_queue(uuid) from public;

grant execute on function public.restaurant_update_order_item_status(uuid, text) to authenticated, service_role;
grant execute on function public.restaurant_fire_course(uuid, text) to authenticated, service_role;
grant execute on function public.restaurant_get_cook_stations(uuid) to authenticated, service_role;
grant execute on function public.restaurant_get_kds_config(uuid) to authenticated, service_role;
grant execute on function public.restaurant_update_kds_config(uuid, jsonb) to authenticated, service_role;
grant execute on function public.restaurant_get_bar_queue(uuid) to authenticated, service_role;

alter table public.cook_stations enable row level security;
alter table public.kds_brain_configs enable row level security;

drop policy if exists "cook_stations_staff" on public.cook_stations;
create policy "cook_stations_staff" on public.cook_stations
  for all using (
    private.has_restaurant_role(restaurant_id, array['owner','manager','chef','barman']::public.user_roles_role_enum[])
  );

drop policy if exists "kds_brain_configs_staff" on public.kds_brain_configs;
create policy "kds_brain_configs_staff" on public.kds_brain_configs
  for all using (
    private.has_restaurant_role(restaurant_id, array['owner','manager','chef']::public.user_roles_role_enum[])
  );
