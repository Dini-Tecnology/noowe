-- Fine dining group ordering: shared table sessions, guest invites, and bill
-- splitting ("Minha Comanda" / "Fechar Conta" in the client app).
--
-- Today customer_open_table_session keys a session by (table_id, customer_id):
-- every phone that scans the table QR gets its own *isolated* session, so
-- there is no way for a table of guests to see each other's orders or split
-- a bill. This migration adds:
--   1. table_session_participants — who's actually at the table.
--   2. table_session_invites — short-lived tokens so a host can invite guests
--      without them having to scan the physical QR (they may not have phone
--      signal/camera access, or the host wants to invite before arriving).
--   3. orders.table_session_id — a real FK column (previously only stashed
--      in orders.metadata as unindexed jsonb) so the bill RPC can cheaply
--      join orders back to a shared session.
--   4. customer_open_table_session / customer_place_order / customer_call_waiter
--      updated to register participants and allow any participant (not just
--      the original scanner) to act on the shared session.
--   5. customer_create_table_invite / customer_join_table_invite — the
--      invite lifecycle, mirroring the existing reservation-invite pattern.
--   6. customer_get_table_bill — aggregates items per participant for the
--      split-bill screen.
--   7. menu_items.is_popular — a real (default-false) flag for the "Popular"
--      badge on the fine_dining menu; no fabricated popularity heuristic.

-- ── 1. Popular badge (menu) ──────────────────────────────────────────────────
alter table public.menu_items add column if not exists is_popular boolean not null default false;

-- ── 2. Participants ──────────────────────────────────────────────────────────
create table if not exists public.table_session_participants (
  id uuid primary key default gen_random_uuid(),
  table_session_id uuid not null references public.table_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  display_name text,
  is_host boolean not null default false,
  joined_at timestamptz not null default now(),
  unique (table_session_id, user_id)
);
create index if not exists idx_table_session_participants_session on public.table_session_participants(table_session_id);
create index if not exists idx_table_session_participants_user on public.table_session_participants(user_id);

alter table public.table_session_participants enable row level security;
drop policy if exists table_session_participants_select_member on public.table_session_participants;
create policy table_session_participants_select_member on public.table_session_participants
for select to authenticated
using (
  exists (
    select 1 from public.table_session_participants me
    where me.table_session_id = table_session_participants.table_session_id
      and me.user_id = auth.uid()
  )
  or private.has_restaurant_role((
    select s.restaurant_id from public.table_sessions s where s.id = table_session_participants.table_session_id
  ))
);
-- Membership changes only happen through the SECURITY DEFINER RPCs below.
revoke insert, update, delete on public.table_session_participants from authenticated;

-- ── 3. Invites ────────────────────────────────────────────────────────────────
create table if not exists public.table_session_invites (
  id uuid primary key default gen_random_uuid(),
  table_session_id uuid not null references public.table_sessions(id) on delete cascade,
  token text not null unique,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '6 hours',
  revoked_at timestamptz
);
create index if not exists idx_table_session_invites_token on public.table_session_invites(token);
create index if not exists idx_table_session_invites_session on public.table_session_invites(table_session_id);

alter table public.table_session_invites enable row level security;
drop policy if exists table_session_invites_select_creator on public.table_session_invites;
create policy table_session_invites_select_creator on public.table_session_invites
for select to authenticated using (created_by = auth.uid());
revoke insert, update, delete on public.table_session_invites from authenticated;

-- ── 4. orders.table_session_id (real column, replaces jsonb-only stash) ─────
alter table public.orders add column if not exists table_session_id uuid references public.table_sessions(id) on delete set null;
create index if not exists idx_orders_table_session_id on public.orders(table_session_id);

-- Let every participant of a shared session see the whole table's orders —
-- needed for "Minha Comanda" / "Fechar Conta" to show who ordered what.
drop policy if exists orders_select_table_participant on public.orders;
create policy orders_select_table_participant on public.orders
for select to authenticated
using (
  table_session_id is not null and exists (
    select 1 from public.table_session_participants p
    where p.table_session_id = orders.table_session_id and p.user_id = auth.uid()
  )
);

drop policy if exists order_items_select_table_participant on public.order_items;
create policy order_items_select_table_participant on public.order_items
for select to authenticated
using (
  exists (
    select 1 from public.orders o
    join public.table_session_participants p on p.table_session_id = o.table_session_id
    where o.id = order_items.order_id and p.user_id = auth.uid()
  )
);

