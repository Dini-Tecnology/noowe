-- Fase 1.1 (Service Type) + Fase 2.1 (QR Code security) of the client MVP
-- implementation plan. Two bugs and one vulnerability fixed together because
-- they touch the same RPCs and ship in the same release window:
--
-- Service Type bugs (customer app currently offers actions the restaurant's
-- service_type does not support, or blocks actions it should support):
--   1. customer_create_reservation only allowed service_type = 'casual_dining'.
--      Reservations are also part of the MVP for fine_dining, so reserving at
--      a fine_dining restaurant failed with "Restaurant is unavailable" even
--      though the client's ServiceTypeContext advertises reservations: true
--      for that type.
--   2. customer_call_waiter had no service_type guard at all. A quick_service
--      restaurant (features.callWaiter = false in the client config) still
--      accepted waiter calls as long as a table_session existed.
--   3. customer_place_order required an active table_session unconditionally,
--      so quick_service (counter/no-table) restaurants could never receive an
--      order from the client app.
--
-- QR code vulnerability (anti-fraud): restaurant_generate_table_qr encoded
-- the table's own uuid into the QR payload ('noowe://table/' || table_id) and
-- "signed" it with sha256 of that same public string. Anyone who learned a
-- table's uuid (e.g. from another API response, or by guessing sequential
-- exports) could construct a valid QR payload and open a table session
-- remotely, without being at the restaurant. This migration:
--   4. Replaces the payload with an unguessable random token, unrelated to
--      the table id.
--   5. Adds a partial unique index so only one *active* QR can ever resolve
--      to a given payload.
--   6. Sets a 90-day expiry on newly generated codes (previously null/never).
--   7. Deactivates all previously issued codes that follow the guessable
--      'noowe://table/<uuid>' pattern, closing the hole immediately. Every
--      restaurant using the old codes must reprint them via the existing
--      QRGeneratorScreen / QRBatchScreen before this ships (operational
--      step, not code).
--   8. customer_open_table_session now expires a customer's own stale active
--      session (no activity for 6h) instead of reusing it indefinitely, and
--      refreshes last_activity when an existing session is reused.

-- ── 1. Reservations: allow fine_dining and casual_dining ────────────────────
create or replace function public.customer_create_reservation(
  p_restaurant_id uuid, p_reservation_time timestamptz, p_party_size integer,
  p_special_requests text default null
) returns public.reservations language plpgsql security definer
set search_path = public, private, pg_temp as $$
declare v_capacity integer; v_reserved integer; v_result public.reservations;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_party_size < 1 or p_party_size > 20 or p_reservation_time < now() + interval '30 minutes'
  then raise exception 'Invalid reservation request' using errcode = '22023'; end if;
  if not exists(
    select 1 from public.restaurants
    where id = p_restaurant_id and is_active
      and service_type in ('fine_dining', 'casual_dining')
  ) then raise exception 'Restaurant is unavailable' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtext(p_restaurant_id::text || date_trunc('hour', p_reservation_time)::text));
  select coalesce(sum(seats), 0)::integer into v_capacity from public.tables where restaurant_id = p_restaurant_id;
  select coalesce(sum(party_size), 0)::integer into v_reserved from public.reservations
    where restaurant_id = p_restaurant_id and status::text in ('pending','confirmed')
      and reservation_time between p_reservation_time - interval '90 minutes' and p_reservation_time + interval '90 minutes';
  if v_capacity = 0 or v_reserved + p_party_size > v_capacity
  then raise exception 'No availability for this time' using errcode = 'P0001'; end if;
  insert into public.reservations(restaurant_id, customer_id, reservation_time, party_size, special_requests, status)
    values(p_restaurant_id, auth.uid(), p_reservation_time, p_party_size, nullif(trim(p_special_requests), ''), 'pending')
    returning * into v_result;
  return v_result;
end $$;

