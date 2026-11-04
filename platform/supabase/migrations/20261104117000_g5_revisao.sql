-- G5, correções da revisão.
-- Quem sai sem pagar ganha marca própria: walkout_at também marca quem pagou e só foi embora.
alter table public.table_session_participants add column left_unpaid_at timestamptz;

create or replace function public.customer_get_active_visit()
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_id uuid; v_result jsonb;
begin
  -- Repair paid visits left active by the old checkout, without touching a
  -- visit that has not ordered yet or still has unpaid consumption.
  for v_id in
    select s.id from public.table_sessions s
    join public.table_session_participants p on p.table_session_id = s.id and p.user_id = auth.uid() and p.walkout_at is null
    where s.status = 'active'
      and exists (select 1 from public.orders o where o.table_session_id = s.id and o.customer_id = auth.uid())
      and private.participant_open_balance_cents(s.id, p.id) = 0
      and not exists (select 1 from private.table_unpaid_items(s.id) u where u.customer_id = auth.uid() and u.remaining_cents > 0)
  loop
    perform public.customer_leave_table_session(v_id);
  end loop;
  select jsonb_build_object('restaurantId', s.restaurant_id, 'tableId', s.table_id,
    'tableSessionId', s.id, 'tableNumber', t.table_number,
    'restaurantName', r.name, 'serviceModel', s.service_model, 'billingStatus', s.billing_status) into v_result
  from public.table_sessions s
  join public.table_session_participants p on p.table_session_id = s.id and p.user_id = auth.uid() and p.walkout_at is null
  join public.tables t on t.id = s.table_id
  join public.restaurants r on r.id = s.restaurant_id
  where s.status = 'active' order by s.last_activity desc limit 1;
  return v_result;
end $$;

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
  from public.table_session_participants p where p.table_session_id = p_table_session_id and p.walkout_at is null;

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

