-- Complete table QR lifecycle:
--   * table creation and QR issuance are atomic;
--   * every scan of the same physical table joins the same active session;
--   * only one active session can exist per table;
--   * customers can explicitly leave a session instead of only clearing the app;
--   * QR listings expose enough metadata for printing and expiry warnings.

-- Old deployments could create more than one active session for the same table
-- (one per customer scan). Keep the most recently active session and close the
-- duplicates before enforcing the invariant for all future writes.
with ranked as (
  select id,
         row_number() over (
           partition by table_id
           order by last_activity desc nulls last, started_at desc, id
         ) as position
  from public.table_sessions
  where status = 'active'
)
update public.table_sessions s
set status = 'ended', ended_at = coalesce(s.ended_at, now()), updated_at = now()
from ranked r
where s.id = r.id and r.position > 1;

create unique index if not exists uq_table_sessions_one_active_per_table
  on public.table_sessions(table_id)
  where status = 'active';

-- The payload itself was already unique, but two concurrent rotations could
-- still leave two different active payloads for the same table. Retire older
-- duplicates before enforcing one current printable code per table.
with ranked_qr as (
  select id,
         row_number() over (
           partition by table_id
           order by created_at desc, id
         ) as position
  from public.table_qr_codes
  where is_active
)
update public.table_qr_codes q
set is_active = false, updated_at = now()
from ranked_qr r
where q.id = r.id and r.position > 1;

create unique index if not exists uq_table_qr_codes_one_active_per_table
  on public.table_qr_codes(table_id)
  where is_active;

-- New QR rows must always belong to a real table. NOT VALID preserves the
-- migration path if a legacy environment contains orphaned historical rows,
-- while still enforcing the constraint for every new row.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'table_qr_codes_table_id_fkey'
  ) then
    alter table public.table_qr_codes
      add constraint table_qr_codes_table_id_fkey
      foreign key (table_id) references public.tables(id) on delete cascade not valid;
  end if;
end $$;

create or replace function public.restaurant_get_table_qr_codes(p_restaurant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $$
declare result jsonb;
begin
  perform private.require_restaurant_role(
    p_restaurant_id,
    array['owner', 'manager']::public.user_roles_role_enum[]
  );

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', qc.id,
      'table_id', t.id,
      'table_number', t.table_number,
      'section', t.section,
      'qr_code_data', qc.qr_code_data,
      'is_active', coalesce(qc.is_active, false),
      'expires_at', qc.expires_at,
      'created_at', qc.created_at
    ) order by t.section nulls last, t.table_number
  ), '[]'::jsonb)
  into result
  from public.tables t
  left join lateral (
    select q.*
    from public.table_qr_codes q
    where q.table_id = t.id
      and q.is_active
      and (q.expires_at is null or q.expires_at > now())
    order by q.created_at desc
    limit 1
  ) qc on true
  where t.restaurant_id = p_restaurant_id;

  return result;
end;
$$;

-- Creating a table through this RPC guarantees that the returned table is
-- immediately printable/scannable. The advisory lock makes the duplicate
-- name check safe under concurrent requests.
create or replace function public.restaurant_create_table(
  p_restaurant_id uuid,
  p_table_number text,
  p_seats integer,
  p_section text default null,
  p_notes text default null,
  p_shape text default 'rectangle',
  p_width numeric default 1,
  p_height numeric default 1
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_table public.tables;
  v_qr jsonb;
  v_number text := nullif(btrim(p_table_number), '');
begin
  perform private.require_restaurant_role(
    p_restaurant_id,
    array['owner', 'manager']::public.user_roles_role_enum[]
  );

  if v_number is null then
    raise exception 'Table number is required' using errcode = '22023';
  end if;
  if p_seats < 1 or p_seats > 50 then
    raise exception 'Table capacity must be between 1 and 50' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_restaurant_id::text || ':' || lower(v_number)));
  if exists (
    select 1 from public.tables
    where restaurant_id = p_restaurant_id and lower(table_number) = lower(v_number)
  ) then
    raise exception 'A table with this number already exists' using errcode = '23505';
  end if;

  insert into public.tables(
    restaurant_id, table_number, seats, status, section, notes,
    shape, width, height, created_at, updated_at
  ) values (
    p_restaurant_id, v_number, p_seats, 'available',
    coalesce(nullif(btrim(p_section), ''), 'Salão'), nullif(btrim(p_notes), ''),
    coalesce(nullif(btrim(p_shape), ''), 'rectangle'), coalesce(p_width, 1), coalesce(p_height, 1),
    now(), now()
  ) returning * into v_table;

  v_qr := public.restaurant_generate_table_qr(v_table.id);
  return to_jsonb(v_table) || jsonb_build_object(
    'qr_code', v_qr->>'qr_code_data',
    'qr_expires_at', v_qr->>'expires_at'
  );