-- ── 2. Call waiter: restrict to service types that offer table service ──────
create or replace function public.customer_call_waiter(
  p_restaurant_id uuid, p_table_id uuid, p_message text default null
) returns jsonb language plpgsql security definer
set search_path = public, private, pg_temp as $$
declare v_call public.service_calls;
begin
  if not exists (
    select 1 from public.restaurants
    where id = p_restaurant_id and is_active
      and service_type in ('fine_dining', 'casual_dining')
  ) then raise exception 'This restaurant does not offer table service' using errcode = 'P0001'; end if;
  if not exists (
    select 1 from public.table_sessions s
    where s.restaurant_id = p_restaurant_id and s.table_id = p_table_id
      and (s.customer_id = auth.uid() or s.primary_user_id = auth.uid()) and s.status = 'active'
  ) then raise exception 'Active table session required' using errcode = 'P0001'; end if;
  select * into v_call from public.service_calls
    where restaurant_id = p_restaurant_id and table_id = p_table_id and user_id = auth.uid()
      and call_type = 'help' and status in ('pending','acknowledged')
    order by created_at desc limit 1;
  if v_call.id is null then
    insert into public.service_calls(restaurant_id, table_id, user_id, call_type, status, message,
      called_at, created_at, updated_at)
    values(p_restaurant_id, p_table_id, auth.uid(), 'help', 'pending', nullif(trim(p_message), ''),
      now(), now(), now()) returning * into v_call;
  end if;
  return to_jsonb(v_call);
end $$;

-- ── 3. Place order: allow quick_service to order without a table session ───
create or replace function public.customer_place_order(
  p_restaurant_id uuid, p_table_session_id uuid, p_items jsonb, p_client_request_id uuid
) returns jsonb language plpgsql security definer
set search_path = public, private, pg_temp as $$
declare
  v_session public.table_sessions;
  v_existing public.orders;
  v_result jsonb;
  v_order_id uuid;
  v_order_type text;
  v_table_id uuid;
begin
  select * into v_existing from public.orders
    where customer_id = auth.uid() and client_request_id = p_client_request_id;
  if v_existing.id is not null then
    select jsonb_build_object('id', o.id, 'restaurant_id', o.restaurant_id, 'table_id', o.table_id,
      'status', o.status, 'subtotal', o.subtotal, 'total_amount', o.total_amount,
      'order_items', private.order_items_json(o.id)) into v_result from public.orders o where o.id = v_existing.id;
    return v_result;
  end if;

  if p_table_session_id is not null then
    select * into v_session from public.table_sessions where id = p_table_session_id
      and restaurant_id = p_restaurant_id and customer_id = auth.uid() and status = 'active';
    if v_session.id is null then raise exception 'Active table session required' using errcode = 'P0001'; end if;
    v_order_type := 'dine_in';
    v_table_id := v_session.table_id;
  else
    -- No table session: only quick_service (counter) restaurants can accept
    -- an order with no seated table. Every other MVP service type requires
    -- a scanned table QR to open a session first.
    if not exists (
      select 1 from public.restaurants
      where id = p_restaurant_id and is_active and service_type = 'quick_service'
    ) then raise exception 'Active table session required' using errcode = 'P0001'; end if;
    v_order_type := 'pickup';
    v_table_id := null;
  end if;

  v_result := public.place_order(p_restaurant_id, v_order_type, p_items, v_table_id, null, null, null);
  v_order_id := (v_result->>'id')::uuid;

  update public.orders
  set client_request_id = p_client_request_id,
      metadata = coalesce(metadata, '{}'::jsonb)
        || case when v_session.id is not null
             then jsonb_build_object('table_session_id', v_session.id)
             else '{}'::jsonb end
  where id = v_order_id;

  if v_session.id is not null then
    update public.table_sessions set total_orders = total_orders + 1, last_activity = now(), updated_at = now()
      where id = v_session.id;
  end if;

  return v_result;
end $$;

