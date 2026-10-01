-- Complete the explicitly simulated table checkout atomically. Amount allocation
-- uses integer cents; numeric reais are only the existing receipt/RPC boundary.
create table public.table_payment_allocations (
  gateway_transaction_id uuid not null references public.gateway_transactions(id),
  order_item_id uuid not null references public.order_items(id),
  amount_cents bigint not null check (amount_cents > 0),
  primary key (gateway_transaction_id, order_item_id)
);
create index table_payment_allocations_item_idx on public.table_payment_allocations(order_item_id);
alter table public.table_payment_allocations enable row level security;
revoke all on public.table_payment_allocations from anon, authenticated;

-- One definition of outstanding consumption for payment, QR switching and bills.
create or replace function private.table_unpaid_items(p_session uuid)
returns table (item_id uuid, order_id uuid, customer_id uuid, remaining_cents bigint)
language sql stable security definer set search_path = public, private, pg_temp as $$
  select oi.id, o.id, o.customer_id,
    greatest(0, round(oi.total_price * 100)::bigint - coalesce((
      select sum(a.amount_cents)::bigint from public.table_payment_allocations a
      join public.gateway_transactions gt on gt.id = a.gateway_transaction_id
      where a.order_item_id = oi.id and gt.status = 'completed'
    ), 0))
  from public.order_items oi join public.orders o on o.id = oi.order_id
  where o.table_session_id = p_session and o.status::text not in ('cancelled', 'completed')
    and not exists (
      select 1 from public.gateway_transactions gt
      where gt.status = 'completed' and gt.provider <> 'simulated'
        and (gt.order_id = o.id or gt.metadata->'order_ids' @> to_jsonb(array[o.id]))
    );
$$;
revoke all on function private.table_unpaid_items(uuid) from public, anon, authenticated;

create or replace function private.apply_customer_wallet_payment()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_wallet_id uuid;
  v_wallet public.wallets;
  v_amount numeric := abs(coalesce(new.amount, new.amount_cents / 100));
  v_cashback_percentage numeric;
  v_cashback numeric;
  v_restaurant_name text;
