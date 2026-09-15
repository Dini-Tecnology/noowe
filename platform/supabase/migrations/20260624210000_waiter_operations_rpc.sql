-- Waiter Operations RPCs
-- Covers: get assigned tables, open table session, close table session,
--         create order for table, split bill calculation

alter table public.table_sessions
  alter column guest_user_ids drop default;

alter table public.table_sessions
  alter column guest_user_ids type jsonb
  using case
    when guest_user_ids is null or btrim(guest_user_ids) = '' then '[]'::jsonb
    else guest_user_ids::jsonb
  end;

alter table public.table_sessions
  alter column guest_user_ids set default '[]'::jsonb;

-- ─── get tables assigned to current waiter ────────────────────────────────────
create or replace function public.restaurant_get_my_tables(
  p_restaurant_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  result jsonb;
begin
  perform private.require_restaurant_role(
    p_restaurant_id,
    array['owner','manager','waiter','maitre']::public.user_roles_role_enum[]
  );

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', t.id,
      'table_number', t.table_number,
      'seats', t.seats,
      'section', t.section,
      'status', t.status,
      'occupied_since', t.occupied_since,
      'notes', t.notes,
      'active_session', (
        select jsonb_build_object(
          'id', ts.id,
          'guest_name', ts.guest_name,
          'guest_count', ts.guest_count,
          'total_spent', ts.total_spent,
          'started_at', ts.started_at
        )
        from public.table_sessions ts
        where ts.table_id = t.id and ts.status = 'active'
        limit 1
      ),
      'pending_orders', (
        select count(*)
        from public.orders o
        where o.table_id = t.id
          and o.status::text in ('pending','confirmed','preparing','ready')
      )
    ) order by t.section nulls last, t.table_number
  ), '[]'::jsonb)
  into result
  from public.tables t
  where t.restaurant_id = p_restaurant_id
    and (
      t.assigned_waiter_id = v_user_id
      or private.has_restaurant_role(p_restaurant_id, array['owner','manager','maitre']::public.user_roles_role_enum[])
    );

  return result;
end;
$$;

-- ─── open table session ───────────────────────────────────────────────────────
create or replace function public.restaurant_open_table_session(
  p_table_id uuid,
  p_guest_name text default null,
  p_guest_count integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_table record;
  v_session record;
begin
  select * into v_table from public.tables where id = p_table_id;
  if v_table.id is null then
    raise exception 'Table not found' using errcode = 'P0002';
  end if;

  perform private.require_restaurant_role(
    v_table.restaurant_id,
    array['owner','manager','waiter','maitre']::public.user_roles_role_enum[]
  );

  -- close any lingering active session
  update public.table_sessions
  set status = 'closed', updated_at = now()
  where table_id = p_table_id and status = 'active';

  insert into public.table_sessions(
    table_id, restaurant_id, guest_name, guest_count, guest_user_ids,
    status, started_at, last_activity, total_orders, total_spent, created_at, updated_at
  )
  values(
    p_table_id, v_table.restaurant_id, p_guest_name, p_guest_count, '[]'::jsonb,
    'active', now(), now(), 0, 0, now(), now()
  )
  returning * into v_session;

  -- mark table occupied
  update public.tables
  set status = 'occupied', occupied_since = now(), updated_at = now()
  where id = p_table_id;

  return to_jsonb(v_session);
end;
$$;

-- ─── close table session ──────────────────────────────────────────────────────
create or replace function public.restaurant_close_table_session(
  p_session_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_session record;
  v_updated record;
begin
  select * into v_session from public.table_sessions where id = p_session_id;
  if v_session.id is null then
    raise exception 'Table session not found' using errcode = 'P0002';
  end if;

  perform private.require_restaurant_role(
    v_session.restaurant_id,
    array['owner','manager','waiter','maitre']::public.user_roles_role_enum[]
  );

  update public.table_sessions
  set status = 'closed', updated_at = now()
  where id = p_session_id
  returning * into v_updated;

  -- mark table as cleaning
  update public.tables
  set
    status = 'cleaning',
    occupied_since = null,
    updated_at = now()
  where id = v_session.table_id;

  return to_jsonb(v_updated);
end;
$$;

-- ─── calculate split payment ──────────────────────────────────────────────────
create or replace function public.restaurant_calculate_split(
  p_order_id uuid,
  p_split_mode text,   -- 'equal' | 'individual' | 'percentage'
  p_parts integer default 2,
  p_percentages numeric[] default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_order record;
  v_total numeric;
  result jsonb;
begin
  select * into v_order from public.orders where id = p_order_id;
  if v_order.id is null then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  perform private.require_restaurant_role(
    v_order.restaurant_id,
    array['owner','manager','waiter']::public.user_roles_role_enum[]
  );

  v_total := coalesce(v_order.total_amount, v_order.subtotal, 0);

  if p_split_mode = 'equal' then
    result := jsonb_build_object(
      'mode', 'equal',
      'total', v_total,
      'parts', p_parts,
      'amount_per_part', round(v_total / greatest(p_parts, 1), 2)
    );
  elsif p_split_mode = 'percentage' and p_percentages is not null then
    result := jsonb_build_object(
      'mode', 'percentage',
      'total', v_total,
      'parts', (
        select jsonb_agg(jsonb_build_object(
          'percentage', pct,
          'amount', round(v_total * pct / 100, 2)
        ))
        from unnest(p_percentages) pct
      )
    );
  else
    -- individual (per order item)
    result := jsonb_build_object(
      'mode', 'individual',
      'total', v_total,
      'items', private.order_items_json(p_order_id)
    );
  end if;

  return result;
end;
$$;

revoke all on function public.restaurant_get_my_tables(uuid) from public;
revoke all on function public.restaurant_open_table_session(uuid, text, integer) from public;
revoke all on function public.restaurant_close_table_session(uuid) from public;
revoke all on function public.restaurant_calculate_split(uuid, text, integer, numeric[]) from public;

grant execute on function public.restaurant_get_my_tables(uuid) to authenticated, service_role;
grant execute on function public.restaurant_open_table_session(uuid, text, integer) to authenticated, service_role;
grant execute on function public.restaurant_close_table_session(uuid) to authenticated, service_role;
grant execute on function public.restaurant_calculate_split(uuid, text, integer, numeric[]) to authenticated, service_role;

alter table public.table_sessions enable row level security;

drop policy if exists "table_sessions_staff" on public.table_sessions;
create policy "table_sessions_staff" on public.table_sessions
  for all using (
    private.has_restaurant_role(restaurant_id, array['owner','manager','waiter','maitre']::public.user_roles_role_enum[])
    or guest_user_ids @> to_jsonb(auth.uid()::text)
  );

-- Add tables to realtime
alter publication supabase_realtime add table public.tables;
alter table public.tables replica identity full;

alter publication supabase_realtime add table public.table_sessions;
alter table public.table_sessions replica identity full;

alter publication supabase_realtime add table public.order_items;
alter table public.order_items replica identity full;