create or replace function private.leave_table_session_as(p_table_session_id uuid, p_user_id uuid, p_confirm_unpaid boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_session public.table_sessions;
  v_next_host uuid;
  v_remaining integer;
  v_part public.table_session_participants;
  v_owed bigint;
begin
  select * into v_session
  from public.table_sessions
  where id = p_table_session_id and status = 'active'
  for update;

  if v_session.id is null or not exists (
    select 1 from public.table_session_participants
    where table_session_id = p_table_session_id and user_id = p_user_id
  ) then
    raise exception 'Active table session not accessible' using errcode = 'P0002';
  end if;

  -- ADR-021: a dívida é da pessoa (diner), não de quem digitou o pedido, e parcela paga zera.
  select * into v_part from public.table_session_participants p
    where p.table_session_id = p_table_session_id and p.user_id = p_user_id;
  v_owed := private.participant_open_balance_cents(p_table_session_id, v_part.id);
  if v_owed > 0 then
    -- Regra provisória (ADR-032): o titular responde pela comanda; os demais podem sair, confirmando, e a parte fica com ele.
    if v_part.is_host or not p_confirm_unpaid then
      raise exception 'Quite sua parte da conta antes de sair da mesa' using errcode = 'P0004';
    end if;
    update public.bill_shares set status = 'abandoned', updated_at = now()
      where table_session_id = p_table_session_id and participant_id = v_part.id and status = 'open';
    update public.table_session_participants set walkout_at = now(), left_unpaid_at = now() where id = v_part.id;
    perform private.log_audit(v_session.restaurant_id, 'bill.left_unpaid', 'table_session', p_table_session_id,
      'Saiu da mesa sem pagar; a parte ficou com o titular', null,
      jsonb_build_object('participantId', v_part.id, 'owedCents', v_owed), p_user_id);
    perform private.notify_part_left_to_host(p_table_session_id, v_part.id);
    return jsonb_build_object('tableSessionId', p_table_session_id, 'left', true, 'movedToHost', true, 'owedCents', v_owed);
  end if;

  -- Quem tem parcela no histórico não pode sumir da comanda: fica registrado que saiu.
  if exists (select 1 from public.bill_shares b where b.participant_id = v_part.id) then
    update public.table_session_participants set walkout_at = now() where id = v_part.id;
  else
    delete from public.table_session_participants where id = v_part.id;
  end if;

  select count(*)::integer into v_remaining
  from public.table_session_participants
  where table_session_id = p_table_session_id and user_id is not null and walkout_at is null;

  if v_remaining > 0 and (v_session.customer_id = p_user_id or v_session.primary_user_id = p_user_id) then
    select user_id into v_next_host
    from public.table_session_participants
    where table_session_id = p_table_session_id and user_id is not null and walkout_at is null
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
    if not exists (select 1 from private.table_unpaid_items(p_table_session_id) where remaining_cents > 0) then
      update public.table_sessions
      set status = 'ended', ended_at = now(), last_activity = now(), updated_at = now()
      where id = p_table_session_id;

      if not exists (select 1 from public.orders where table_session_id = p_table_session_id) and exists (
        select 1 from public.reservations
        where table_id = v_session.table_id and status::text = 'seated'
      ) then
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

create or replace function public.customer_abandon_share(p_share_id uuid)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare s public.bill_shares; v_part uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select * into s from public.bill_shares where id = p_share_id for update;
  if s.id is null or not private.share_payer_allowed(s, auth.uid()) then
    raise exception 'Parcela não encontrada' using errcode = 'P0002'; end if;
  if s.status <> 'open' then raise exception 'Só parcela aberta pode ser abandonada' using errcode = 'P0001'; end if;
  v_part := private.responsible_participant(s.participant_id);
  -- Regra provisória (ADR-032): o titular responde pela comanda e não sai sem quitar.
  if exists (select 1 from public.table_session_participants where id = v_part and is_host) then
    raise exception 'Quem abriu a comanda responde pelo saldo: quite antes de sair' using errcode = 'P0004'; end if;
  update public.bill_shares set status = 'abandoned', updated_at = now() where id = s.id;
  update public.table_session_participants set walkout_at = now(), left_unpaid_at = now() where id = v_part;
  perform private.log_audit(s.restaurant_id, 'bill.share_abandoned', 'bill_share', s.id,
    'participante abandonou o pagamento', jsonb_build_object('amount_cents', s.amount_cents), null, auth.uid());
  perform private.notify_part_left_to_host(s.table_session_id, v_part);
  return jsonb_build_object('shareId', s.id, 'movedToHost', true);
end $$;

create or replace function public.restaurant_mark_walkout(p_session_id uuid, p_participant_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare s public.table_sessions; t record; v_number text;
begin
  select * into s from public.table_sessions where id = p_session_id for update;
  if s.id is null then raise exception 'Table session not found' using errcode = 'P0002'; end if;
  perform private.require_restaurant_role(s.restaurant_id,
    array['owner','manager','waiter','maitre']::public.user_roles_role_enum[]);
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'Motivo obrigatório' using errcode = '22023'; end if;
  update public.table_session_participants set walkout_at = now(), left_unpaid_at = now()
    where id = p_participant_id and table_session_id = p_session_id;
  if not found then raise exception 'Participante não encontrado' using errcode = 'P0002'; end if;
  update public.bill_shares set status = 'abandoned', updated_at = now()
    where table_session_id = p_session_id and participant_id = p_participant_id and status = 'open';
  update public.table_sessions set billing_status = 'billing',
      billing_started_at = coalesce(billing_started_at, now()), updated_at = now() where id = p_session_id;
  perform private.notify_part_left_to_host(p_session_id, p_participant_id);
  select * into t from private.session_totals(p_session_id);
  select table_number into v_number from public.tables where id = s.table_id;
  perform private.notify_restaurant_staff(s.restaurant_id, array['owner','manager']::public.user_roles_role_enum[],
    'Cliente saiu sem pagar — mesa ' || coalesce(v_number, ''),
    'Saldo em aberto: R$ ' || to_char((t.total_all - t.paid_sum)::numeric / 100, 'FM999G990D00'),
    'staff_bill_walkout', s.id, 'table',
    jsonb_build_object('kind', 'staff_bill_walkout', 'table_session_id', s.id,
      'open_cents', t.total_all - t.paid_sum));
  perform private.log_audit(s.restaurant_id, 'bill.walkout', 'table_session', s.id, p_reason,
    null, jsonb_build_object('participant_id', p_participant_id, 'open_cents', t.total_all - t.paid_sum));
  return jsonb_build_object('tableSessionId', s.id, 'openCents', t.total_all - t.paid_sum, 'status', 'billing');
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

  -- ADR-018: QR de mesa unida abre a sessão da mesa principal (uma sessão e uma conta por grupo).
  perform private.lock_floor(v_qr.restaurant_id, false);

  select * into v_table
  from public.tables
  where id = private.table_group_root(v_qr.table_id) and restaurant_id = v_qr.restaurant_id
  for update;

  if v_table.id is null then
    raise exception 'Table is not available for check-in' using errcode = 'P0005';
  end if;

  select * into v_session
  from public.table_sessions
  where table_id = v_table.id and status = 'active'
  order by started_at desc
  limit 1;

  -- Com a comanda aberta, "payment" e "partial_payment" não impedem ninguém de entrar.
  if v_table.status in ('blocked', 'cleaning')
     or (v_session.id is null and v_table.status in ('payment', 'partial_payment')) then
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
      and private.reservation_in_check_in_window(r.restaurant_id, r.reservation_time)
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

  -- ADR-021: uma comanda ativa por cliente. Quem já está em outra mesa é recusado (P0016), não movido,
  -- e nenhuma sessão é encerrada por inatividade: comanda parada só gera alerta à equipe.
  perform private.assert_single_active_session(auth.uid(), v_table.id);

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
  -- Quem volta à mesa volta a responder pela própria parte.
  do update set display_name = excluded.display_name, walkout_at = null, left_unpaid_at = null;

  -- Os estados informativos ficam como estão: entrar na mesa não desfaz "Conta pedida".
  update public.tables
  set status = case when v_table.status in ('payment', 'partial_payment') then v_table.status else 'occupied' end,
      occupied_since = coalesce(occupied_since, now()), updated_at = now()
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

create or replace function private.notify_part_left_to_host(p_session uuid, p_participant uuid)
returns void language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_host uuid; v_name text;
begin
  -- Walk-out do próprio titular não tem para quem avisar: o gerente já é alertado.
  select r.user_id into v_host from public.table_session_participants r
    where r.table_session_id = p_session and r.is_host and r.user_id is not null and r.id <> p_participant limit 1;
  select coalesce(p.display_name, 'Um convidado') into v_name from public.table_session_participants p where p.id = p_participant;
  if v_host is null then return; end if;
  perform private.create_notification(v_host, 'Conta da mesa', v_name || ' saiu sem pagar. A parte ficou com você.',
    'system', p_session, null, jsonb_build_object('kind', 'bill_part_left', 'table_session_id', p_session, 'participant_id', p_participant));
end $$;

create or replace function public.customer_bill_summary(p_table_session_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, private, pg_temp as $$
declare t record; pol public.restaurant_model_policies; v_pending bigint;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if not private.is_table_session_participant(p_table_session_id) then
    raise exception 'Table session not accessible' using errcode = 'P0001'; end if;
  select * into t from private.session_totals(p_table_session_id);
  select p.* into pol from public.table_sessions s
    join public.restaurant_model_policies p on p.restaurant_id = s.restaurant_id and p.service_model = s.service_model
    where s.id = p_table_session_id;
  select coalesce(sum(base_cents), 0) into v_pending from public.bill_shares
    where table_session_id = p_table_session_id and status = 'pending_payment';
  return jsonb_build_object('consumptionCents', t.base_all, 'paidCents', t.paid_sum, 'pendingCents', v_pending,
    'balanceCents', t.base_rem, 'settled', t.base_rem = 0 and v_pending = 0 and t.base_all > 0,
    'feeOrTipMode', private.fee_or_tip_mode(p_table_session_id), 'feeBps', private.session_fee_bps(p_table_session_id),
    'tipPresetsBps', to_jsonb(pol.tip_presets_bps), 'tipDefaultBps', pol.tip_default_bps,
    'splitModes', to_jsonb(pol.split_modes),
    'itemsRemaining', coalesce((select jsonb_agg(jsonb_build_object('orderItemId', b.order_item_id, 'remainingCents', b.remaining_cents))
      from private.session_balances(p_table_session_id) b), '[]'::jsonb),
    'leftWithoutPaying', coalesce((select jsonb_agg(jsonb_build_object('participantId', p.id,
        'name', coalesce(p.display_name, 'Convidado'), 'leftAt', p.left_unpaid_at) order by p.left_unpaid_at)
      from public.table_session_participants p
      where p.table_session_id = p_table_session_id and p.left_unpaid_at is not null), '[]'::jsonb));
end $$;

CREATE OR REPLACE FUNCTION public.restaurant_record_payment(p_order_id uuid, p_payment_method text, p_amount numeric, p_tip_amount numeric DEFAULT 0, p_notes text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_order record;
  v_updated_order record;
  v_tx_id uuid;
  v_existing record;
  v_key text;
  v_order_open bigint;
begin
  select * into v_order from public.orders where id = p_order_id;
  if v_order.id is null then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  perform private.require_restaurant_role(
    v_order.restaurant_id,
    array['owner','manager','waiter']::public.user_roles_role_enum[]
  );

  -- Pedido de comanda aberta abate do saldo único: o valor vem do servidor, não do app (G5). Versões antigas chegam por aqui.
  if v_order.table_session_id is not null and exists (
      select 1 from public.table_sessions ts where ts.id = v_order.table_session_id and ts.status = 'active') then
    select nullif(coalesce(sum(l.open_cents), 0), 0)::bigint into v_order_open from private.session_lines(v_order.table_session_id) l
      join public.order_items oi on oi.id = l.order_item_id where oi.order_id = p_order_id;
    -- Sem isto a base nula significaria "o saldo inteiro da mesa".
    if v_order_open is null then raise exception 'Este pedido não tem consumo em aberto' using errcode = '22023'; end if;
    return public.restaurant_record_bill_payment(v_order.table_session_id, p_payment_method,
      md5(p_order_id::text || ':' || coalesce(p_idempotency_key, gen_random_uuid()::text))::uuid,
      v_order_open, false, round(coalesce(p_tip_amount, 0) * 100)::bigint);
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Invalid payment amount: %', p_amount using errcode = '22023';
  end if;

  if p_payment_method not in ('cash','credit_card','debit_card','pix','wallet','voucher','other') then
    raise exception 'Invalid payment method: %', p_payment_method using errcode = '22023';
  end if;

  -- Idempotent retry: if the client already sent this exact key for this
  -- order, return the transaction that was recorded the first time instead
  -- of creating a duplicate.
  if p_idempotency_key is not null then
    select * into v_existing
    from public.gateway_transactions
    where order_id = p_order_id
      and idempotency_key = p_idempotency_key
    limit 1;

    if v_existing.id is not null then
      return jsonb_build_object(
        'transaction_id', v_existing.id,
        'order_id', p_order_id,
        'payment_method', v_existing.payment_method,
        'amount', v_existing.amount,
        'tip_amount', p_tip_amount,
        'status', v_existing.status,
        'idempotent_replay', true
      );
    end if;
  end if;

  v_key := coalesce(p_idempotency_key, gen_random_uuid()::text);

  insert into public.gateway_transactions(
    restaurant_id, order_id, customer_id, provider, payment_method,
    amount, amount_cents, status, idempotency_key, metadata, created_at, updated_at
  )
  values(
    v_order.restaurant_id, p_order_id, v_order.customer_id,
    'manual', p_payment_method,
    p_amount, (p_amount * 100)::numeric(12,2), 'completed',
    v_key,
    jsonb_build_object('tip_amount', p_tip_amount, 'notes', p_notes),
    now(), now()
  )
  returning id into v_tx_id;

  update public.orders
  set
    payment_method = p_payment_method,
    payment_status = 'confirmed',
    tip_amount     = coalesce(tip_amount, 0) + p_tip_amount,
    completed_at   = case when completed_at is null then now() else completed_at end,
    updated_at     = now()
  where id = p_order_id
  returning * into v_updated_order;

  if v_order.customer_id is not null then
    perform private.loyalty_award_points(
      v_order.customer_id,
      v_order.restaurant_id,
      p_order_id,
      p_amount
    );
  end if;

  return jsonb_build_object(
    'transaction_id', v_tx_id,
    'order_id', p_order_id,
    'payment_method', p_payment_method,
    'amount', p_amount,
    'tip_amount', p_tip_amount,
    'status', 'completed'
  );
end;
$function$;

create or replace function private.compute_split(
  p_session uuid, p_mode public.noowe_split_mode, p_params jsonb, p_actor uuid
) returns jsonb language plpgsql stable security definer set search_path = public, private, pg_temp as $$
declare
  v_params jsonb := coalesce(p_params, '{}'::jsonb);
  v_policy public.restaurant_model_policies;
  v_exclude uuid[] := '{}'; v_balance bigint; v_bps integer; v_mode text; v_waived uuid[];
  v_assign jsonb; v_involved uuid[]; v_ids uuid[]; v_rem bigint[]; v_raw bigint[]; v_owner uuid[]; v_resp uuid[];
  v_payers uuid[]; v_pids uuid[] := '{}'; v_bases bigint[] := '{}'; v_tips bigint[] := '{}';
  v_modes text[] := '{}'; v_lines jsonb[] := '{}';
  v_cov bigint[]; v_cov2 bigint[]; v_rem_u bigint[]; v_owned bigint[]; v_u bigint[]; v_rows jsonb := '[]'::jsonb;
  v_requested bigint; v_adjusted boolean := false; v_payer uuid; v_people integer; v_b bigint; v_r bigint; v_rate integer;
  v_tip_bps integer; v_tip_free bigint; v_fee bigint; v_waive boolean := coalesce((v_params->>'waiveFee')::boolean, false);
  v_shares jsonb := '[]'::jsonb; i integer; k integer;
begin
  select pol.* into v_policy from public.table_sessions s
    join public.restaurant_model_policies pol on pol.restaurant_id = s.restaurant_id and pol.service_model = s.service_model
    where s.id = p_session;
  if v_policy.restaurant_id is not null and not p_mode = any(v_policy.split_modes) then
    raise exception 'Esta forma de divisão não está disponível neste restaurante' using errcode = '23514';
  end if;
  v_bps := private.session_fee_bps(p_session);
  v_mode := private.fee_or_tip_mode(p_session);

  -- Quem vai pagar neste cálculo (só a parcela da própria pessoa muda em valor fixo e em partes com número ajustado).
  if p_mode = 'fixed_amount' or (p_mode = 'equal' and v_params ? 'people') or v_waive then
    select private.responsible_participant(p.id) into v_payer from public.table_session_participants p
      where p.table_session_id = p_session and p.user_id = p_actor limit 1;
    if v_payer is null then raise exception 'Participante não encontrado' using errcode = 'P0001'; end if;
  end if;

  if p_mode = 'by_item' then
    v_assign := v_params->'assignments';
    if v_assign is null then
      select coalesce(jsonb_agg(jsonb_build_object('orderItemId', c.order_item_id, 'participantIds', c.pids)), '[]'::jsonb)
        into v_assign from (
          select order_item_id, jsonb_agg(participant_id order by created_at) pids
          from public.bill_item_claims where table_session_id = p_session group by order_item_id) c;
    end if;
    if jsonb_typeof(v_assign) <> 'array' or jsonb_array_length(v_assign) = 0 then
      raise exception 'Selecione itens para dividir' using errcode = '22023'; end if;
    select array_agg(distinct private.responsible_participant(x::uuid)) into v_involved
      from jsonb_array_elements(v_assign) e, jsonb_array_elements_text(e->'participantIds') x;
    select coalesce(array_agg(s.id), '{}') into v_exclude from public.bill_shares s
      where s.table_session_id = p_session and s.status = 'open' and s.participant_id = any(v_involved);
  elsif p_mode = 'fixed_amount' or (p_mode = 'equal' and v_params ? 'people') then
    select coalesce(array_agg(s.id), '{}') into v_exclude from public.bill_shares s
      where s.table_session_id = p_session and s.status = 'open' and s.participant_id = v_payer;
  else
    select coalesce(array_agg(s.id), '{}') into v_exclude from public.bill_shares s
      where s.table_session_id = p_session and s.status = 'open';
  end if;

  v_balance := private.session_consumption_balance(p_session);
  if v_balance <= 0 then raise exception 'Esta conta já está quitada' using errcode = 'P0011'; end if;

  -- A retirada da taxa acompanha a pessoa até ela pagar, mesmo que outra pessoa refaça a divisão.
  select coalesce(array_agg(s.participant_id), '{}') into v_waived from public.bill_shares s
    where s.table_session_id = p_session and s.status = 'open' and s.fee_waived_at is not null;
  if v_waive then v_waived := v_waived || v_payer; end if;

  select array_agg(b.order_item_id order by b.order_item_id), array_agg(b.remaining_cents order by b.order_item_id),
         array_agg(b.owner_participant order by b.order_item_id)
    into v_ids, v_raw, v_owner
  from private.session_balances(p_session) b where b.remaining_cents > 0;
  -- Depois de valor fixo ou partes iguais sobra menos saldo do que itens livres: a seleção fica limitada ao saldo.
  v_rem := case when (select coalesce(sum(x), 0) from unnest(v_raw) x) > v_balance
    then private.allocate_proportional(v_balance, v_raw) else v_raw end;

  if p_mode = 'by_owner' then
    v_payers := private.eligible_payers(p_session, false);
    if v_payers is null then raise exception 'Sem pagantes disponíveis' using errcode = 'P0011'; end if;
    select array_agg(case when r.rp = any(v_payers) then r.rp end order by o.ix) into v_resp
      from unnest(v_owner) with ordinality as o(own, ix),
           lateral (select private.responsible_participant(o.own) as rp) r;
    v_rem_u := (select array_agg(case when v_resp[ix] is null then v_rem[ix] else 0 end order by ix)
                from generate_subscripts(v_rem, 1) ix);
    select array_agg(s.cents order by p.ord) into v_u
      from unnest(v_payers) with ordinality p(pid, ord)
      join private.split_equal((select coalesce(sum(x), 0)::bigint from unnest(v_rem_u) x), v_payers) s on s.participant_id = p.pid;
    for i in 1 .. array_length(v_payers, 1) loop
      v_owned := (select array_agg(case when v_resp[kx] = v_payers[i] then v_rem[kx] else 0 end order by kx)
                  from generate_subscripts(v_rem, 1) kx);
      v_cov := private.allocate_proportional(v_u[i], v_rem_u);
      v_rem_u := private.array_sub(v_rem_u, v_cov);
      v_cov2 := private.array_add(v_owned, v_cov);
      v_pids := v_pids || v_payers[i];
      v_bases := v_bases || (select coalesce(sum(x), 0)::bigint from unnest(v_cov2) x);
      v_modes := v_modes || 'by_owner'::text;
      v_lines := v_lines || private.lines_json(v_ids, v_cov2);
    end loop;

  elsif p_mode = 'equal' and v_params ? 'people' then
    -- Número de pessoas ajustado: a pessoa paga a parte dela, e o resto segue no saldo.
    if exists (select 1 from public.bill_shares b where b.participant_id = v_payer and b.status = 'pending_payment') then
      raise exception 'Pagamento em andamento para este participante' using errcode = 'P0001'; end if;
    v_people := (v_params->>'people')::integer;
    if v_people is null or v_people < 1 then raise exception 'Número de pessoas inválido' using errcode = '22023'; end if;
    v_pids := array[v_payer];
    v_bases := array[v_balance / v_people + case when v_balance % v_people > 0 then 1 else 0 end];
    v_modes := array['equal'];
    v_lines := array['[]'::jsonb];

  elsif p_mode = 'equal' then
    v_payers := coalesce(private.eligible_payers(p_session, true), private.eligible_payers(p_session, false));
    if v_payers is null then raise exception 'Sem pagantes disponíveis' using errcode = 'P0011'; end if;
    select array_agg(s.cents order by p.ord) into v_bases
      from unnest(v_payers) with ordinality p(pid, ord)
      join private.split_equal(v_balance, v_payers) s on s.participant_id = p.pid;
    v_pids := v_payers;
    v_modes := array_fill('equal'::text, array[array_length(v_payers, 1)]);
    v_lines := array_fill('[]'::jsonb, array[array_length(v_payers, 1)]);

  elsif p_mode = 'by_item' then
    -- O limite ao saldo vale para o que foi escolhido: item que cabe no saldo é pago inteiro.
    v_rem := (select array_agg(case when exists (select 1 from jsonb_array_elements(v_assign) e
        where (e->>'orderItemId')::uuid = v_ids[ix] and jsonb_array_length(e->'participantIds') > 0) then v_raw[ix] else 0 end order by ix)
      from generate_subscripts(v_raw, 1) ix);
    if (select coalesce(sum(x), 0) from unnest(v_rem) x) > v_balance then
      v_rem := private.allocate_proportional(v_balance, v_rem);
    end if;
    -- Item compartilhado: o saldo do item é dividido pela mesma regra do ADR-001.
    for k in 1 .. coalesce(array_length(v_ids, 1), 0) loop
      select array_agg(x.rid order by x.joined_at, x.rid) into v_payers from (
        select distinct private.responsible_participant(pp::uuid) as rid, r.joined_at
        from jsonb_array_elements(v_assign) e, jsonb_array_elements_text(e->'participantIds') pp
        join public.table_session_participants r on r.id = private.responsible_participant(pp::uuid)
        where (e->>'orderItemId')::uuid = v_ids[k] and r.table_session_id = p_session and r.walkout_at is null) x;
      continue when v_payers is null;
      v_rows := v_rows || coalesce((select jsonb_agg(jsonb_build_object('pid', s.participant_id, 'item', v_ids[k], 'cents', s.cents))
        from private.split_equal(v_rem[k], v_payers) s), '[]'::jsonb);
    end loop;
    if jsonb_array_length(v_rows) = 0 then
      raise exception 'Selecione itens ainda não pagos' using errcode = '22023'; end if;
    select array_agg(g.pid order by pr.joined_at, pr.id), array_agg(g.total order by pr.joined_at, pr.id),
           array_agg(g.lines order by pr.joined_at, pr.id)
      into v_pids, v_bases, v_lines
    from (select (r->>'pid')::uuid pid, sum((r->>'cents')::bigint)::bigint total,
                 jsonb_agg(jsonb_build_object('orderItemId', r->>'item', 'baseCents', (r->>'cents')::bigint)) lines
          from jsonb_array_elements(v_rows) r where (r->>'cents')::bigint > 0 group by 1) g
    join public.table_session_participants pr on pr.id = g.pid;
    if v_pids is null then raise exception 'Selecione itens ainda não pagos' using errcode = '22023'; end if;
    if exists (select 1 from public.bill_shares b where b.participant_id = any(v_pids) and b.status = 'pending_payment') then
      raise exception 'Pagamento em andamento para este participante' using errcode = 'P0001'; end if;
    v_modes := array_fill('by_item'::text, array[array_length(v_pids, 1)]);

  else
    -- Valor fixo é o total que sai do cartão: taxa e gorjeta em percentual saem de dentro dele.
    if exists (select 1 from public.bill_shares b where b.participant_id = v_payer and b.status = 'pending_payment') then
      raise exception 'Pagamento em andamento para este participante' using errcode = 'P0001'; end if;
    v_requested := (v_params->>'amountCents')::bigint;
    if v_requested is null or v_requested <= 0 then raise exception 'Valor inválido' using errcode = '22023'; end if;
    v_tip_bps := (v_params->>'tipBps')::integer;
    v_tip_free := (v_params->>'tipCents')::bigint;
    if v_tip_bps < 0 or v_tip_free < 0 then raise exception 'Gorjeta inválida' using errcode = '22023'; end if;
    if v_mode = 'service_fee' and (coalesce(v_tip_bps, 0) > 0 or coalesce(v_tip_free, 0) > 0) then
      raise exception 'Este restaurante usa taxa de serviço: não há gorjeta nesta conta' using errcode = '22023'; end if;
    v_rate := case when v_payer = any(v_waived) then coalesce(v_tip_bps, 0)
      when v_mode = 'service_fee' then v_bps else coalesce(v_tip_bps, 0) end;
    select s.base_cents, s.rest_cents into v_b, v_r from private.split_out_of_total(v_requested, v_rate) s;
    if v_b > v_balance then
      v_b := private.adjust_to_balance(v_b, v_balance);
      v_r := case when v_rate = 0 then 0 else private.service_fee_cents(v_b, v_rate) end;
      v_adjusted := true;
    end if;
    v_pids := array[v_payer]; v_bases := array[v_b]; v_modes := array['fixed_amount']; v_lines := array['[]'::jsonb];
    v_tips := array[case when v_mode = 'tip' then v_r + coalesce(v_tip_free, 0) else 0 end];
  end if;

  for i in 1 .. coalesce(array_length(v_pids, 1), 0) loop
    continue when v_bases[i] <= 0;
    v_fee := case
      when v_pids[i] = any(v_waived) then 0
      when p_mode = 'fixed_amount' and v_mode = 'service_fee' then v_r
      else private.service_fee_cents(v_bases[i], v_bps) end;
    v_shares := v_shares || jsonb_build_object('participantId', v_pids[i], 'mode', v_modes[i],
      'baseCents', v_bases[i], 'feeCents', v_fee, 'amountCents', v_bases[i] + v_fee,
      'tipCents', coalesce(v_tips[i], 0), 'chargeCents', v_bases[i] + v_fee + coalesce(v_tips[i], 0), 'feeWaived', v_pids[i] = any(v_waived), 'lines', v_lines[i]);
  end loop;
  if jsonb_array_length(v_shares) = 0 then
    raise exception 'Nada a dividir com os pagantes disponíveis' using errcode = 'P0011'; end if;

  return jsonb_build_object('mode', p_mode, 'balanceCents', v_balance, 'baseRemCents', v_balance,
    'feeRemCents', private.service_fee_cents(v_balance, v_bps),
    'totalRemCents', v_balance + private.service_fee_cents(v_balance, v_bps),
    'feeOrTipMode', v_mode, 'feeBps', v_bps,
    'requestedCents', v_requested, 'adjusted', v_adjusted, 'shares', v_shares,
    'itemsRemaining', coalesce((select jsonb_agg(jsonb_build_object('orderItemId', b.order_item_id, 'remainingCents', b.remaining_cents))
      from private.session_balances(p_session) b), '[]'::jsonb),
    'unassignedCents', v_balance - (select coalesce(sum((s->>'baseCents')::bigint), 0)::bigint from jsonb_array_elements(v_shares) s),
    'excludeShareIds', to_jsonb(v_exclude), 'version', private.split_version(p_session));
end $$;

create or replace function private.bill_hold_sweep()
returns integer language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_tx record; v_count integer := 0;
begin
  for v_tx in
    select g.id, g.provider, g.restaurant_id from public.gateway_transactions g
    join public.bill_shares s on s.id = g.bill_share_id and s.payment_id = g.id and s.status = 'pending_payment'
    where g.purpose = 'bill_share' and g.status in ('creating', 'pending') and g.expires_at < now()
    for update of g skip locked
  loop
    -- Uma reserva com problema não pode impedir as outras de voltar ao saldo.
    begin
      perform private.apply_payment_event(v_tx.id, v_tx.provider, 'hold-expired:' || v_tx.id, 'HOLD_EXPIRED', 'failed', null, '{}'::jsonb, 'expired');
      v_count := v_count + 1;
    exception when others then
      perform private.log_system_audit(v_tx.restaurant_id, 'bill.hold_sweep_failed', 'payment', v_tx.id, sqlerrm, null, null);
    end;
  end loop;
  return v_count;
end $$;