end;
$$;

-- All customers physically scanning a table join its single shared session.
-- A row lock plus the partial unique index prevents two simultaneous first
-- scans from creating separate comandas.
create or replace function public.customer_open_table_session(p_qr_data text)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_qr public.table_qr_codes;
  v_table public.tables;
  v_session public.table_sessions;
  v_reservation public.reservations;
  v_name text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select * into v_qr
  from public.table_qr_codes
  where qr_code_data = btrim(p_qr_data)
    and is_active
    and (expires_at is null or expires_at > now())
    and signature = encode(sha256(qr_code_data::bytea), 'hex')
    and exists (
      select 1 from public.restaurants r
      where r.id = table_qr_codes.restaurant_id and r.is_active
    )
  order by created_at desc
  limit 1;

  if v_qr.id is null then
    raise exception 'Invalid or expired QR code' using errcode = '22023';
  end if;

  select * into v_table
  from public.tables
  where id = v_qr.table_id and restaurant_id = v_qr.restaurant_id
  for update;

  if v_table.id is null or v_table.status in ('blocked', 'cleaning', 'payment') then
    raise exception 'Table is not available for check-in' using errcode = 'P0005';
  end if;

  -- If staff assigned this table to a confirmed reservation, the QR doubles
  -- as a secure self check-in: only the reservation owner or an accepted
  -- invited guest can occupy it. Manually reserved tables without a linked
  -- reservation keep the ordinary walk-in QR flow.
  if v_table.status = 'reserved' then
    select * into v_reservation
    from public.reservations r
    where r.table_id = v_table.id
      and r.status::text = 'confirmed'
      and r.reservation_time between now() - interval '2 hours' and now() + interval '6 hours'
    order by r.reservation_time
    limit 1
    for update;

    if v_reservation.id is not null
      and v_reservation.customer_id is distinct from auth.uid()
      and not exists (
        select 1 from public.reservation_guests g
        where g.reservation_id = v_reservation.id
          and g.guest_user_id = auth.uid()
          and g.status = 'accepted'
      )
    then
      raise exception 'This table is reserved for another customer' using errcode = 'P0005';
    end if;
  end if;

  -- Do not silently move a customer who still has an open order at another
  -- table. This avoids losing the active bill from the app's single-session UI.
  if exists (
    select 1
    from public.table_session_participants p
    join public.table_sessions s on s.id = p.table_session_id
    join public.orders o on o.table_session_id = s.id
    where p.user_id = auth.uid()
      and s.status = 'active'
      and s.table_id <> v_table.id
      and o.status::text not in ('completed', 'cancelled')
  ) then
    raise exception 'Settle the current table account before joining another table'
      using errcode = 'P0004';
  end if;

  -- Remove stale memberships from other tables after the explicit new scan.
  delete from public.table_session_participants p
  using public.table_sessions s
  where p.table_session_id = s.id
    and p.user_id = auth.uid()
    and s.status = 'active'
    and s.table_id <> v_table.id;

  -- A session with no activity for six hours and no open order is abandoned.
  update public.table_sessions s
  set status = 'ended', ended_at = now(), updated_at = now()
  where s.table_id = v_table.id
    and s.status = 'active'
    and s.last_activity < now() - interval '6 hours'
    and not exists (
      select 1 from public.orders o
      where o.table_session_id = s.id and o.status::text not in ('completed', 'cancelled')
    );

  select * into v_session
  from public.table_sessions
  where table_id = v_table.id and status = 'active'
  order by started_at desc
  limit 1;

  if v_session.id is null then
    insert into public.table_sessions(
      restaurant_id, table_id, qr_code_id, customer_id, primary_user_id,
      guest_user_ids, guest_count, status, started_at, last_activity,
      total_orders, total_spent, created_at, updated_at
    ) values (
      v_table.restaurant_id, v_table.id, v_qr.id, auth.uid(), auth.uid(),
      '[]', 1, 'active', now(), now(), 0, 0, now(), now()
    ) returning * into v_session;
  else
    update public.table_sessions
    set qr_code_id = coalesce(qr_code_id, v_qr.id),
        customer_id = coalesce(customer_id, auth.uid()),
        primary_user_id = coalesce(primary_user_id, auth.uid()),
        last_activity = now(),
        updated_at = now()
    where id = v_session.id
    returning * into v_session;
  end if;

  select full_name into v_name from public.profiles where id = auth.uid();
  insert into public.table_session_participants(table_session_id, user_id, display_name, is_host)
  values (
    v_session.id,
    auth.uid(),
    coalesce(nullif(btrim(v_name), ''), 'Cliente'),
    v_session.customer_id = auth.uid()
  )
  on conflict (table_session_id, user_id) where user_id is not null
  do update set display_name = excluded.display_name;

  update public.tables
  set status = 'occupied', occupied_since = coalesce(occupied_since, now()), updated_at = now()
  where id = v_table.id;

  if v_reservation.id is not null then
    update public.reservations
    set status = 'seated', updated_at = now()
    where id = v_reservation.id;
  end if;

  return jsonb_build_object(
    'restaurantId', v_table.restaurant_id,
    'tableId', v_table.id,
    'tableSessionId', v_session.id,
    'tableNumber', v_table.table_number
  );