begin
  if new.provider = 'simulated' then return new; end if;
  if new.customer_id is null or new.status <> 'completed' or v_amount <= 0 then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'completed' then return new; end if;

  v_wallet_id := private.ensure_customer_wallet(new.customer_id);
  select * into v_wallet from public.wallets where id = v_wallet_id for update;
  select name into v_restaurant_name from public.restaurants where id = new.restaurant_id;

  if new.payment_method = 'wallet' and not exists (
    select 1 from public.wallet_transactions
    where wallet_id = v_wallet_id and idempotency_key = 'wallet-payment:' || new.id::text
  ) then
    if v_wallet.balance < v_amount then
      raise exception 'Insufficient wallet balance' using errcode = 'P0001';
    end if;
    update public.wallets set balance = balance - v_amount, updated_at = now() where id = v_wallet_id;
    insert into public.wallet_transactions(
      wallet_id, transaction_type, amount, balance_before, balance_after,
      description, order_id, external_transaction_id, idempotency_key, metadata
    ) values (
      v_wallet_id, 'payment', -v_amount, v_wallet.balance, v_wallet.balance - v_amount,
      coalesce(v_restaurant_name, 'Pagamento'), new.order_id, new.id,
      'wallet-payment:' || new.id::text, jsonb_build_object('gateway_transaction_id', new.id)
    );
    v_wallet.balance := v_wallet.balance - v_amount;
  end if;

  select lc.cashback_percentage into v_cashback_percentage
  from public.loyalty_configs lc
  where lc.restaurant_id = new.restaurant_id and lc.cashback_enabled
  order by lc.updated_at desc limit 1;
  v_cashback := round(v_amount * coalesce(v_cashback_percentage, 0) / 100, 2);

  if v_cashback > 0 and not exists (
    select 1 from public.wallet_transactions
    where wallet_id = v_wallet_id and idempotency_key = 'cashback:' || new.id::text
  ) then
    update public.wallets set balance = balance + v_cashback, updated_at = now() where id = v_wallet_id;
    insert into public.wallet_transactions(
      wallet_id, transaction_type, amount, balance_before, balance_after,
      description, order_id, external_transaction_id, idempotency_key, metadata
    ) values (
      v_wallet_id, 'cashback', v_cashback, v_wallet.balance, v_wallet.balance + v_cashback,
      'Cashback recebido', new.order_id, new.id, 'cashback:' || new.id::text,
      jsonb_build_object('gateway_transaction_id', new.id, 'restaurant_name', v_restaurant_name)
    );
  end if;
  return new;
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

  if exists (select 1 from private.table_unpaid_items(p_table_session_id)
    where customer_id = auth.uid() and remaining_cents > 0) then
    raise exception 'Quite sua parte da conta antes de sair da mesa' using errcode = 'P0004';
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
    -- Release empty or settled sessions, including their paid order history.
    if not exists (select 1 from private.table_unpaid_items(p_table_session_id) where remaining_cents > 0) then
      update public.table_sessions
      set status = 'ended', ended_at = now(), last_activity = now(), updated_at = now()
      where id = p_table_session_id;

      if not exists (select 1 from public.orders where table_session_id = p_table_session_id) and exists (
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
        update public.reservations set status = 'completed', updated_at = now()
        where table_id = v_session.table_id and status::text = 'seated';
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

revoke all on function public.customer_leave_table_session(uuid) from public;
grant execute on function public.customer_leave_table_session(uuid) to authenticated;

-- Preserve the old six-argument contract while adding item selection.
drop function public.customer_pay_table_bill(uuid, numeric, text, numeric, text, uuid);
create function public.customer_pay_table_bill(
  p_table_session_id uuid, p_tip_percent numeric default 0,
  p_payment_method text default 'pix', p_base_amount numeric default null,
  p_split_mode text default 'mine', p_idempotency_key uuid default null,
  p_item_ids uuid[] default null
) returns jsonb language plpgsql security definer
set search_path = public, private, pg_temp as $$
declare
  v_session public.table_sessions;
  v_key text;
  v_result jsonb;
  v_tx uuid;
  v_receipt uuid;
  v_available bigint;
  v_base bigint;
  v_remaining bigint;
  v_part bigint;
  v_fee bigint;
  v_tip bigint;
  v_fee_pct numeric;
  v_prior_base bigint;
  v_prior_fee bigint;
  v_item record;
  v_items jsonb := '[]';
  v_order uuid;
  v_released boolean;
  v_closed boolean;
  v_payers integer;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_idempotency_key is null then raise exception 'Idempotency key required' using errcode = '22023'; end if;
  v_key := 'table-checkout:' || auth.uid() || ':' || p_idempotency_key;
  perform pg_advisory_xact_lock(hashtextextended(v_key, 0));
  select gt.metadata->'result' into v_result from public.gateway_transactions gt
  where gt.idempotency_key = v_key and gt.customer_id = auth.uid();
  if v_result is not null then return v_result || jsonb_build_object('idempotentReplay', true); end if;

  select * into v_session from public.table_sessions where id = p_table_session_id for update;
  if v_session.id is null or v_session.status <> 'active'
    or not private.is_table_session_participant(p_table_session_id) then
    raise exception 'Table session not accessible' using errcode = 'P0001';
  end if;
  if p_tip_percent is null or p_tip_percent < 0 or p_tip_percent > 30
    or p_tip_percent::text = 'NaN'
    or p_payment_method is null or p_payment_method not in ('pix','credit_card','debit_card','apple_pay','google_pay','tap_to_pay','wallet')
    or p_split_mode is null or p_split_mode not in ('mine','equal','byItem','fixed') then
    raise exception 'Invalid payment options' using errcode = '22023';
  end if;
  if p_split_mode = 'byItem' and (coalesce(cardinality(p_item_ids), 0) = 0 or exists (
    select 1 from unnest(p_item_ids) id where not exists (
      select 1 from private.table_unpaid_items(p_table_session_id) u where u.item_id = id and u.remaining_cents > 0
    )
  )) then raise exception 'Selecione itens ainda não pagos desta mesa' using errcode = '22023'; end if;

  select coalesce(sum(remaining_cents), 0)::bigint into v_available
  from private.table_unpaid_items(p_table_session_id)
  where (p_split_mode <> 'mine' or customer_id = auth.uid())
    and (p_split_mode <> 'byItem' or item_id = any(p_item_ids));
  v_base := v_available;
  if p_split_mode = 'fixed' then
    if p_base_amount is null or p_base_amount::text = 'NaN' then
      raise exception 'Informe um valor válido' using errcode = '22023';
    end if;
    v_base := round(p_base_amount * 100)::bigint;
  elsif p_split_mode = 'equal' then
    -- Split the remaining cents among account holders with an outstanding share.
    select greatest(count(distinct customer_id), 1) into v_payers
    from private.table_unpaid_items(p_table_session_id) where remaining_cents > 0;
    v_base := (v_available + v_payers - 1) / v_payers;
  end if;
  if v_base <= 0 or v_base > v_available then
    raise exception 'Valor inválido ou conta já quitada. Atualize a comanda.' using errcode = '22023';
  end if;
  -- The preview amount is checked, never trusted as the price for item/equal splits.
  if p_split_mode <> 'fixed' and p_base_amount is not null
    and round(p_base_amount * 100)::bigint <> v_base then
    raise exception 'A conta mudou. Volte e confira os valores atualizados.' using errcode = '22023';
  end if;

  select coalesce((service_config->>'service_fee_percent')::numeric, 10) into v_fee_pct
  from public.restaurants where id = v_session.restaurant_id;
  select coalesce(sum(round(subtotal * 100)), 0)::bigint, coalesce(sum(round(service_fee * 100)), 0)::bigint
    into v_prior_base, v_prior_fee from public.casual_dining_receipts
    where table_session_id = p_table_session_id and service_fee_percent = v_fee_pct;
  v_fee := round((v_prior_base + v_base) * v_fee_pct / 100)::bigint - v_prior_fee;
  v_tip := round(v_base * p_tip_percent / 100)::bigint;
  insert into public.gateway_transactions (
    restaurant_id, customer_id, provider, payment_method, amount, amount_cents,
    refunded_amount_cents, status, idempotency_key, metadata, created_at, updated_at
  ) values (
    v_session.restaurant_id, auth.uid(), 'simulated', p_payment_method,
    (v_base + v_fee + v_tip)::numeric / 100, v_base + v_fee + v_tip,
    0, 'completed', v_key,
    jsonb_build_object('table_session_id', p_table_session_id, 'simulated', true, 'split_mode', p_split_mode), now(), now()
  ) returning id into v_tx;

  v_remaining := v_base;
  for v_item in
    select u.*, mi.name from private.table_unpaid_items(p_table_session_id) u
    join public.order_items oi on oi.id = u.item_id
    left join public.menu_items mi on mi.id = oi.menu_item_id
    where u.remaining_cents > 0
      and (p_split_mode <> 'mine' or u.customer_id = auth.uid())
      and (p_split_mode <> 'byItem' or u.item_id = any(p_item_ids))
    order by (u.customer_id = auth.uid()) desc, oi.created_at, u.item_id
  loop
    exit when v_remaining = 0;
    v_part := least(v_remaining, v_item.remaining_cents);
    insert into public.table_payment_allocations values (v_tx, v_item.item_id, v_part);
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'name', coalesce(v_item.name, 'Item') || case when v_part < v_item.remaining_cents then ' (parcial)' else '' end,
      'quantity', 1, 'unitPrice', v_part::numeric / 100, 'totalPrice', v_part::numeric / 100));
    v_order := v_item.order_id;
    v_remaining := v_remaining - v_part;
  end loop;
  if v_remaining <> 0 then raise exception 'A conta mudou. Tente novamente.'; end if;

  update public.orders o set status = 'completed', payment_method = p_payment_method,
    completed_at = coalesce(completed_at, now()), updated_at = now()
  where o.table_session_id = p_table_session_id and o.status::text not in ('completed','cancelled')
    and not exists (select 1 from private.table_unpaid_items(p_table_session_id) u
      where u.order_id = o.id and u.remaining_cents > 0);

  insert into public.casual_dining_receipts (
    gateway_transaction_id, restaurant_id, customer_id, table_session_id,
    items, subtotal, service_fee_percent, service_fee, total, tip, payment_method
  ) values (
    v_tx, v_session.restaurant_id, auth.uid(), p_table_session_id, v_items,
    v_base::numeric / 100, v_fee_pct, v_fee::numeric / 100,
    (v_base + v_fee)::numeric / 100, v_tip::numeric / 100, p_payment_method
  ) returning id into v_receipt;

  v_released := not exists (select 1 from private.table_unpaid_items(p_table_session_id)
    where customer_id = auth.uid() and remaining_cents > 0);
  v_closed := not exists (select 1 from private.table_unpaid_items(p_table_session_id) where remaining_cents > 0);
  if v_closed then
    update public.table_sessions set status = 'ended', ended_at = now(), updated_at = now() where id = p_table_session_id;
    update public.tables set status = 'available', occupied_since = null, updated_at = now() where id = v_session.table_id;
    update public.reservations set status = 'completed', updated_at = now()
    where table_id = v_session.table_id and status::text = 'seated';
  elsif v_released then
    perform public.customer_leave_table_session(p_table_session_id);
  end if;
  v_result := jsonb_build_object('receiptId', v_receipt, 'orderId', v_order,
    'restaurantId', v_session.restaurant_id, 'total', (v_base + v_fee)::numeric / 100,
    'tip', v_tip::numeric / 100, 'charged', (v_base + v_fee + v_tip)::numeric / 100,
    'cashback', 0, 'pointsAwarded', 0, 'simulated', true,
    'sessionReleased', v_released, 'tableClosed', v_closed);
  update public.gateway_transactions set metadata = metadata || jsonb_build_object('result', v_result)
    where id = v_tx;
  return v_result;
