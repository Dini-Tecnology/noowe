-- Maître table flow: reservation details, reservation-aware tables and atomic check-in.

alter table public.reservations
  add column if not exists notes text;

create or replace function public.restaurant_get_reservations(
  p_restaurant_id uuid,
  p_date date default null,
  p_status text[] default null,
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
  v_date date := coalesce(p_date, current_date);
begin
  perform private.require_restaurant_role(
    p_restaurant_id,
    array['owner','manager','maitre']::public.user_roles_role_enum[]
  );

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', r.id,
      'restaurant_id', r.restaurant_id,
      'customer_id', r.customer_id,
      'table_id', r.table_id,
      'table_number', t.table_number,
      'reservation_time', r.reservation_time,
      'party_size', r.party_size,
      'status', r.status,
      'special_requests', r.special_requests,
      'notes', r.notes,
      'created_at', r.created_at,
      'updated_at', r.updated_at,
      'customer', jsonb_build_object(
        'id', p.id,
        'full_name', p.full_name,
        'email', p.email,
        'phone', p.phone,
        'avatar_url', p.avatar_url
      )
    ) order by r.reservation_time asc
  ), '[]'::jsonb)
  into result
  from public.reservations r
  left join public.profiles p on p.id = r.customer_id
  left join public.tables t on t.id = r.table_id
  where r.restaurant_id = p_restaurant_id
    and (
      p_date is null
      or (r.reservation_time >= v_date::timestamptz
          and r.reservation_time < (v_date + 1)::timestamptz)
    )
    and (p_status is null or r.status::text = any(p_status))
  limit greatest(1, least(coalesce(p_limit, 100), 300));

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
        'active_reservation', (
          select jsonb_build_object(
            'id', r.id,
            'customer_name', coalesce(nullif(btrim(p.full_name), ''), nullif(btrim(p.email), ''), 'Cliente'),
            'party_size', r.party_size
          )
          from public.reservations r
          left join public.profiles p on p.id = r.customer_id
          where r.table_id = t.id
            and r.status::text = 'confirmed'
            and t.status = 'reserved'
            and r.reservation_time >= now() - interval '2 hours'
          order by r.reservation_time asc
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

create or replace function public.restaurant_check_in_reservation(
  p_reservation_id uuid,
  p_table_id uuid,
  p_guest_name text default null,
  p_guest_count integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_reservation public.reservations%rowtype;
  v_table public.tables%rowtype;
  v_session public.table_sessions%rowtype;
  v_guest_name text;
  v_guest_count integer;
begin
  select * into v_reservation
  from public.reservations
  where id = p_reservation_id
  for update;

  if v_reservation.id is null then
    raise exception 'Reservation not found' using errcode = 'P0002';
  end if;

  select * into v_table
  from public.tables
  where id = p_table_id
  for update;

  if v_table.id is null or v_table.restaurant_id <> v_reservation.restaurant_id then
    raise exception 'Table not found for this reservation' using errcode = 'P0002';
  end if;

  perform private.require_restaurant_role(
    v_reservation.restaurant_id,
    array['owner','manager','maitre']::public.user_roles_role_enum[]
  );

  if v_reservation.status::text <> 'confirmed' then
    raise exception 'Only confirmed reservations can check in' using errcode = '22023';
  end if;

  if v_table.status not in ('available', 'reserved') then
    raise exception 'Table is not available for check-in' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.table_sessions ts
    where ts.table_id = p_table_id and ts.status = 'active'
  ) then
    raise exception 'Table already has an active session' using errcode = '23505';
  end if;

  v_guest_name := nullif(btrim(p_guest_name), '');
  if v_guest_name is null then
    select coalesce(nullif(btrim(p.full_name), ''), nullif(btrim(p.email), ''), 'Cliente')
    into v_guest_name
    from public.profiles p
    where p.id = v_reservation.customer_id;
  end if;

  v_guest_count := coalesce(p_guest_count, v_reservation.party_size);
  if v_guest_count < 1 or v_guest_count > v_table.seats then
    raise exception 'Guest count exceeds table capacity' using errcode = '22023';
  end if;

  insert into public.table_sessions(
    table_id, restaurant_id, customer_id, guest_name, guest_count, guest_user_ids,
    status, started_at, last_activity, total_orders, total_spent, created_at, updated_at
  )
  values(
    p_table_id, v_reservation.restaurant_id, v_reservation.customer_id,
    v_guest_name, v_guest_count, '[]'::jsonb,
    'active', now(), now(), 0, 0, now(), now()
  )
  returning * into v_session;

  update public.reservations
  set table_id = p_table_id, status = 'seated', updated_at = now()
  where id = p_reservation_id;

  update public.tables
  set status = 'occupied', occupied_since = now(), updated_at = now()
  where id = p_table_id;

  return jsonb_build_object(
    'reservation_id', p_reservation_id,
    'table_id', p_table_id,
    'session', to_jsonb(v_session)
  );
end;
$$;

revoke all on function public.restaurant_check_in_reservation(uuid, uuid, text, integer) from public;
grant execute on function public.restaurant_check_in_reservation(uuid, uuid, text, integer) to authenticated, service_role;