-- ── 5. customer_open_table_session: register participant, reuse a session ──
-- the caller already joined as a guest (via invite) instead of forking them
-- into a second, isolated session when they later scan the table QR too.
create or replace function public.customer_open_table_session(p_qr_data text)
returns jsonb language plpgsql security definer
set search_path = public, private, pg_temp as $$
declare v_qr public.table_qr_codes; v_table public.tables; v_session public.table_sessions; v_name text;
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

  -- Already joined this table as a guest (via invite link)? Reuse that
  -- shared session instead of creating a second, isolated one.
  select s.* into v_session from public.table_sessions s
    join public.table_session_participants p on p.table_session_id = s.id
    where s.table_id = v_table.id and p.user_id = auth.uid() and s.status = 'active'
    order by s.started_at desc limit 1;

  if v_session.id is null then
    select * into v_session from public.table_sessions
      where table_id = v_table.id and customer_id = auth.uid() and status = 'active'
      order by started_at desc limit 1;
  end if;

  if v_session.id is null then
    insert into public.table_sessions(restaurant_id, table_id, qr_code_id, customer_id, primary_user_id,
      guest_user_ids, guest_count, status, started_at, last_activity, total_orders, total_spent, created_at, updated_at)
    values(v_table.restaurant_id, v_table.id, v_qr.id, auth.uid(), auth.uid(), '[]', 1, 'active', now(), now(), 0, 0, now(), now())
    returning * into v_session;
  else
    update public.table_sessions set last_activity = now(), updated_at = now() where id = v_session.id
    returning * into v_session;
  end if;

  select full_name into v_name from public.profiles where id = auth.uid();
  insert into public.table_session_participants(table_session_id, user_id, display_name, is_host)
    values (v_session.id, auth.uid(), v_name, v_session.customer_id = auth.uid())
    on conflict (table_session_id, user_id) do nothing;

  return jsonb_build_object('restaurantId', v_table.restaurant_id, 'tableId', v_table.id,
    'tableSessionId', v_session.id, 'tableNumber', v_table.table_number);
end $$;

-- ── 6. Invite lifecycle ──────────────────────────────────────────────────────
create or replace function public.customer_create_table_invite(p_table_session_id uuid)
returns text language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_token text := encode(gen_random_bytes(24), 'hex');
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if not exists (
    select 1 from public.table_sessions s
    join public.table_session_participants p on p.table_session_id = s.id
    where s.id = p_table_session_id and p.user_id = auth.uid() and s.status = 'active'
  ) then raise exception 'Table session not accessible' using errcode = 'P0001'; end if;
  insert into public.table_session_invites(table_session_id, token, created_by)
    values (p_table_session_id, v_token, auth.uid());
  return 'https://noowebr.com/t/invite/' || v_token;
end $$;

create or replace function public.customer_join_table_invite(p_token text)
returns jsonb language plpgsql security definer
set search_path = public, private, pg_temp as $$
declare v_invite public.table_session_invites; v_session public.table_sessions; v_table public.tables; v_name text;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select * into v_invite from public.table_session_invites
    where token = p_token and revoked_at is null and expires_at > now();
  if v_invite.id is null then raise exception 'Invalid or expired invitation' using errcode = 'P0001'; end if;
  select * into v_session from public.table_sessions where id = v_invite.table_session_id and status = 'active';
  if v_session.id is null then raise exception 'This table session has ended' using errcode = 'P0001'; end if;
  select * into v_table from public.tables where id = v_session.table_id;

  select full_name into v_name from public.profiles where id = auth.uid();
  insert into public.table_session_participants(table_session_id, user_id, display_name, is_host)
    values (v_session.id, auth.uid(), v_name, false)
    on conflict (table_session_id, user_id) do nothing;

  return jsonb_build_object('restaurantId', v_session.restaurant_id, 'tableId', v_session.table_id,
    'tableSessionId', v_session.id, 'tableNumber', v_table.table_number);
end $$;

-- ── 7. Place order: any participant (not just the original scanner) can order
-- against the shared session; orders stay attributed to whoever placed them
-- (place_order() defaults customer_id to auth.uid()) so the bill can group by
-- participant.
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
    select s.* into v_session from public.table_sessions s
      join public.table_session_participants p on p.table_session_id = s.id
      where s.id = p_table_session_id and s.restaurant_id = p_restaurant_id
        and p.user_id = auth.uid() and s.status = 'active';
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
      table_session_id = v_session.id,
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