end;
$$;

create or replace function public.customer_leave_table_session(p_table_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_session public.table_sessions;
  v_next_host uuid;
  v_remaining integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select * into v_session
  from public.table_sessions
  where id = p_table_session_id and status = 'active'
  for update;

  if v_session.id is null or not exists (
    select 1 from public.table_session_participants
    where table_session_id = p_table_session_id and user_id = auth.uid()
  ) then
    raise exception 'Active table session not accessible' using errcode = 'P0002';
  end if;

  delete from public.table_session_participants
  where table_session_id = p_table_session_id and user_id = auth.uid();

  select count(*)::integer into v_remaining
  from public.table_session_participants
  where table_session_id = p_table_session_id and user_id is not null;

  if v_remaining > 0 and (v_session.customer_id = auth.uid() or v_session.primary_user_id = auth.uid()) then
    select user_id into v_next_host
    from public.table_session_participants
    where table_session_id = p_table_session_id and user_id is not null
    order by joined_at
    limit 1;

    update public.table_session_participants
    set is_host = (user_id = v_next_host)
    where table_session_id = p_table_session_id and user_id is not null;

    update public.table_sessions
    set customer_id = v_next_host, primary_user_id = v_next_host,
        last_activity = now(), updated_at = now()
    where id = p_table_session_id;
  elsif v_remaining = 0 then
    -- An empty session with no order can be released immediately. Sessions
    -- with orders remain open for restaurant staff to settle/close safely.
    if not exists (select 1 from public.orders where table_session_id = p_table_session_id) then
      update public.table_sessions
      set status = 'ended', ended_at = now(), last_activity = now(), updated_at = now()
      where id = p_table_session_id;

      if exists (
        select 1 from public.reservations
        where table_id = v_session.table_id and status::text = 'seated'
      ) then
        -- Leaving immediately after a self check-in (before ordering) undoes
        -- that check-in instead of leaving a "seated" reservation on a free table.
        update public.reservations
        set status = 'confirmed', updated_at = now()
        where table_id = v_session.table_id and status::text = 'seated';

        update public.tables
        set status = 'reserved', occupied_since = null, updated_at = now()
        where id = v_session.table_id;
      else
        update public.tables
        set status = 'available', occupied_since = null, updated_at = now()
        where id = v_session.table_id and status = 'occupied';
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'tableSessionId', p_table_session_id,
    'left', true,
    'remainingParticipants', v_remaining
  );
end;
$$;

revoke all on function public.restaurant_create_table(uuid, text, integer, text, text, text, numeric, numeric) from public;
revoke all on function public.customer_leave_table_session(uuid) from public;
grant execute on function public.restaurant_create_table(uuid, text, integer, text, text, text, numeric, numeric) to authenticated, service_role;
grant execute on function public.customer_leave_table_session(uuid) to authenticated;
