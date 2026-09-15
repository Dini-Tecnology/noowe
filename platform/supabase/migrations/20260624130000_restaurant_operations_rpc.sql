-- Supabase-first restaurant operations contracts.
-- Replaces the first slice of legacy REST backend behavior with Postgres RPCs.

create extension if not exists "pgcrypto" with schema extensions;

-- Generated parity tables were intentionally broad. Tighten defaults required by
-- mobile operational flows without changing existing data.
alter table public.tables alter column status set default 'available';
alter table public.tables alter column shape set default 'square';
alter table public.tables alter column width set default 72;
alter table public.tables alter column height set default 72;
alter table public.tables alter column created_at set default now();
alter table public.tables alter column updated_at set default now();

alter table public.table_sessions alter column guest_user_ids set default '[]';
alter table public.table_sessions alter column guest_count set default 1;
alter table public.table_sessions alter column status set default 'active';
alter table public.table_sessions alter column started_at set default now();
alter table public.table_sessions alter column last_activity set default now();
alter table public.table_sessions alter column total_orders set default 0;
alter table public.table_sessions alter column total_spent set default 0;
alter table public.table_sessions alter column created_at set default now();
alter table public.table_sessions alter column updated_at set default now();

alter table public.waiter_calls alter column status set default 'pending';
alter table public.waiter_calls alter column created_at set default now();

create index if not exists idx_tables_restaurant_status
  on public.tables(restaurant_id, status);

create index if not exists idx_waiter_calls_restaurant_status
  on public.waiter_calls(restaurant_id, status, created_at desc);

create index if not exists idx_orders_restaurant_status_created
  on public.orders(restaurant_id, status, created_at desc);

create index if not exists idx_order_items_order_status
  on public.order_items(order_id, status);

create or replace function private.require_restaurant_role(
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

revoke all on function private.require_restaurant_role(uuid, public.user_roles_role_enum[]) from public;
grant execute on function private.require_restaurant_role(uuid, public.user_roles_role_enum[]) to authenticated, service_role;

create or replace function private.is_valid_order_status(status_value text)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'orders_status_enum'
      and e.enumlabel = status_value
  );
$$;

create or replace function private.order_items_json(target_order_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', oi.id,
        'order_id', oi.order_id,
        'menu_item_id', oi.menu_item_id,
        'name', coalesce(mi.name, 'Item'),
        'quantity', oi.quantity,
        'unit_price', oi.unit_price,
        'total_price', oi.total_price,
        'status', oi.status,
        'station_id', oi.station_id,
        'course', oi.course,
        'special_instructions', oi.special_instructions,
        'customizations', oi.customizations,
        'prepared_at', oi.prepared_at,
        'expected_ready_at', oi.expected_ready_at,
        'created_at', oi.created_at
      )
      order by oi.created_at asc
    ),
    '[]'::jsonb
  )
  from public.order_items oi
  left join public.menu_items mi on mi.id = oi.menu_item_id
  where oi.order_id = target_order_id;
$$;

revoke all on function private.order_items_json(uuid) from public;
grant execute on function private.order_items_json(uuid) to authenticated, service_role;

create or replace function public.restaurant_get_orders(
  p_restaurant_id uuid,
  p_statuses text[] default null,
  p_date date default null,
  p_table_id uuid default null,
  p_limit integer default 100
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

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', o.id,
        'restaurant_id', o.restaurant_id,
        'customer_id', o.customer_id,
        'user_id', o.customer_id,
        'order_type', o.order_type,
        'table_id', o.table_id,
        'table_number', t.table_number,
        'status', o.status,
        'estimated_time', o.estimated_time,
        'estimated_ready_at', o.estimated_ready_at,
        'actual_ready_at', o.actual_ready_at,
        'completed_at', o.completed_at,
        'subtotal', o.subtotal,
        'tax_amount', o.tax_amount,
        'tip_amount', o.tip_amount,
        'discount_amount', o.discount_amount,
        'total_amount', o.total_amount,
        'party_size', o.party_size,
        'special_instructions', o.special_instructions,
        'cancellation_reason', o.cancellation_reason,
        'metadata', o.metadata,
        'created_at', o.created_at,
        'updated_at', o.updated_at,
        'customer', jsonb_build_object(
          'id', p.id,
          'full_name', p.full_name,
          'email', p.email,
          'phone', p.phone,
          'avatar_url', p.avatar_url
        ),
        'order_items', private.order_items_json(o.id)
      )
      order by o.created_at desc
    ),
    '[]'::jsonb
  )
  into result
  from (
    select *
    from public.orders o
    where o.restaurant_id = p_restaurant_id
      and (p_statuses is null or cardinality(p_statuses) = 0 or o.status::text = any(p_statuses))
      and (p_table_id is null or o.table_id = p_table_id)
      and (
        p_date is null
        or (o.created_at >= p_date::timestamptz and o.created_at < (p_date + 1)::timestamptz)
      )
    order by o.created_at desc
    limit greatest(1, least(coalesce(p_limit, 100), 250))
  ) o
  left join public.profiles p on p.id = o.customer_id
  left join public.tables t on t.id = o.table_id;

  return result;