-- ── 8. Call waiter: any participant can call, and can pick who they're
-- calling for (waiter / sommelier / help / bill-close request).
-- Adds a 4th parameter, which Postgres treats as a distinct overload — drop
-- the old 3-arg signature first so only one version of this RPC exists.
drop function if exists public.customer_call_waiter(uuid, uuid, text);
create or replace function public.customer_call_waiter(
  p_restaurant_id uuid, p_table_id uuid, p_message text default null, p_call_type text default 'help'
) returns jsonb language plpgsql security definer
set search_path = public, private, pg_temp as $$
declare v_call public.service_calls; v_type text;
begin
  if not exists (
    select 1 from public.restaurants
    where id = p_restaurant_id and is_active
      and service_type in ('fine_dining', 'casual_dining')
  ) then raise exception 'This restaurant does not offer table service' using errcode = 'P0001'; end if;
  v_type := case when p_call_type in ('waiter', 'sommelier', 'help', 'bill') then p_call_type else 'help' end;
  if not exists (
    select 1 from public.table_sessions s
    where s.restaurant_id = p_restaurant_id and s.table_id = p_table_id and s.status = 'active'
      and (
        s.customer_id = auth.uid() or s.primary_user_id = auth.uid()
        or exists (
          select 1 from public.table_session_participants p
          where p.table_session_id = s.id and p.user_id = auth.uid()
        )
      )
  ) then raise exception 'Active table session required' using errcode = 'P0001'; end if;
  select * into v_call from public.service_calls
    where restaurant_id = p_restaurant_id and table_id = p_table_id and user_id = auth.uid()
      and call_type = v_type and status in ('pending','acknowledged')
    order by created_at desc limit 1;
  if v_call.id is null then
    insert into public.service_calls(restaurant_id, table_id, user_id, call_type, status, message,
      called_at, created_at, updated_at)
    values(p_restaurant_id, p_table_id, auth.uid(), v_type, 'pending', nullif(trim(p_message), ''),
      now(), now(), now()) returning * into v_call;
  end if;
  return to_jsonb(v_call);
end $$;

-- ── 9. Bill aggregation for "Minha Comanda" / "Fechar Conta" ────────────────
create or replace function public.customer_get_table_bill(p_table_session_id uuid)
returns jsonb language plpgsql security definer
set search_path = public, private, pg_temp as $$
declare
  v_is_member boolean;
  v_participants jsonb;
  v_items jsonb;
  v_subtotal numeric(10,2);
  v_service_fee_pct numeric;
begin
  select exists (
    select 1 from public.table_session_participants p
    where p.table_session_id = p_table_session_id and p.user_id = auth.uid()
  ) into v_is_member;
  if not v_is_member then raise exception 'Table session not accessible' using errcode = 'P0001'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'userId', p.user_id, 'displayName', p.display_name, 'isHost', p.is_host, 'isMe', p.user_id = auth.uid()
  ) order by p.is_host desc, p.joined_at), '[]'::jsonb) into v_participants
  from public.table_session_participants p where p.table_session_id = p_table_session_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'orderItemId', oi.id, 'orderId', o.id, 'menuItemId', oi.menu_item_id, 'quantity', oi.quantity,
    'unitPrice', oi.unit_price, 'totalPrice', oi.total_price,
    'placedBy', o.customer_id, 'placedByName', coalesce(p.display_name, 'Convidado'),
    'placedByIsMe', o.customer_id = auth.uid(), 'name', mi.name
  ) order by o.created_at), '[]'::jsonb), coalesce(sum(oi.total_price), 0)
  into v_items, v_subtotal
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  left join public.menu_items mi on mi.id = oi.menu_item_id
  left join public.table_session_participants p on p.table_session_id = o.table_session_id and p.user_id = o.customer_id
  where o.table_session_id = p_table_session_id;

  select coalesce((r.service_config->>'service_fee_percent')::numeric, 10)
    into v_service_fee_pct
  from public.table_sessions s join public.restaurants r on r.id = s.restaurant_id
  where s.id = p_table_session_id;

  return jsonb_build_object(
    'tableSessionId', p_table_session_id,
    'participants', v_participants,
    'items', v_items,
    'subtotal', v_subtotal,
    'serviceFeePercent', v_service_fee_pct,
    'serviceFee', round(v_subtotal * v_service_fee_pct / 100, 2)
  );
end $$;

-- ── Grants ────────────────────────────────────────────────────────────────────
revoke all on function public.customer_create_table_invite(uuid) from public;
revoke all on function public.customer_join_table_invite(text) from public;
revoke all on function public.customer_get_table_bill(uuid) from public;
grant execute on function public.customer_create_table_invite(uuid) to authenticated;
grant execute on function public.customer_join_table_invite(text) to authenticated;
grant execute on function public.customer_get_table_bill(uuid) to authenticated;
grant execute on function public.customer_open_table_session(text) to authenticated;
grant execute on function public.customer_place_order(uuid,uuid,jsonb,uuid) to authenticated;
grant execute on function public.customer_call_waiter(uuid,uuid,text,text) to authenticated;
