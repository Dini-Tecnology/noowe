-- Casual Dining: discovery, live status and family/group ordering.
--
-- The casual_dining service type was already accepted everywhere (restaurants,
-- reservations, waitlist, call waiter), but the experience that defines it had
-- no backing data:
--   1. Discovery filters (Kids, Pet Friendly, Ao ar livre, Estacionamento,
--      Acessível) — the client had no queryable amenity vocabulary, only the
--      free-text service_config.amenities array rendered as chips.
--   2. "Status Agora" (lotação / espera / aberto até) on the restaurant page —
--      customer_waitlist_stats covered occupancy and wait, but nothing told the
--      client whether the restaurant is open right now and until when, and
--      there was no way to fetch that for a whole discovery list at once.
--   3. Kids menu — no flag separating a kids dish from the rest of the menu.
--   4. "Quem está pedindo?" — a family table has diners who are not app users
--      (kids, relatives without the app). table_session_participants could only
--      hold authenticated users, and order_items had no per-diner attribution,
--      so the comanda could only be grouped by *who tapped the button*.
--
-- This migration adds the data model and RPCs for all four, plus the
-- restaurant-side configuration and per-diner bill that mirror them.

-- ── 1. Kids menu flag ────────────────────────────────────────────────────────
alter table public.menu_items add column if not exists is_kids_friendly boolean not null default false;
create index if not exists idx_menu_items_kids_friendly
  on public.menu_items(restaurant_id) where is_kids_friendly;

-- ── 2. Amenity filtering ─────────────────────────────────────────────────────
-- Discovery filters are served by a jsonb containment match against
-- service_config @> '{"amenities": ["kids_friendly"]}', so the list query stays
-- a single indexed PostgREST call instead of client-side filtering.
create index if not exists idx_restaurants_service_config_gin
  on public.restaurants using gin (service_config jsonb_path_ops);

-- ── 3. Table diners (family/group roster) ────────────────────────────────────
-- A participant row now represents a *seat*, not necessarily an account:
--   user_id not null  → an app user who scanned the QR or accepted an invite
--   user_id null      → a companion added by someone at the table (a kid, a
--                       relative without the app). Only the roster owner's
--                       session can see or bill them.
alter table public.table_session_participants alter column user_id drop not null;
alter table public.table_session_participants add column if not exists is_kid boolean not null default false;
alter table public.table_session_participants add column if not exists added_by uuid references public.profiles(id) on delete set null;

-- The old constraint would collapse every companion row into one (NULL user_id
-- is distinct in a unique index, but the table constraint is dropped anyway so
-- ON CONFLICT inference below matches the partial index).
alter table public.table_session_participants
  drop constraint if exists table_session_participants_table_session_id_user_id_key;
create unique index if not exists idx_table_session_participants_session_user
  on public.table_session_participants(table_session_id, user_id)
  where user_id is not null;

-- ── 4. Per-diner attribution on order items ─────────────────────────────────
alter table public.order_items add column if not exists diner_id uuid
  references public.table_session_participants(id) on delete set null;
create index if not exists idx_order_items_diner_id on public.order_items(diner_id);