end;
$$;

create or replace function public.restaurant_update_order_status(
  p_order_id uuid,
  p_status text,
  p_estimated_time integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  target_order public.orders%rowtype;
  normalized_status text := lower(trim(p_status));
  updated_order public.orders%rowtype;
begin
  select *
  into target_order
  from public.orders
  where id = p_order_id;

  if target_order.id is null then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  perform private.require_restaurant_role(target_order.restaurant_id);

  if normalized_status = 'new' then
    normalized_status := 'pending';
  elsif normalized_status = 'picked_up' then
    normalized_status := 'delivered';
  end if;

  if not private.is_valid_order_status(normalized_status) then
    raise exception 'Invalid order status: %', p_status using errcode = '22023';
  end if;

  update public.orders
  set
    status = normalized_status::public.orders_status_enum,
    estimated_time = coalesce(p_estimated_time, estimated_time),
    estimated_ready_at = case
      when p_estimated_time is not null then now() + make_interval(mins => p_estimated_time)
      else estimated_ready_at
    end,
    actual_ready_at = case
      when normalized_status = 'ready' then coalesce(actual_ready_at, now())
      else actual_ready_at
    end,
    completed_at = case
      when normalized_status in ('delivered', 'completed') then coalesce(completed_at, now())
      else completed_at
    end,
    updated_at = now()
  where id = p_order_id
  returning *
  into updated_order;

  if updated_order.table_id is not null and normalized_status in ('delivered', 'completed', 'cancelled') then
    update public.tables
    set
      status = case when normalized_status = 'cancelled' then status else 'cleaning' end,
      updated_at = now()
    where id = updated_order.table_id
      and restaurant_id = updated_order.restaurant_id;
  end if;

  return jsonb_build_object(
    'id', updated_order.id,
    'restaurant_id', updated_order.restaurant_id,
    'customer_id', updated_order.customer_id,
    'order_type', updated_order.order_type,
    'table_id', updated_order.table_id,
    'status', updated_order.status,
    'estimated_time', updated_order.estimated_time,
    'estimated_ready_at', updated_order.estimated_ready_at,
    'actual_ready_at', updated_order.actual_ready_at,
    'completed_at', updated_order.completed_at,
    'updated_at', updated_order.updated_at,
    'order_items', private.order_items_json(updated_order.id)
  );
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
    array['owner', 'manager', 'chef', 'barman']::public.user_roles_role_enum[]
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

create or replace function public.restaurant_get_tables(
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

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', t.id,
        'restaurant_id', t.restaurant_id,
        'table_number', t.table_number,
        'seats', t.seats,
        'status', t.status,
        'section', t.section,
        'assigned_waiter_id', t.assigned_waiter_id,
        'position_x', t.position_x,
        'position_y', t.position_y,
        'shape', t.shape,
        'width', t.width,
        'height', t.height,
        'qr_code', t.qr_code,
        'occupied_since', t.occupied_since,
        'notes', t.notes,
        'active_session', (
          select jsonb_build_object(
            'id', ts.id,
            'guest_name', ts.guest_name,
            'guest_count', ts.guest_count,
            'started_at', ts.started_at,
            'last_activity', ts.last_activity,
            'total_spent', ts.total_spent
          )
          from public.table_sessions ts
          where ts.table_id = t.id
            and ts.status = 'active'
          order by ts.started_at desc
          limit 1
        ),
        'created_at', t.created_at,
        'updated_at', t.updated_at
      )
      order by t.section nulls last, t.table_number
    ),
    '[]'::jsonb
  )
  into result
  from public.tables t
  where t.restaurant_id = p_restaurant_id;

  return result;
end;
$$;