end $$;
revoke all on function public.customer_pay_table_bill(uuid,numeric,text,numeric,text,uuid,uuid[]) from public;
grant execute on function public.customer_pay_table_bill(uuid,numeric,text,numeric,text,uuid,uuid[]) to authenticated;

-- Restore the server's active visit rather than resurrecting AsyncStorage state.
create or replace function public.customer_get_active_visit()
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_id uuid; v_result jsonb;
begin
  -- Repair paid visits left active by the old checkout, without touching a
  -- visit that has not ordered yet or still has unpaid consumption.
  for v_id in
    select s.id from public.table_sessions s
    join public.table_session_participants p on p.table_session_id = s.id and p.user_id = auth.uid()
    where s.status = 'active'
      and exists (select 1 from public.orders o where o.table_session_id = s.id and o.customer_id = auth.uid())
      and not exists (select 1 from private.table_unpaid_items(s.id) u where u.customer_id = auth.uid() and u.remaining_cents > 0)
  loop
    perform public.customer_leave_table_session(v_id);
  end loop;
  select jsonb_build_object('restaurantId', s.restaurant_id, 'tableId', s.table_id,
    'tableSessionId', s.id, 'tableNumber', t.table_number) into v_result
  from public.table_sessions s
  join public.table_session_participants p on p.table_session_id = s.id and p.user_id = auth.uid()
  join public.tables t on t.id = s.table_id
  where s.status = 'active' order by s.last_activity desc limit 1;
  return v_result;