-- ── 5. place_order persists the diner each item was ordered for ─────────────
-- The caller is responsible for validating that the diner belongs to the
-- session (customer_place_order does, below); place_order only records it.
create or replace function public.place_order(
  p_restaurant_id uuid,
  p_order_type text,
  p_items jsonb,
  p_table_id uuid default null,
  p_delivery_address jsonb default null,
  p_special_instructions text default null,
  p_customer_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_customer_id uuid;
  v_order_id uuid;
  v_item jsonb;
  v_menu_item public.menu_items%rowtype;
  v_quantity integer;
  v_unit_price numeric(10,2);
  v_subtotal numeric(10,2) := 0;
  v_item_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  -- Resolve who the order is placed for. Staff can place an order on behalf
  -- of a guest without an account (e.g. a table without the app); anyone
  -- else can only place orders for themselves.
  if p_customer_id is not null and p_customer_id <> auth.uid() then
    perform private.require_restaurant_role(
      p_restaurant_id,
      array['owner','manager','waiter','maitre']::public.user_roles_role_enum[]
    );
    v_customer_id := p_customer_id;
  else
    v_customer_id := auth.uid();
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Order must contain at least one item' using errcode = '22023';
  end if;

  insert into public.orders (
    restaurant_id, customer_id, order_type, table_id, delivery_address,
    status, special_instructions
  )
  values (
    p_restaurant_id, v_customer_id, coalesce(p_order_type, 'dine_in')::public.orders_order_type_enum,
    p_table_id, p_delivery_address, 'pending', p_special_instructions
  )
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_quantity := greatest(1, coalesce((v_item->>'quantity')::integer, 1));

    select * into v_menu_item
    from public.menu_items
    where id = (v_item->>'menu_item_id')::uuid
      and restaurant_id = p_restaurant_id
      and is_available;

    if v_menu_item.id is null then
      raise exception 'Menu item % is not available at this restaurant', (v_item->>'menu_item_id')
        using errcode = '22023';
    end if;

    v_unit_price := v_menu_item.price;

    insert into public.order_items (
      order_id, menu_item_id, quantity, unit_price, total_price,
      special_instructions, customizations, diner_id
    )
    values (
      v_order_id, v_menu_item.id, v_quantity, v_unit_price, v_unit_price * v_quantity,
      v_item->>'special_instructions',
      v_item->'customizations',
      nullif(v_item->>'diner_id', '')::uuid
    );

    v_subtotal := v_subtotal + (v_unit_price * v_quantity);
    v_item_count := v_item_count + 1;
  end loop;

  update public.orders
  set subtotal = v_subtotal,
      total_amount = v_subtotal,
      updated_at = now()
  where id = v_order_id;

  return jsonb_build_object(
    'id', v_order_id,
    'restaurant_id', p_restaurant_id,
    'customer_id', v_customer_id,
    'table_id', p_table_id,
    'status', 'pending',
    'subtotal', v_subtotal,
    'total_amount', v_subtotal,
    'order_items', private.order_items_json(v_order_id)
  );
end;
$$;

-- Kitchen/waiter payloads carry the diner so a family order can be plated and
-- delivered to the right person ("Mini Pizza — Sofia").
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
        'created_at', oi.created_at,
        'diner_id', oi.diner_id,
        'diner_name', d.display_name,
        'diner_is_kid', coalesce(d.is_kid, false)
      )
      order by oi.created_at asc
    ),
    '[]'::jsonb
  )
  from public.order_items oi
  left join public.menu_items mi on mi.id = oi.menu_item_id
  left join public.table_session_participants d on d.id = oi.diner_id
  where oi.order_id = target_order_id;
$$;

-- ── 6. Session RPCs updated for the partial unique index ────────────────────
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

  update public.table_sessions
  set status = 'ended', ended_at = now(), updated_at = now()
  where table_id = v_table.id and customer_id = auth.uid() and status = 'active'
    and last_activity < now() - interval '6 hours';

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
    on conflict (table_session_id, user_id) where user_id is not null do nothing;

  return jsonb_build_object('restaurantId', v_table.restaurant_id, 'tableId', v_table.id,
    'tableSessionId', v_session.id, 'tableNumber', v_table.table_number);
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
    on conflict (table_session_id, user_id) where user_id is not null do nothing;

  return jsonb_build_object('restaurantId', v_session.restaurant_id, 'tableId', v_session.table_id,
    'tableSessionId', v_session.id, 'tableNumber', v_table.table_number);
end $$;

-- ── 7. Companion roster ─────────────────────────────────────────────────────
create or replace function public.customer_list_table_diners(p_table_session_id uuid)
returns jsonb language plpgsql stable security definer
set search_path = public, private, pg_temp as $$
declare v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if not private.is_table_session_participant(p_table_session_id) then
    raise exception 'Table session not accessible' using errcode = 'P0001';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'userId', p.user_id,
    'displayName', coalesce(p.display_name, 'Convidado'),
    'isHost', p.is_host,
    'isKid', p.is_kid,
    'isMe', p.user_id is not null and p.user_id = auth.uid(),
    'isCompanion', p.user_id is null
  ) order by p.is_host desc, p.joined_at), '[]'::jsonb)
  into v_result
  from public.table_session_participants p
  where p.table_session_id = p_table_session_id;

  return v_result;
end $$;