create or replace function public.restaurant_update_table_status(
  p_table_id uuid,
  p_status text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  target_table public.tables%rowtype;
  normalized_status text;
  updated_table public.tables%rowtype;
begin
  select *
  into target_table
  from public.tables
  where id = p_table_id;

  if target_table.id is null then
    raise exception 'Table not found' using errcode = 'P0002';
  end if;

  perform private.require_restaurant_role(
    target_table.restaurant_id,
    array['owner', 'manager', 'maitre', 'waiter']::public.user_roles_role_enum[]
  );

  normalized_status := coalesce(nullif(lower(trim(p_status)), ''), target_table.status);

  if normalized_status not in ('available', 'occupied', 'reserved', 'cleaning', 'payment', 'blocked') then
    raise exception 'Invalid table status: %', p_status using errcode = '22023';
  end if;

  update public.tables
  set
    status = normalized_status,
    notes = coalesce(p_notes, notes),
    occupied_since = case
      when normalized_status = 'occupied' then coalesce(occupied_since, now())
      when normalized_status in ('available', 'cleaning') then null
      else occupied_since
    end,
    updated_at = now()
  where id = p_table_id
  returning *
  into updated_table;

  return to_jsonb(updated_table);
end;
$$;

create or replace function public.restaurant_get_dashboard_snapshot(
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

  select jsonb_build_object(
    'restaurant_id', p_restaurant_id,
    'generated_at', now(),
    'orders_today', (
      select count(*)
      from public.orders o
      where o.restaurant_id = p_restaurant_id
        and o.created_at >= current_date::timestamptz
        and o.created_at < (current_date + 1)::timestamptz
    ),
    'active_orders', (
      select count(*)
      from public.orders o
      where o.restaurant_id = p_restaurant_id
        and o.status::text in ('pending', 'confirmed', 'preparing', 'ready', 'open_for_additions')
    ),
    'revenue_today', (
      select coalesce(sum(coalesce(o.total_amount, o.subtotal, 0)), 0)
      from public.orders o
      where o.restaurant_id = p_restaurant_id
        and o.status::text in ('delivered', 'completed')
        and o.created_at >= current_date::timestamptz
        and o.created_at < (current_date + 1)::timestamptz
    ),
    'tables', (
      select jsonb_build_object(
        'total', count(*),
        'occupied', count(*) filter (where status = 'occupied'),
        'available', count(*) filter (where status = 'available'),
        'reserved', count(*) filter (where status = 'reserved'),
        'cleaning', count(*) filter (where status = 'cleaning')
      )
      from public.tables t
      where t.restaurant_id = p_restaurant_id
    ),
    'open_calls', (
      select count(*)
      from public.waiter_calls wc
      where wc.restaurant_id = p_restaurant_id
        and wc.status in ('pending', 'acknowledged')
    ),
    'kds_queue', (
      select count(*)
      from public.order_items oi
      join public.orders o on o.id = oi.order_id
      where o.restaurant_id = p_restaurant_id
        and o.status::text in ('confirmed', 'preparing', 'open_for_additions')
        and oi.status::text in ('pending', 'preparing')
    )
  )
  into result;

  return result;
end;
$$;

revoke all on function public.restaurant_get_orders(uuid, text[], date, uuid, integer) from public;
revoke all on function public.restaurant_update_order_status(uuid, text, integer) from public;
revoke all on function public.restaurant_get_kds_queue(uuid, uuid) from public;
revoke all on function public.restaurant_get_tables(uuid) from public;
revoke all on function public.restaurant_update_table_status(uuid, text, text) from public;
revoke all on function public.restaurant_get_dashboard_snapshot(uuid) from public;

grant execute on function public.restaurant_get_orders(uuid, text[], date, uuid, integer) to authenticated, service_role;
grant execute on function public.restaurant_update_order_status(uuid, text, integer) to authenticated, service_role;
grant execute on function public.restaurant_get_kds_queue(uuid, uuid) to authenticated, service_role;
grant execute on function public.restaurant_get_tables(uuid) to authenticated, service_role;
grant execute on function public.restaurant_update_table_status(uuid, text, text) to authenticated, service_role;
grant execute on function public.restaurant_get_dashboard_snapshot(uuid) to authenticated, service_role;

comment on function public.restaurant_get_orders(uuid, text[], date, uuid, integer)
  is 'Supabase RPC replacement for restaurant order list REST endpoints.';
comment on function public.restaurant_update_order_status(uuid, text, integer)
  is 'Supabase RPC replacement for restaurant order status transitions.';
comment on function public.restaurant_get_kds_queue(uuid, uuid)
  is 'Supabase RPC replacement for KDS queue endpoints.';
comment on function public.restaurant_get_tables(uuid)
  is 'Supabase RPC replacement for restaurant table list endpoints.';
comment on function public.restaurant_update_table_status(uuid, text, text)
  is 'Supabase RPC replacement for table status updates.';
comment on function public.restaurant_get_dashboard_snapshot(uuid)
  is 'Supabase RPC summary for restaurant hub/dashboard screens.';
