-- Keep the customer order tracker consistent with status changes performed
-- by the restaurant app, KDS, cancellation and payment flows.

create or replace function private.sync_order_item_status_from_order()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if new.status::text = 'preparing' then
    update public.order_items
    set status = 'preparing', updated_at = now()
    where order_id = new.id and status::text = 'pending';
  elsif new.status::text = 'ready' then
    update public.order_items
    set status = 'ready', prepared_at = coalesce(prepared_at, now()), updated_at = now()
    where order_id = new.id and status::text in ('pending', 'preparing');
  elsif new.status::text in ('delivered', 'completed') then
    update public.order_items
    set status = 'delivered', prepared_at = coalesce(prepared_at, now()), updated_at = now()
    where order_id = new.id and status::text <> 'cancelled';
  elsif new.status::text = 'cancelled' then
    update public.order_items
    set status = 'cancelled', updated_at = now()
    where order_id = new.id and status::text <> 'delivered';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_order_item_status_from_order on public.orders;
create trigger trg_sync_order_item_status_from_order
after update of status on public.orders
for each row execute function private.sync_order_item_status_from_order();

-- Replace the restaurant status RPC with an explicit operational state
-- machine. Other trusted flows (notably payment completion) can still move an
-- order directly to completed and are covered by the synchronization trigger.
create or replace function private.is_valid_restaurant_order_transition(
  current_status text,
  next_status text
)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select current_status = next_status or case current_status
    when 'pending' then next_status in ('confirmed', 'preparing', 'cancelled')
    when 'confirmed' then next_status in ('preparing', 'open_for_additions', 'cancelled')
    when 'preparing' then next_status in ('open_for_additions', 'ready', 'cancelled')
    when 'open_for_additions' then next_status in ('preparing', 'ready', 'cancelled')
    when 'ready' then next_status in ('delivering', 'delivered', 'completed')
    when 'delivering' then next_status in ('delivered', 'completed', 'cancelled')
    when 'delivered' then next_status = 'completed'
    else false
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
  select * into target_order
  from public.orders
  where id = p_order_id
  for update;

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

  if not private.is_valid_restaurant_order_transition(target_order.status::text, normalized_status) then
    raise exception 'Invalid order status transition: % -> %', target_order.status, normalized_status
      using errcode = '23514';
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
  returning * into updated_order;

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

revoke all on function public.restaurant_update_order_status(uuid, text, integer) from public;
grant execute on function public.restaurant_update_order_status(uuid, text, integer) to authenticated, service_role;

-- Ensure both rows used by the order detail subscription are present in the
-- Realtime publication, even on projects initialized from a partial baseline.
do $$
declare realtime_table text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach realtime_table in array array['orders', 'order_items'] loop
      execute format('alter table public.%I replica identity full', realtime_table);
      if not exists (
        select 1 from pg_publication_tables
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

comment on function private.sync_order_item_status_from_order()
  is 'Synchronizes item tracking statuses whenever the aggregate order status changes.';
comment on function private.is_valid_restaurant_order_transition(text, text)
  is 'Operational state machine used by the restaurant status RPC.';