create or replace function public.customer_add_table_companion(
  p_table_session_id uuid, p_name text, p_is_kid boolean default false
) returns jsonb language plpgsql security definer
set search_path = public, private, pg_temp as $$
declare v_name text := nullif(trim(coalesce(p_name, '')), ''); v_diner public.table_session_participants; v_count integer;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if v_name is null then raise exception 'Informe o nome da pessoa' using errcode = '22023'; end if;
  if length(v_name) > 40 then raise exception 'Nome muito longo' using errcode = '22023'; end if;
  if not exists (
    select 1 from public.table_sessions s
    where s.id = p_table_session_id and s.status = 'active'
  ) then raise exception 'This table session has ended' using errcode = 'P0001'; end if;
  if not private.is_table_session_participant(p_table_session_id) then
    raise exception 'Table session not accessible' using errcode = 'P0001';
  end if;

  select count(*) into v_count from public.table_session_participants
    where table_session_id = p_table_session_id;
  if v_count >= 20 then raise exception 'Limite de pessoas na mesa atingido' using errcode = 'P0001'; end if;

  insert into public.table_session_participants(
    table_session_id, user_id, display_name, is_host, is_kid, added_by
  ) values (p_table_session_id, null, v_name, false, coalesce(p_is_kid, false), auth.uid())
  returning * into v_diner;

  update public.table_sessions
  set guest_count = greatest(guest_count, v_count + 1), last_activity = now(), updated_at = now()
  where id = p_table_session_id;

  return jsonb_build_object(
    'id', v_diner.id, 'userId', null, 'displayName', v_diner.display_name,
    'isHost', false, 'isKid', v_diner.is_kid, 'isMe', false, 'isCompanion', true
  );
end $$;

create or replace function public.customer_remove_table_companion(p_diner_id uuid)
returns void language plpgsql security definer
set search_path = public, private, pg_temp as $$
declare v_diner public.table_session_participants;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select * into v_diner from public.table_session_participants where id = p_diner_id;
  if v_diner.id is null then raise exception 'Pessoa não encontrada na mesa' using errcode = 'P0001'; end if;
  if v_diner.user_id is not null then
    raise exception 'Só é possível remover acompanhantes adicionados na mesa' using errcode = 'P0001';
  end if;
  if not private.is_table_session_participant(v_diner.table_session_id) then
    raise exception 'Table session not accessible' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.order_items where diner_id = p_diner_id) then
    raise exception 'Esta pessoa já tem itens na comanda' using errcode = 'P0001';
  end if;

  delete from public.table_session_participants where id = p_diner_id;
end $$;