end $$;
revoke all on function public.customer_get_active_visit() from public;
grant execute on function public.customer_get_active_visit() to authenticated;

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
    'unitPrice', oi.unit_price, 'totalPrice', unpaid.remaining_cents::numeric / 100,
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
  ) order by o.created_at), '[]'::jsonb), coalesce(sum(unpaid.remaining_cents), 0)::numeric / 100
  into v_items, v_subtotal
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  join private.table_unpaid_items(p_table_session_id) unpaid on unpaid.item_id = oi.id and unpaid.remaining_cents > 0
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
    join lateral private.table_unpaid_items(s.id) o on o.customer_id = auth.uid()
    where p.user_id = auth.uid()
      and s.status = 'active'
      and s.table_id <> v_table.id
      and o.remaining_cents > 0
  ) then
    raise exception 'Settle the current table account before joining another table'
      using errcode = 'P0004';
  end if;

  -- A paid diner may leave even while other diners still owe their shares.
  perform public.customer_leave_table_session(s.id)
  from public.table_sessions s join public.table_session_participants p on p.table_session_id = s.id
  where p.user_id = auth.uid() and s.status = 'active' and s.table_id <> v_table.id;

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

create or replace function public.customer_get_receipt(p_receipt_id uuid)
returns jsonb language plpgsql stable security definer
set search_path = public, private, pg_temp as $$
declare v_receipt public.casual_dining_receipts; v_restaurant public.restaurants; v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select * into v_receipt from public.casual_dining_receipts where id = p_receipt_id and customer_id = auth.uid();
  if v_receipt.id is null then raise exception 'Receipt not found' using errcode = 'P0002'; end if;
  select * into v_restaurant from public.restaurants where id = v_receipt.restaurant_id;

  v_result := to_jsonb(v_receipt) || jsonb_build_object(
    'simulated', exists (select 1 from public.gateway_transactions where id = v_receipt.gateway_transaction_id and provider = 'simulated'),
    'restaurantName', v_restaurant.name,
    'restaurantCnpj', coalesce(v_restaurant.settings->>'cnpj', null),
    -- A stable, receipt-scoped 44-digit style code, not a real SEFAZ NFC-e key
    -- (there is no fiscal integration) — presentational only.
    'accessKey', regexp_replace(rpad(replace(v_receipt.id::text, '-', ''), 44, '0'), '(.{4})(?=.)', '\1 ', 'g')
  );
  return v_result;
end $$;

