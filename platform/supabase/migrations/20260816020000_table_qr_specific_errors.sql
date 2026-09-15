-- customer_open_table_session collapsed four very different failure causes
-- (code never existed / typo, revoked by a newer QR for the same table,
-- calendar-expired, restaurant deactivated) into one generic 22023 "Invalid
-- or expired QR code", which the client always renders as "QR inválido...
-- expirou". A restaurant that regenerates a table's QR immediately revokes
-- the previous one (see restaurant_generate_table_qr), so a freshly printed
-- code with a real November expiry can still be scanned right after an
-- earlier copy of it — and staff only ever see the misleading "expired"
-- message, with no way to tell that from an actually-expired or truly
-- unknown code. Split the lookup into precise checks with distinct
-- errcodes so the client can report what really happened.
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
  v_data text := btrim(p_qr_data);
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  -- Look up the code ignoring active/expiry/signature first so we can tell
  -- "never existed" apart from "existed but is no longer usable".
  select * into v_qr
  from public.table_qr_codes
  where qr_code_data = v_data
  order by created_at desc
  limit 1;

  if v_qr.id is null then
    raise exception 'QR code not recognized' using errcode = '22023';
  end if;

  if v_qr.signature is distinct from encode(sha256(v_qr.qr_code_data::bytea), 'hex') then
    raise exception 'QR code failed signature check' using errcode = '22023';
  end if;

  if not v_qr.is_active then
    raise exception 'QR code was replaced by a newer one' using errcode = 'P0006';
  end if;

  if v_qr.expires_at is not null and v_qr.expires_at <= now() then
    raise exception 'QR code has expired' using errcode = 'P0007';
  end if;

  if not exists (
    select 1 from public.restaurants r where r.id = v_qr.restaurant_id and r.is_active
  ) then
    raise exception 'Restaurant is not active' using errcode = '22023';
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