-- ── 8. Ordering validates the diner belongs to the session ──────────────────
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
  v_items jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;

  select * into v_existing from public.orders
  where customer_id = auth.uid() and client_request_id = p_client_request_id;
  if v_existing.id is not null then
    select jsonb_build_object(
      'id', o.id,
      'restaurant_id', o.restaurant_id,
      'table_id', o.table_id,
      'status', o.status,
      'subtotal', o.subtotal,
      'total_amount', o.total_amount,
      'order_items', private.order_items_json(o.id)
    ) into v_result
    from public.orders o
    where o.id = v_existing.id;
    return v_result;
  end if;

  if not exists (
    select 1 from public.restaurants r
    where r.id = p_restaurant_id and r.is_active
      and r.service_type in ('fine_dining', 'casual_dining', 'quick_service')
      and coalesce((r.service_config->'feature_overrides'->>'ordering')::boolean, true)
      and coalesce((r.settings->'customer_experience'->>'journeyOrder')::boolean, true)
  ) then raise exception 'Ordering is unavailable for this restaurant' using errcode = 'P0001'; end if;

  if p_table_session_id is not null then
    select s.* into v_session from public.table_sessions s
    join public.table_session_participants p on p.table_session_id = s.id
    join public.restaurants r on r.id = s.restaurant_id
    where s.id = p_table_session_id and s.restaurant_id = p_restaurant_id
      and p.user_id = auth.uid() and s.status = 'active'
      and r.service_type in ('fine_dining', 'casual_dining')
      and coalesce((r.service_config->'feature_overrides'->>'qrOrdering')::boolean, true)
      and coalesce((r.settings->'customer_experience'->>'qrOrdering')::boolean, true);
    if v_session.id is null then raise exception 'Active table session required' using errcode = 'P0001'; end if;
    v_order_type := 'dine_in';
    v_table_id := v_session.table_id;
  else
    if not exists (
      select 1 from public.restaurants r
      where r.id = p_restaurant_id and r.is_active and r.service_type = 'quick_service'
    ) then raise exception 'Active table session required' using errcode = 'P0001'; end if;
    v_order_type := 'pickup';
    v_table_id := null;
  end if;

  -- A diner is only meaningful inside the session it belongs to. Anything else
  -- (another table's roster, a stale id from a closed session) is dropped
  -- rather than rejected: the item is still ordered, just unattributed.
  select coalesce(jsonb_agg(
    case
      when item->>'diner_id' is null then item
      when v_session.id is not null and exists (
        select 1 from public.table_session_participants d
        where d.id = (item->>'diner_id')::uuid and d.table_session_id = v_session.id
      ) then item
      else item - 'diner_id'
    end
    order by ordinality
  ), '[]'::jsonb)
  into v_items
  from jsonb_array_elements(p_items) with ordinality as t(item, ordinality);

  v_result := public.place_order(p_restaurant_id, v_order_type, v_items, v_table_id, null, null, null);
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
    update public.table_sessions
    set total_orders = total_orders + 1, last_activity = now(), updated_at = now()
    where id = v_session.id;
  end if;

  return v_result;
end $$;

-- ── 9. Bill grouped by diner (client "Comanda") ─────────────────────────────
create or replace function public.customer_get_table_bill(p_table_session_id uuid)
returns jsonb language plpgsql security definer
set search_path = public, private, pg_temp as $$
declare
  v_participants jsonb;
  v_items jsonb;
  v_subtotal numeric(10,2);
  v_service_fee_pct numeric;
begin
  if not private.is_table_session_participant(p_table_session_id) then
    raise exception 'Table session not accessible' using errcode = 'P0001';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'dinerId', p.id, 'userId', p.user_id, 'displayName', coalesce(p.display_name, 'Convidado'),
    'isHost', p.is_host, 'isKid', p.is_kid,
    'isMe', p.user_id is not null and p.user_id = auth.uid(),
    'isCompanion', p.user_id is null
  ) order by p.is_host desc, p.joined_at), '[]'::jsonb) into v_participants
  from public.table_session_participants p where p.table_session_id = p_table_session_id;

  -- Attribution falls back to whoever placed the order, so orders created
  -- before per-diner ordering existed still land on a person.
  select coalesce(jsonb_agg(jsonb_build_object(
    'orderItemId', oi.id, 'orderId', o.id, 'menuItemId', oi.menu_item_id, 'quantity', oi.quantity,
    'unitPrice', oi.unit_price, 'totalPrice', oi.total_price,
    'placedBy', o.customer_id, 'placedByName', coalesce(placer.display_name, 'Convidado'),
    'placedByIsMe', o.customer_id = auth.uid(),
    'dinerId', coalesce(oi.diner_id, placer.id),
    'dinerName', coalesce(diner.display_name, placer.display_name, 'Convidado'),
    'dinerIsKid', coalesce(diner.is_kid, false),
    'status', oi.status,
    'specialInstructions', oi.special_instructions,
    'imageUrl', mi.image_url,
    'description', mi.description,
    'name', mi.name
  ) order by o.created_at), '[]'::jsonb), coalesce(sum(oi.total_price), 0)
  into v_items, v_subtotal
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  left join public.menu_items mi on mi.id = oi.menu_item_id
  left join public.table_session_participants placer
    on placer.table_session_id = o.table_session_id and placer.user_id = o.customer_id
  left join public.table_session_participants diner on diner.id = oi.diner_id
  where o.table_session_id = p_table_session_id
    and o.status <> 'cancelled';

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