-- ── 4-6. Unforgeable, expiring QR payloads ───────────────────────────────────
create or replace function public.restaurant_generate_table_qr(
  p_table_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_table record;
  v_qr record;
  v_data text;
begin
  select * into v_table from public.tables where id = p_table_id;
  if v_table.id is null then
    raise exception 'Table not found' using errcode = 'P0002';
  end if;

  perform private.require_restaurant_role(
    v_table.restaurant_id,
    array['owner', 'manager']::public.user_roles_role_enum[]
  );

  -- Random, unguessable token — unrelated to the table id. gen_random_uuid()
  -- is PostgreSQL core (pg_catalog) since PG13, so this has no dependency on
  -- pgcrypto being reachable under this function's search_path.
  v_data := 'noowe://t/' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

  update public.table_qr_codes
  set is_active = false, updated_at = now()
  where table_id = p_table_id and is_active;

  insert into public.table_qr_codes (
    restaurant_id, table_id, qr_code_data, signature, style,
    color_primary, logo_included, version, is_active, expires_at, generated_by,
    created_at, updated_at
  )
  values (
    v_table.restaurant_id, p_table_id, v_data,
    encode(sha256(v_data::bytea), 'hex'), 'default',
    '#000000', false, 1, true, now() + interval '90 days', auth.uid()::text,
    now(), now()
  )
  returning * into v_qr;

  update public.tables set qr_code = v_data, updated_at = now() where id = p_table_id;

  return jsonb_build_object(
    'table_id', p_table_id,
    'qr_code_data', v_qr.qr_code_data,
    'expires_at', v_qr.expires_at,
    'created_at', v_qr.created_at
  );
end;
$$;

-- Close the hole immediately: deactivate every code that follows the old
-- guessable 'noowe://table/<uuid>' pattern. Restaurants must regenerate
-- (reprint) via QRGeneratorScreen / QRBatchScreen before staff hand out new
-- codes — this is an operational step, tracked outside this migration.
--
-- Must run BEFORE the unique index below: production has active rows with
-- duplicate qr_code_data under the old deterministic scheme (observed
-- 2026-08-14 — a race in the old restaurant_generate_table_qr allowed two
-- concurrent calls for the same table to both deactivate-then-insert,
-- leaving two active rows). The index would fail to build against that
-- pre-existing state; this cleanup removes every one of those duplicates
-- first, since they're all being retired regardless.
update public.table_qr_codes
set is_active = false, updated_at = now()
where qr_code_data like 'noowe://table/%' and is_active;

-- Only one *active* row may ever resolve to a given payload. Partial (not a
-- plain unique index) so a future duplicate under the new random-token
-- scheme (astronomically unlikely, but not impossible) fails loudly instead
-- of silently letting two tables' QR codes resolve to the same session.
create unique index if not exists uq_table_qr_codes_active_data
  on public.table_qr_codes(qr_code_data) where is_active;

-- ── 7. Expire stale sessions instead of reusing them indefinitely ──────────
create or replace function public.customer_open_table_session(p_qr_data text)
returns jsonb language plpgsql security definer
set search_path = public, private, pg_temp as $$
declare v_qr public.table_qr_codes; v_table public.tables; v_session public.table_sessions;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select * into v_qr from public.table_qr_codes
    where qr_code_data = p_qr_data and is_active and (expires_at is null or expires_at > now())
      and signature = encode(sha256(qr_code_data::bytea), 'hex')
      and exists (select 1 from public.restaurants r where r.id = table_qr_codes.restaurant_id and r.is_active)
    order by created_at desc limit 1;
  if v_qr.id is null then raise exception 'Invalid or expired QR code' using errcode = '22023'; end if;
  select * into v_table from public.tables where id = v_qr.table_id and restaurant_id = v_qr.restaurant_id;

  -- A session with no activity for 6h is treated as abandoned: close it so
  -- it is never silently reused (and never blocks a fresh session) days or
  -- weeks later.
  update public.table_sessions
  set status = 'ended', ended_at = now(), updated_at = now()
  where table_id = v_table.id and customer_id = auth.uid() and status = 'active'
    and last_activity < now() - interval '6 hours';

  select * into v_session from public.table_sessions
    where table_id = v_table.id and customer_id = auth.uid() and status = 'active'
    order by started_at desc limit 1;
  if v_session.id is null then
    insert into public.table_sessions(restaurant_id, table_id, qr_code_id, customer_id, primary_user_id,
      guest_user_ids, guest_count, status, started_at, last_activity, total_orders, total_spent, created_at, updated_at)
    values(v_table.restaurant_id, v_table.id, v_qr.id, auth.uid(), auth.uid(), '[]', 1, 'active', now(), now(), 0, 0, now(), now())
    returning * into v_session;
  else
    update public.table_sessions set last_activity = now(), updated_at = now() where id = v_session.id
    returning * into v_session;
  end if;
  return jsonb_build_object('restaurantId', v_table.restaurant_id, 'tableId', v_table.id,
    'tableSessionId', v_session.id, 'tableNumber', v_table.table_number);
end $$;