-- ── 10. Live restaurant status (open now / occupancy / wait) ────────────────
create or replace function private.restaurant_live_status(p_restaurant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_time_zone constant text := 'America/Sao_Paulo';
  v_weekdays constant text[] := array['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  v_now timestamp;
  v_today jsonb;
  v_yesterday jsonb;
  v_open time;
  v_close time;
  v_is_open boolean := false;
  v_closes_at text;
  v_opens_at text;
  v_hours jsonb;
  v_groups_waiting integer;
  v_manual_avg numeric;
  v_estimated_wait integer;
  v_tables_total integer;
  v_tables_occupied integer;
  v_occupancy_ratio numeric;
  v_occupancy_level text;
begin
  select coalesce(r.opening_hours, '{}'::jsonb) into v_hours
  from public.restaurants r where r.id = p_restaurant_id and r.is_active;
  if not found then return null; end if;

  v_now := (now() at time zone v_time_zone);
  v_today := v_hours -> v_weekdays[extract(dow from v_now)::int + 1];
  v_yesterday := v_hours -> v_weekdays[((extract(dow from v_now)::int + 6) % 7) + 1];

  if v_today is not null and coalesce((v_today->>'closed')::boolean, false) = false
    and nullif(v_today->>'open', '') is not null and nullif(v_today->>'close', '') is not null then
    v_open := (v_today->>'open')::time;
    v_close := (v_today->>'close')::time;
    v_opens_at := to_char(v_open, 'HH24:MI');
    if v_close > v_open then
      v_is_open := v_now::time >= v_open and v_now::time < v_close;
    else
      -- Closes after midnight: today's slot runs until tomorrow's clock time.
      v_is_open := v_now::time >= v_open;
    end if;
    if v_is_open then v_closes_at := to_char(v_close, 'HH24:MI'); end if;
  end if;

  -- Still inside yesterday's after-midnight slot (e.g. 19:00–01:00).
  if not v_is_open and v_yesterday is not null
    and coalesce((v_yesterday->>'closed')::boolean, false) = false
    and nullif(v_yesterday->>'open', '') is not null and nullif(v_yesterday->>'close', '') is not null then
    v_open := (v_yesterday->>'open')::time;
    v_close := (v_yesterday->>'close')::time;
    if v_close < v_open and v_now::time < v_close then
      v_is_open := true;
      v_closes_at := to_char(v_close, 'HH24:MI');
    end if;
  end if;

  select count(*) into v_groups_waiting
    from public.waitlist_entries
    where restaurant_id = p_restaurant_id and status = 'waiting';

  select avg(estimated_wait_minutes) into v_manual_avg
    from public.waitlist_entries
    where restaurant_id = p_restaurant_id and status = 'waiting' and estimated_wait_minutes is not null;

  select count(*), count(*) filter (where status = 'occupied')
    into v_tables_total, v_tables_occupied
    from public.tables
    where restaurant_id = p_restaurant_id;

  v_occupancy_ratio := case when coalesce(v_tables_total, 0) = 0 then null
    else v_tables_occupied::numeric / v_tables_total end;

  -- With no manual estimate, wait grows with both the queue and how full the
  -- room already is — an empty room seats a walk-in immediately.
  v_estimated_wait := coalesce(
    ceil(v_manual_avg)::integer,
    case
      when v_groups_waiting = 0 and coalesce(v_occupancy_ratio, 0) < 0.75 then 0
      else least(90, greatest(5, v_groups_waiting * 8 + round(coalesce(v_occupancy_ratio, 0) * 20)::integer))
    end
  );

  v_occupancy_level := case
    when v_occupancy_ratio is null then 'indisponivel'
    when v_occupancy_ratio >= 0.75 then 'alta'
    when v_occupancy_ratio >= 0.4 then 'media'
    else 'baixa'
  end;

  return jsonb_build_object(
    'restaurantId', p_restaurant_id,
    'isOpen', v_is_open,
    'opensAt', v_opens_at,
    'closesAt', v_closes_at,
    'groupsWaiting', v_groups_waiting,
    'estimatedWaitMinutes', v_estimated_wait,
    'occupancyLevel', v_occupancy_level,
    'occupancyRatio', v_occupancy_ratio,
    'occupancyPercent', case when v_occupancy_ratio is null then null else round(v_occupancy_ratio * 100)::integer end,
    'tablesTotal', v_tables_total,
    'tablesOccupied', v_tables_occupied
  );
end $$;

create or replace function public.customer_restaurant_live_status(p_restaurant_id uuid)
returns jsonb language sql stable security definer
set search_path = public, private, pg_temp as $$
  select private.restaurant_live_status(p_restaurant_id);
$$;

-- Discovery lists need the same status for every card without N round trips.
create or replace function public.customer_restaurants_live_status(p_restaurant_ids uuid[])
returns jsonb language sql stable security definer
set search_path = public, private, pg_temp as $$
  select coalesce(jsonb_agg(status), '[]'::jsonb)
  from (
    select private.restaurant_live_status(id) as status
    from unnest(coalesce(p_restaurant_ids, array[]::uuid[])) as id
    limit 60
  ) rows
  where status is not null;
$$;

-- ── 11. Restaurant-side casual dining configuration ─────────────────────────
-- The amenity vocabulary is closed: the customer app renders each key with its
-- own label/icon, and the discovery filters query them by containment.
create or replace function private.casual_dining_amenity_keys()
returns text[] language sql immutable as $$
  select array[
    'kids_friendly', 'pet_friendly', 'outdoor_seating', 'parking', 'accessible',
    'table_service', 'optional_reservation', 'large_groups', 'high_chair',
    'wifi', 'air_conditioning', 'live_music'
  ];
$$;

create or replace function public.restaurant_get_casual_dining_config(p_restaurant_id uuid)
returns jsonb language plpgsql stable security definer
set search_path = public, private, pg_temp as $$
declare v_restaurant public.restaurants; v_metadata jsonb;
begin
  perform private.require_restaurant_role(
    p_restaurant_id,
    array['owner','manager']::public.user_roles_role_enum[]
  );
  select * into v_restaurant from public.restaurants where id = p_restaurant_id;
  if v_restaurant.id is null then raise exception 'Restaurant not found' using errcode = 'P0001'; end if;

  select c.config_metadata into v_metadata
  from public.restaurant_service_configs c
  where c.restaurant_id = p_restaurant_id and c.service_type = 'casual_dining';

  return jsonb_build_object(
    'restaurantId', p_restaurant_id,
    'serviceType', v_restaurant.service_type,
    'amenities', coalesce(v_restaurant.service_config->'amenities', '[]'::jsonb),
    'config', coalesce(v_restaurant.service_config->'casual_dining', coalesce(v_metadata->'casual_dining', '{}'::jsonb))
  );
end $$;

create or replace function public.restaurant_update_casual_dining_config(
  p_restaurant_id uuid, p_amenities text[], p_config jsonb
) returns jsonb language plpgsql security definer
set search_path = public, private, pg_temp as $$
declare v_amenities jsonb; v_config jsonb; v_invalid text;
begin
  perform private.require_restaurant_role(
    p_restaurant_id,
    array['owner','manager']::public.user_roles_role_enum[]
  );

  select a into v_invalid
  from unnest(coalesce(p_amenities, array[]::text[])) a
  where not (a = any(private.casual_dining_amenity_keys()))
  limit 1;
  if v_invalid is not null then
    raise exception 'Comodidade desconhecida: %', v_invalid using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(distinct a), '[]'::jsonb) into v_amenities
  from unnest(coalesce(p_amenities, array[]::text[])) a;

  v_config := coalesce(p_config, '{}'::jsonb);
  if jsonb_typeof(v_config) <> 'object' then
    raise exception 'Configuração inválida' using errcode = '22023';
  end if;

  update public.restaurants
  set service_config = coalesce(service_config, '{}'::jsonb)
        || jsonb_build_object('amenities', v_amenities, 'casual_dining', v_config),
      updated_at = now()
  where id = p_restaurant_id;

  update public.restaurant_service_configs
  set config_metadata = coalesce(config_metadata, '{}'::jsonb)
        || jsonb_build_object('casual_dining', v_config, 'amenities', v_amenities),
      updated_at = now()
  where restaurant_id = p_restaurant_id and service_type = 'casual_dining';

  if not found then
    insert into public.restaurant_service_configs (
      restaurant_id, service_type, is_active, config_metadata, created_at, updated_at
    ) values (
      p_restaurant_id, 'casual_dining',
      exists (select 1 from public.restaurants where id = p_restaurant_id and service_type = 'casual_dining'),
      jsonb_build_object('casual_dining', v_config, 'amenities', v_amenities), now(), now()
    );
  end if;

  return public.restaurant_get_casual_dining_config(p_restaurant_id);
end $$;

-- ── 12. Staff view of the per-diner comanda ─────────────────────────────────
create or replace function public.restaurant_get_table_bill(p_table_id uuid)
returns jsonb language plpgsql stable security definer
set search_path = public, private, pg_temp as $$
declare
  v_restaurant_id uuid;
  v_session public.table_sessions;
  v_diners jsonb;
  v_items jsonb;
  v_subtotal numeric(10,2);
begin
  select restaurant_id into v_restaurant_id from public.tables where id = p_table_id;
  if v_restaurant_id is null then raise exception 'Mesa não encontrada' using errcode = 'P0001'; end if;
  perform private.require_restaurant_role(
    v_restaurant_id,
    array['owner','manager','maitre','waiter']::public.user_roles_role_enum[]
  );

  select * into v_session from public.table_sessions
  where table_id = p_table_id and status = 'active'
  order by started_at desc limit 1;

  if v_session.id is null then
    return jsonb_build_object('tableId', p_table_id, 'tableSessionId', null,
      'diners', '[]'::jsonb, 'items', '[]'::jsonb, 'subtotal', 0);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'dinerId', p.id, 'displayName', coalesce(p.display_name, 'Convidado'),
    'isHost', p.is_host, 'isKid', p.is_kid, 'isCompanion', p.user_id is null
  ) order by p.is_host desc, p.joined_at), '[]'::jsonb) into v_diners
  from public.table_session_participants p where p.table_session_id = v_session.id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'orderItemId', oi.id, 'orderId', o.id, 'name', coalesce(mi.name, 'Item'),
    'quantity', oi.quantity, 'totalPrice', oi.total_price, 'status', oi.status,
    'specialInstructions', oi.special_instructions,
    'dinerId', coalesce(oi.diner_id, placer.id),
    'dinerName', coalesce(diner.display_name, placer.display_name, 'Convidado'),
    'dinerIsKid', coalesce(diner.is_kid, false)
  ) order by o.created_at), '[]'::jsonb), coalesce(sum(oi.total_price), 0)
  into v_items, v_subtotal
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  left join public.menu_items mi on mi.id = oi.menu_item_id
  left join public.table_session_participants placer
    on placer.table_session_id = o.table_session_id and placer.user_id = o.customer_id
  left join public.table_session_participants diner on diner.id = oi.diner_id
  where o.table_session_id = v_session.id and o.status <> 'cancelled';

  return jsonb_build_object(
    'tableId', p_table_id,
    'tableSessionId', v_session.id,
    'diners', v_diners,
    'items', v_items,
    'subtotal', v_subtotal
  );
end $$;

-- ── Grants ──────────────────────────────────────────────────────────────────
revoke all on function private.restaurant_live_status(uuid) from public;
grant execute on function private.restaurant_live_status(uuid) to authenticated, service_role;

revoke all on function public.customer_list_table_diners(uuid) from public;
revoke all on function public.customer_add_table_companion(uuid, text, boolean) from public;
revoke all on function public.customer_remove_table_companion(uuid) from public;
revoke all on function public.customer_restaurant_live_status(uuid) from public;
revoke all on function public.customer_restaurants_live_status(uuid[]) from public;
revoke all on function public.restaurant_get_casual_dining_config(uuid) from public;
revoke all on function public.restaurant_update_casual_dining_config(uuid, text[], jsonb) from public;
revoke all on function public.restaurant_get_table_bill(uuid) from public;

grant execute on function public.customer_list_table_diners(uuid) to authenticated;
grant execute on function public.customer_add_table_companion(uuid, text, boolean) to authenticated;
grant execute on function public.customer_remove_table_companion(uuid) to authenticated;
grant execute on function public.customer_restaurant_live_status(uuid) to anon, authenticated;
grant execute on function public.customer_restaurants_live_status(uuid[]) to anon, authenticated;
grant execute on function public.restaurant_get_casual_dining_config(uuid) to authenticated, service_role;
grant execute on function public.restaurant_update_casual_dining_config(uuid, text[], jsonb) to authenticated, service_role;
grant execute on function public.restaurant_get_table_bill(uuid) to authenticated, service_role;
grant execute on function public.customer_open_table_session(text) to authenticated;
grant execute on function public.customer_join_table_invite(text) to authenticated;
grant execute on function public.customer_place_order(uuid, uuid, jsonb, uuid) to authenticated;
grant execute on function public.customer_get_table_bill(uuid) to authenticated;
grant execute on function public.place_order(uuid, text, jsonb, uuid, jsonb, text, uuid) to authenticated, service_role;
