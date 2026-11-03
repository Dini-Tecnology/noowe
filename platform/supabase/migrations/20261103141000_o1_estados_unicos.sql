-- O1 (ADR-024, invariante 5) — o status do pedido é derivado dos itens, e só daqui.
--
-- Item muda -> private.derive_order_status recalcula pedido e etapa de atendimento. Escrever orders.status de
-- qualquer outro jeito é recusado com 42501. O trigger inverso, que copiava o status do pedido para os itens, sai.

-- ---------------------------------------------------------------------------
-- 1. Regras isoladas
-- ---------------------------------------------------------------------------
-- Conferência antes de ficar pronto. A fatia O7 troca isto pela opção de Expedição (ADR-028).
create or replace function private.order_requires_quality_check(p_order public.orders)
returns boolean language sql stable set search_path = public, pg_temp as $$
  select coalesce(p_order.service_model = 'quick_service', false)
$$;
revoke all on function private.order_requires_quality_check(public.orders) from public, anon, authenticated;

-- Pedido com horário de retirada futuro espera: o item fica Recebido até a cozinha marcar Pronto.
create or replace function private.order_item_starts_now(p_order public.orders)
returns boolean language sql stable set search_path = public, private, pg_temp as $$
  select private.order_may_enter_production(p_order)
    and (p_order.pickup_slot_start is null or p_order.pickup_slot_start <= now())
$$;
revoke all on function private.order_item_starts_now(public.orders) from public, anon, authenticated;

-- A etapa de atendimento. Etapas finais não voltam.
create or replace function private.compute_order_fulfillment(p_order public.orders)
returns public.noowe_fulfillment_status language plpgsql stable set search_path = public, private, pg_temp as $$
declare v_total integer; v_active integer; v_done integer; v_started integer;
begin
  if p_order.fulfillment_status in ('picked_up', 'not_picked_up', 'cancelled') then return p_order.fulfillment_status; end if;
  select count(*), count(*) filter (where status::text <> 'cancelled'),
      count(*) filter (where status::text in ('ready', 'delivered')),
      count(*) filter (where status::text in ('preparing', 'ready', 'delivered'))
    into v_total, v_active, v_done, v_started
    from public.order_items where order_id = p_order.id;
  if v_total > 0 and v_active = 0 then return 'cancelled'; end if;
  if v_total = 0 then return p_order.fulfillment_status; end if;
  if v_done = v_active then
    if not private.order_requires_quality_check(p_order) then
      return case when exists (select 1 from public.order_items where order_id = p_order.id and status::text = 'ready')
        then 'ready'::public.noowe_fulfillment_status else 'delivered'::public.noowe_fulfillment_status end;
    end if;
    return case when p_order.fulfillment_status = 'ready' then 'ready'::public.noowe_fulfillment_status
      else 'checking'::public.noowe_fulfillment_status end;
  end if;
  if v_started > 0 then return 'preparing'; end if;
  return case when p_order.fulfillment_status = 'accepted' then 'accepted'::public.noowe_fulfillment_status
    else 'received'::public.noowe_fulfillment_status end;
end $$;
revoke all on function private.compute_order_fulfillment(public.orders) from public, anon, authenticated;

-- Ignora os itens cancelados. Só fica pronto com todos os itens de todas as estações prontos.
create or replace function private.compute_order_status(p_order public.orders, p_fulfillment public.noowe_fulfillment_status)
returns public.orders_status_enum language plpgsql stable set search_path = public, pg_temp as $$
declare v_total integer; v_active integer; v_delivered integer; v_done integer; v_started integer;
begin
  if p_fulfillment = 'not_picked_up' then return 'completed'; end if;
  select count(*), count(*) filter (where status::text <> 'cancelled'),
      count(*) filter (where status::text = 'delivered'),
      count(*) filter (where status::text in ('ready', 'delivered')),
      count(*) filter (where status::text in ('preparing', 'ready', 'delivered'))
    into v_total, v_active, v_delivered, v_done, v_started
    from public.order_items where order_id = p_order.id;
  if (v_total > 0 and v_active = 0) or (v_total = 0 and p_order.cancellation_reason is not null) then return 'cancelled'; end if;
  if v_active > 0 and v_delivered = v_active then return 'delivered'; end if;
  if v_active > 0 and v_done = v_active and p_fulfillment <> 'checking' then return 'ready'; end if;
  if v_started > 0 then return 'preparing'; end if;
  return case when p_order.payment_status = 'confirmed' then 'confirmed'::public.orders_status_enum
    else 'pending'::public.orders_status_enum end;
end $$;
revoke all on function private.compute_order_status(public.orders, public.noowe_fulfillment_status) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. A única escrita de orders.status
-- ---------------------------------------------------------------------------
create or replace function private.derive_order_status(p_order_id uuid)
returns void language plpgsql security definer set search_path = public, private, pg_temp as $$
declare o public.orders; v_status public.orders_status_enum; v_fulfillment public.noowe_fulfillment_status;
begin
  select * into o from public.orders where id = p_order_id for update;
  if o.id is null then return; end if;
  v_fulfillment := private.compute_order_fulfillment(o);
  v_status := private.compute_order_status(o, v_fulfillment);
  if v_status is not distinct from o.status and v_fulfillment is not distinct from o.fulfillment_status then return; end if;
  perform set_config('noowe.deriving_order_status', 'on', true);
  update public.orders set status = v_status, fulfillment_status = v_fulfillment,
      actual_ready_at = case when v_status = 'ready' then coalesce(actual_ready_at, now()) else actual_ready_at end,
      completed_at = case when v_status in ('delivered', 'completed') then coalesce(completed_at, now()) else completed_at end,
      updated_at = now()
    where id = p_order_id;
  perform set_config('noowe.deriving_order_status', 'off', true);
end $$;
revoke all on function private.derive_order_status(uuid) from public, anon, authenticated;

create or replace function private.orders_status_guard()
returns trigger language plpgsql set search_path = pg_temp as $$
begin
  if new.status is distinct from old.status
     and coalesce(current_setting('noowe.deriving_order_status', true), '') <> 'on' then
    raise exception 'O status do pedido é derivado dos itens: atualize os itens' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function private.orders_status_guard() from public, anon, authenticated;
create trigger orders_status_guard before update of status on public.orders
  for each row execute function private.orders_status_guard();

-- ---------------------------------------------------------------------------
-- 3. Item entra em preparo sozinho ao aparecer na estação
-- ---------------------------------------------------------------------------
create or replace function private.order_items_enter_station(p_order_id uuid)
returns void language plpgsql security definer set search_path = public, private, pg_temp as $$
declare o public.orders;
begin
  select * into o from public.orders where id = p_order_id for update;
  if o.id is null or o.status in ('cancelled', 'completed') then return; end if;
  if private.order_item_starts_now(o) then
    update public.order_items set status = 'preparing', updated_at = now()
      where order_id = o.id and status::text in ('awaiting_payment', 'pending', 'fired');
  elsif private.order_may_enter_production(o) or o.payment_status = 'confirmed' then
    update public.order_items set status = 'pending', updated_at = now()
      where order_id = o.id and status::text = 'awaiting_payment';
  end if;
end $$;
revoke all on function private.order_items_enter_station(uuid) from public, anon, authenticated;

create or replace function private.order_item_initial_status()
returns trigger language plpgsql security definer set search_path = public, private, pg_temp as $$
declare o public.orders;
begin
  if new.status::text = 'pending' then
    select * into o from public.orders where id = new.order_id;
    if o.id is not null and not private.order_may_enter_production(o) and o.payment_status <> 'confirmed' then
      new.status := 'awaiting_payment';
    end if;
  end if;
  return new;
end $$;
revoke all on function private.order_item_initial_status() from public, anon, authenticated;
create trigger order_items_initial_status before insert on public.order_items
  for each row execute function private.order_item_initial_status();

create or replace function private.order_items_changed()
returns trigger language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_order_id uuid := case when tg_op = 'DELETE' then old.order_id else new.order_id end;
begin
  if tg_op = 'INSERT' then perform private.order_items_enter_station(v_order_id); end if;
  perform private.derive_order_status(v_order_id);
  return null;
end $$;
revoke all on function private.order_items_changed() from public, anon, authenticated;
create trigger order_items_derive_order_status after insert or delete or update of status on public.order_items
  for each row execute function private.order_items_changed();

create or replace function private.orders_progress_changed()
returns trigger language plpgsql security definer set search_path = public, private, pg_temp as $$
begin
  perform private.order_items_enter_station(new.id);
  perform private.derive_order_status(new.id);
  return null;
end $$;
revoke all on function private.orders_progress_changed() from public, anon, authenticated;
-- O nome importa: gatilhos AFTER rodam em ordem alfabética, e este precisa vir depois dos que registram o evento e avisam
-- o cliente. Antes deles, "Em preparo" entraria no histórico antes de "Pedido aceito".
create trigger orders_zz_derive_on_progress after update of payment_status, fulfillment_status, cancellation_reason on public.orders
  for each row when (old.payment_status is distinct from new.payment_status
    or old.fulfillment_status is distinct from new.fulfillment_status
    or old.cancellation_reason is distinct from new.cancellation_reason)
  execute function private.orders_progress_changed();

-- A derivação invertida sai.
drop trigger trg_sync_order_item_status_from_order on public.orders;
drop function private.sync_order_item_status_from_order();

-- ---------------------------------------------------------------------------
-- 4. RPCs da equipe: agem nos itens
-- ---------------------------------------------------------------------------
create or replace function public.restaurant_update_order_item_status(p_item_id uuid, p_status text)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_item public.order_items; v_order public.orders; v_current text; v_next text := lower(trim(p_status));
begin
  select oi.* into v_item from public.order_items oi where oi.id = p_item_id for update;
  if v_item.id is null then raise exception 'Item não encontrado' using errcode = 'P0002'; end if;
  select * into v_order from public.orders where id = v_item.order_id for update;
  perform private.require_restaurant_role(v_order.restaurant_id);
  if v_next <> 'cancelled' and not private.order_may_enter_production(v_order) then
    raise exception 'Pedido Quick ainda não está pago e aceito' using errcode = '23514';
  end if;
  v_current := case when v_item.status::text in ('pending', 'on_hold', 'fired', 'awaiting_payment') then 'received'
    else v_item.status::text end;
  -- Pronto vale também para quem ainda está Recebido: a estação não precisa de um toque para começar.
  if not ((v_current = 'received' and v_next in ('preparing', 'ready', 'cancelled'))
    or (v_current = 'preparing' and v_next in ('ready', 'cancelled'))
    or (v_current = 'ready' and v_next = 'delivered')
    or v_current = v_next) then
    raise exception 'Transição de item inválida: % -> %', v_current, v_next using errcode = '23514';
  end if;
  update public.order_items
    set status = (case when v_next = 'received' then 'pending' else v_next end)::public.order_items_status_enum,
      prepared_at = case when v_next = 'ready' then coalesce(prepared_at, now()) else prepared_at end, updated_at = now()
    where id = v_item.id;
  return jsonb_build_object('orderId', v_order.id, 'itemId', v_item.id, 'status', v_next);
end $$;

drop function public.restaurant_update_order_status(uuid, text, integer);
drop function public.restaurant_update_order_status_legacy_v1(uuid, text, integer);
drop function private.is_valid_restaurant_order_transition(text, text);
drop function public.restaurant_record_payment(uuid, text, numeric, numeric, text);

-- O pedido não tem status próprio: esta RPC aplica o pedido da equipe aos itens.
create or replace function public.restaurant_update_order_status(
  p_order_id uuid, p_status text, p_estimated_time integer default null, p_reason text default null
) returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare o public.orders; v_next text := lower(trim(p_status)); v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  select * into o from public.orders where id = p_order_id for update;
  if o.id is null then raise exception 'Order not found' using errcode = 'P0002'; end if;
  perform private.require_restaurant_role(o.restaurant_id);
  v_next := case v_next when 'new' then 'pending' when 'picked_up' then 'delivered' when 'completed' then 'delivered' else v_next end;
  if not private.is_valid_order_status(v_next) then
    raise exception 'Invalid order status: %', p_status using errcode = '22023';
  end if;

  if private.order_requires_quality_check(o) then
    if v_next in ('confirmed', 'preparing') and not private.order_may_enter_production(o) then
      raise exception 'Pedido Quick ainda não está pago e aceito' using errcode = '23514'; end if;
    if v_next = 'ready' then raise exception 'Quick Service exige conferência antes de ficar pronto' using errcode = '23514'; end if;
    if v_next = 'delivered' then raise exception 'Use a confirmação de retirada com código' using errcode = '23514'; end if;
    if v_next = 'cancelled' then raise exception 'Use o cancelamento com motivo' using errcode = '23514'; end if;
  end if;

  if v_next = 'preparing' then
    if o.status::text in ('ready', 'delivered', 'completed', 'cancelled') then
      raise exception 'Invalid order status transition: % -> %', o.status, v_next using errcode = '23514'; end if;
    update public.order_items set status = 'preparing', updated_at = now()
      where order_id = o.id and status::text in ('awaiting_payment', 'pending', 'on_hold', 'fired');
  elsif v_next = 'ready' then
    if exists (select 1 from public.order_items where order_id = o.id and status::text not in ('ready', 'delivered', 'cancelled')) then
      raise exception 'O pedido só fica pronto quando todos os itens terminarem' using errcode = '23514'; end if;
  elsif v_next = 'delivered' then
    if o.status::text not in ('ready', 'delivered', 'completed') then
      raise exception 'Invalid order status transition: % -> %', o.status, v_next using errcode = '23514'; end if;
    update public.order_items set status = 'delivered', updated_at = now()
      where order_id = o.id and status::text = 'ready';
    -- Só pedido sem comanda mexe na mesa: a comanda paga já levou a mesa a Limpeza, e o garçom pode tê-la liberado.
    if o.table_id is not null and o.table_session_id is null then
      -- Prato entregue não libera a mesa: com comanda aberta ela segue ocupada até a conta fechar.
      update public.tables set status = 'cleaning', updated_at = now()
        where id = o.table_id and restaurant_id = o.restaurant_id
          and not exists (select 1 from public.table_sessions ts where ts.table_id = o.table_id and ts.status = 'active');
    end if;
  elsif v_next = 'cancelled' then
    if o.status::text in ('ready', 'delivered', 'completed', 'cancelled') then
      raise exception 'Invalid order status transition: % -> %', o.status, v_next using errcode = '23514'; end if;
    v_reason := coalesce(v_reason, 'Cancelado pela equipe, sem motivo informado');
    update public.orders set cancellation_reason = v_reason, updated_at = now() where id = o.id;
    update public.order_items set status = 'cancelled', updated_at = now()
      where order_id = o.id and status::text not in ('cancelled', 'delivered');
    perform private.log_audit(o.restaurant_id, 'order.cancelled', 'order', o.id, v_reason,
      jsonb_build_object('status', o.status), jsonb_build_object('status', 'cancelled'));
  end if;

  update public.orders set estimated_time = coalesce(p_estimated_time, estimated_time),
      estimated_ready_at = case when p_estimated_time is not null then now() + make_interval(mins => p_estimated_time)
        else estimated_ready_at end,
      updated_at = now()
    where id = o.id returning * into o;
  return jsonb_build_object('id', o.id, 'restaurant_id', o.restaurant_id, 'customer_id', o.customer_id,
    'order_type', o.order_type, 'table_id', o.table_id, 'status', o.status, 'estimated_time', o.estimated_time,
    'estimated_ready_at', o.estimated_ready_at, 'actual_ready_at', o.actual_ready_at, 'completed_at', o.completed_at,
    'updated_at', o.updated_at, 'order_items', private.order_items_json(o.id),
    'payment_status', o.payment_status, 'fulfillment_status', o.fulfillment_status);
end $$;
revoke all on function public.restaurant_update_order_status(uuid, text, integer, text) from public, anon;
grant execute on function public.restaurant_update_order_status(uuid, text, integer, text) to authenticated;

-- Disparar o curso: em espera vira disparado e, na mesma hora, em preparo.
create or replace function public.restaurant_fire_course(p_order_id uuid, p_course text)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_order record; v_count integer;
begin
  select * into v_order from public.orders where id = p_order_id;
  if v_order.id is null then raise exception 'Order not found' using errcode = 'P0002'; end if;
  perform private.require_restaurant_role(v_order.restaurant_id,
    array['owner','manager','chef','maitre','waiter']::public.user_roles_role_enum[]);
  update public.order_items set status = 'fired', fire_at = now(), updated_at = now()
    where order_id = p_order_id and course = p_course and status::text in ('pending', 'on_hold') and fire_at is null;
  get diagnostics v_count = row_count;
  perform private.order_items_enter_station(p_order_id);
  return jsonb_build_object('order_id', p_order_id, 'course', p_course, 'items_fired', v_count, 'fired_at', now());
end $$;

-- ---------------------------------------------------------------------------
-- 5. Demais funções que escreviam orders.status: o resto da função fica igual
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.apply_payment_event(p_transaction_id uuid, p_provider text, p_provider_event_id text, p_event_type text, p_outcome noowe_payment_status, p_amount_cents bigint DEFAULT NULL::bigint, p_payload jsonb DEFAULT '{}'::jsonb, p_gateway_status text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_tx public.gateway_transactions; v_order public.orders; v_mode text;
  v_status text; v_late boolean := false; v_ignored text;
begin
  select * into v_tx from public.gateway_transactions where id = p_transaction_id for update;
  if v_tx.id is null or v_tx.provider <> p_provider then
    raise exception 'Payment transaction not found' using errcode = 'P0002';
  end if;
  insert into public.payment_provider_events(provider, provider_event_id, gateway_transaction_id,
      restaurant_id, event_type, outcome, payload)
    values (p_provider, p_provider_event_id, v_tx.id, v_tx.restaurant_id, p_event_type, p_outcome,
      coalesce(p_payload, '{}'::jsonb))
    on conflict do nothing;
  if not found then
    return jsonb_build_object('transactionId', v_tx.id, 'orderId', v_tx.order_id,
      'paymentStatus', (select payment_status from public.orders where id = v_tx.order_id),
      'idempotentReplay', true);
  end if;

  v_status := coalesce(p_gateway_status, case p_outcome
    when 'confirmed' then 'completed' when 'failed' then 'failed'
    when 'refunded' then 'refunded' when 'refund_pending' then 'refund_pending' else 'pending' end);
  if v_status not in ('pending','completed','failed','expired','cancelled','refund_pending','refunded','partially_refunded') then
    raise exception 'Status de pagamento inválido: %', v_status using errcode = '22023';
  end if;

  if p_outcome = 'confirmed' and p_amount_cents is not null and p_amount_cents <> v_tx.amount_cents then
    v_ignored := 'amount_mismatch';
  elsif v_tx.status in ('refunded','partially_refunded') and v_status in ('pending','completed','failed','expired','cancelled') then
    v_ignored := 'terminal_state';
  elsif v_tx.status = 'completed' and v_status in ('pending','failed','expired','cancelled') then
    v_ignored := 'already_completed';
  elsif v_tx.status = v_status then
    v_ignored := 'no_change';
  end if;
  if v_ignored is not null then
    update public.payment_provider_events set error = v_ignored
      where provider = p_provider and provider_event_id = p_provider_event_id;
    if v_ignored = 'amount_mismatch' then
      perform private.log_system_audit(v_tx.restaurant_id, 'payment.amount_mismatch', 'payment', v_tx.id,
        'valor do evento diferente do cobrado',
        jsonb_build_object('amount_cents', v_tx.amount_cents), jsonb_build_object('event_amount_cents', p_amount_cents));
    end if;
    return jsonb_build_object('transactionId', v_tx.id, 'orderId', v_tx.order_id,
      'ignored', v_ignored, 'idempotentReplay', false);
  end if;

  if v_tx.order_id is not null then
    select * into v_order from public.orders where id = v_tx.order_id for update;
  end if;
  if p_outcome = 'confirmed' and v_order.id is not null and (
    v_order.fulfillment_status in ('cancelled', 'not_picked_up')
    or v_order.payment_status in ('failed', 'refunded')
    or (v_order.payment_expires_at is not null and v_order.payment_expires_at < now())
  ) then
    v_late := true;
  end if;

  perform set_config('noowe.status_actor', 'system', true);
  update public.gateway_transactions
    set status = case when v_late then 'completed' else v_status end,
        confirmed_at = case when p_outcome = 'confirmed' then coalesce(confirmed_at, now()) else confirmed_at end,
        updated_at = now()
    where id = v_tx.id;
  if v_late then
    perform private.enqueue_refund(v_tx.id, 'pagamento tardio');
  elsif v_tx.purpose = 'bill_share' then
    if p_outcome = 'confirmed' then perform private.settle_bill_share(v_tx.id);
    elsif p_outcome = 'failed' then perform private.release_bill_share(v_tx.id);
    elsif p_outcome = 'refunded' then
      update public.bill_shares set status = 'refunded', updated_at = now() where payment_id = v_tx.id;
    end if;
  elsif v_order.id is not null and v_tx.purpose = 'order' then
    update public.orders set payment_status = p_outcome, updated_at = now()
      where id = v_order.id returning * into v_order;
    if p_outcome = 'confirmed' and v_order.service_model = 'quick_service' then
      select accept_mode into v_mode from public.restaurant_model_policies
        where restaurant_id = v_order.restaurant_id and service_model = 'quick_service';
      if v_mode = 'auto' then
        update public.orders set fulfillment_status = 'accepted', updated_at = now()
          where id = v_order.id returning * into v_order;
      end if;
    end if;
    if p_outcome = 'failed' then
      update public.pickup_slot_reservations set status = 'released'
        where order_id = v_order.id and status = 'reserved';
    end if;
  end if;
  perform set_config('noowe.status_actor', '', true);
  -- O gatilho pode ter levado o pedido adiante (aceite automático, entrada em preparo).
  if v_order.id is not null then select * into v_order from public.orders where id = v_order.id; end if;

  return jsonb_build_object('transactionId', v_tx.id, 'orderId', v_order.id,
    'paymentStatus', v_order.payment_status, 'fulfillmentStatus', v_order.fulfillment_status,
    'latePayment', v_late, 'idempotentReplay', false);
end $function$;

CREATE OR REPLACE FUNCTION public.customer_cancel_order(p_order_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare v_order public.orders;
begin
  if auth.uid() is null then
    raise exception 'Autenticação necessária.' using errcode = '28000';
  end if;
  select * into v_order from public.orders
  where id = p_order_id and customer_id = auth.uid()
  for update;
  if v_order.id is null then
    raise exception 'Pedido não encontrado.' using errcode = 'P0002';
  end if;

  if v_order.service_model = 'quick_service' then
    if v_order.fulfillment_status not in ('received', 'accepted') or exists (
      select 1 from public.order_items oi
      where oi.order_id = v_order.id and oi.status::text in ('preparing', 'ready', 'delivered')
    ) then
      raise exception 'Este pedido já entrou em preparo e não pode mais ser cancelado.' using errcode = 'P0001';
    end if;
    return private.quick_cancel_order(v_order.id,
      coalesce(nullif(btrim(p_reason), ''), 'Cancelado pelo cliente'), auth.uid(), 'quick_order.customer_cancel');
  end if;

  if v_order.status::text not in ('pending', 'confirmed')
     or exists (
       select 1 from public.order_items oi
       where oi.order_id = v_order.id
         and oi.status::text in ('preparing', 'ready', 'delivered')
     )
  then
    raise exception 'Este pedido já entrou em preparo e não pode mais ser cancelado.' using errcode = 'P0001';
  end if;

  update public.orders
  set cancellation_reason = coalesce(nullif(trim(p_reason), ''), 'Cancelado pelo cliente'), updated_at = now()
  where id = v_order.id;
  update public.order_items set status = 'cancelled', updated_at = now()
  where order_id = v_order.id and status::text <> 'cancelled';
  select * into v_order from public.orders where id = p_order_id;
  return v_order;
end $function$;

CREATE OR REPLACE FUNCTION public.customer_dev_skip_prep(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_order public.orders;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if not exists (
    select 1 from private.dev_flags where key = 'simulate_table_scan' and enabled
  ) then
    raise exception 'O atalho de teste está desligado no banco.' using errcode = '42501';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;

  if v_order.id is null
    or (
      v_order.customer_id is distinct from auth.uid()
      and not exists (
        select 1 from public.table_session_participants p
        where p.table_session_id = v_order.table_session_id and p.user_id = auth.uid()
      )
    )
  then
    raise exception 'Pedido não encontrado' using errcode = 'P0002';
  end if;

  if v_order.service_model = 'quick_service' then
    raise exception 'Pedido Quick passa por preparo e conferência no app do restaurante.'
      using errcode = '22023';
  end if;

  if v_order.status::text = 'cancelled' then
    raise exception 'Este pedido foi cancelado.' using errcode = '22023';
  end if;

  if v_order.status::text in ('ready', 'delivering', 'delivered', 'completed') then
    return jsonb_build_object('orderId', v_order.id, 'status', v_order.status);
  end if;

  perform private.log_audit(
    v_order.restaurant_id, 'dev_skip_prep', 'order', v_order.id,
    'Atalho de teste: pular tempo de preparo',
    jsonb_build_object('status', v_order.status),
    jsonb_build_object('status', 'ready')
  );

  update public.orders set estimated_ready_at = now(), updated_at = now() where id = v_order.id;

  update public.order_items
  set status = case when status::text = 'delivered' then status else 'ready'::public.order_items_status_enum end,
      prepared_at = coalesce(prepared_at, now()), expected_ready_at = now(), updated_at = now()
  where order_id = v_order.id and status::text <> 'cancelled';

  return jsonb_build_object('orderId', v_order.id, 'status', 'ready');
end;
$function$;

CREATE OR REPLACE FUNCTION public.customer_pay_table_bill_legacy_v1(p_table_session_id uuid, p_tip_percent numeric DEFAULT 0, p_payment_method text DEFAULT 'pix'::text, p_base_amount numeric DEFAULT NULL::numeric, p_split_mode text DEFAULT 'mine'::text, p_idempotency_key uuid DEFAULT NULL::uuid, p_item_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
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

  update public.orders o set payment_status = 'confirmed', payment_method = p_payment_method,
    completed_at = coalesce(completed_at, now()), updated_at = now()
  where o.table_session_id = p_table_session_id and o.status::text not in ('completed','cancelled')
    and o.payment_status <> 'confirmed'
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
    update public.tables set status = 'cleaning', occupied_since = null, updated_at = now() where id = v_session.table_id;
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
end $function$;

CREATE OR REPLACE FUNCTION private.close_session_if_settled(p_session uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare s public.table_sessions; t record;
begin
  select * into s from public.table_sessions where id = p_session for update;
  if s.id is null or s.status <> 'active' then return false; end if;
  select * into t from private.session_totals(p_session);
  if t.total_all = 0 and t.paid_sum = 0 then return false; end if;
  if t.paid_sum > t.total_all then
    raise exception 'Soma paga (%) excede o total (%)', t.paid_sum, t.total_all using errcode = 'P0009'; end if;
  if t.paid_sum < t.total_all then return false; end if;
  -- A sessão fecha primeiro: a trava confere o total enquanto os pedidos ainda contam.
  update public.table_sessions set status = 'ended', ended_at = now(), updated_at = now() where id = p_session;
  -- Paga, a mesa vai a Limpeza: liberar é ação do garçom (ADR-024).
  update public.tables set status = 'cleaning', occupied_since = null, updated_at = now() where id = s.table_id;
  update public.reservations set status = 'completed', updated_at = now()
    where table_id = s.table_id and status::text = 'seated';
  -- Pago é payment_status; orders.status continua derivado dos itens (invariante 5).
  update public.orders set payment_status = 'confirmed', updated_at = now()
    where table_session_id = p_session and status::text <> 'cancelled' and payment_status <> 'confirmed';
  -- Falha ao enfileirar não desfaz o encerramento: a conta está paga.
  begin
    perform private.fiscal_enqueue_session(p_session);
  exception when others then
    perform private.log_system_audit(s.restaurant_id, 'fiscal.enqueue_failed', 'table_session', p_session, sqlerrm, null, null);
  end;
  return true;
end $function$;

CREATE OR REPLACE FUNCTION private.quick_cancel_order(p_order_id uuid, p_reason text, p_actor_id uuid, p_action text)
 RETURNS orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare v_order public.orders; v_before jsonb;
begin
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'Motivo obrigatório' using errcode = '22023';
  end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then raise exception 'Pedido não encontrado' using errcode = 'P0002'; end if;
  if v_order.fulfillment_status in ('cancelled', 'picked_up', 'not_picked_up', 'delivered') then
    raise exception 'Este pedido não pode mais ser cancelado' using errcode = 'P0001';
  end if;
  v_before := jsonb_build_object('fulfillmentStatus', v_order.fulfillment_status,
    'paymentStatus', v_order.payment_status, 'totalCents', v_order.total_cents);

  perform set_config('noowe.status_reason', btrim(p_reason), true);
  if p_actor_id is null then perform set_config('noowe.status_actor', 'system', true); end if;

  update public.order_items set status = 'cancelled', updated_at = now()
    where order_id = v_order.id and status::text <> 'cancelled';
  update public.gateway_transactions set status = 'failed', updated_at = now()
    where order_id = v_order.id and status = 'pending';
  update public.orders set
      cancellation_reason = btrim(p_reason),
      payment_status = case when payment_status = 'pending' then 'failed'::public.noowe_payment_status
        else payment_status end,
      updated_at = now()
    where id = v_order.id;
  select * into v_order from public.orders where id = p_order_id;

  perform set_config('noowe.status_reason', '', true);
  perform set_config('noowe.status_actor', '', true);

  if p_actor_id is null then
    perform private.log_system_audit(v_order.restaurant_id, p_action, 'order', v_order.id,
      btrim(p_reason), v_before,
      jsonb_build_object('fulfillmentStatus', v_order.fulfillment_status, 'paymentStatus', v_order.payment_status));
  else
    perform private.log_audit(v_order.restaurant_id, p_action, 'order', v_order.id, btrim(p_reason),
      v_before,
      jsonb_build_object('fulfillmentStatus', v_order.fulfillment_status, 'paymentStatus', v_order.payment_status),
      p_actor_id);
  end if;
  return v_order;
end $function$;

CREATE OR REPLACE FUNCTION private.quick_service_sweep(p_restaurant_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_policy public.restaurant_model_policies; v_order public.orders; v_count integer := 0;
  v_closed boolean; v_has_hours boolean;
begin
  select * into v_policy from public.restaurant_model_policies
    where restaurant_id = p_restaurant_id and service_model = 'quick_service';
  if v_policy.restaurant_id is null then return 0; end if;

  -- 1. Pix expirado: o pagamento falha e o pedido é cancelado.
  for v_order in
    select * from public.orders
    where restaurant_id = p_restaurant_id and service_model = 'quick_service'
      and payment_status = 'pending' and fulfillment_status = 'received'
      and payment_expires_at is not null and payment_expires_at < now()
    for update skip locked
  loop
    perform private.quick_cancel_order(v_order.id, 'Pix expirado sem pagamento', null, 'quick_order.pix_expired');
    v_count := v_count + 1;
  end loop;

  -- 2. Aceite manual sem resposta: cancela e estorna integralmente.
  if v_policy.accept_mode = 'manual' then
    for v_order in
      select * from public.orders
      where restaurant_id = p_restaurant_id and service_model = 'quick_service'
        and payment_status = 'confirmed' and fulfillment_status = 'received' and accepted_at is null
        and paid_at + make_interval(mins => v_policy.accept_timeout_min) < now()
      for update skip locked
    loop
      perform private.quick_cancel_order(v_order.id, 'Restaurante não respondeu ao pedido no prazo',
        null, 'quick_order.accept_timeout');
      v_count := v_count + 1;
    end loop;
  end if;

  -- 3. Restaurante fechou depois do pagamento e antes do preparo: estorno automático.
  --    Só vale para restaurante com horário cadastrado e pedido para "agora".
  select (opening_hours is not null and opening_hours <> '{}'::jsonb) into v_has_hours
    from public.restaurants where id = p_restaurant_id;
  v_closed := coalesce(v_has_hours, false) and not private.restaurant_is_open_now(p_restaurant_id);
  if v_closed then
    for v_order in
      select * from public.orders
      where restaurant_id = p_restaurant_id and service_model = 'quick_service'
        and payment_status = 'confirmed' and fulfillment_status in ('received', 'accepted')
        and pickup_slot_start is null
      for update skip locked
    loop
      perform private.quick_cancel_order(v_order.id, 'Restaurante fechou antes do início do preparo',
        null, 'quick_order.closed_refund');
      v_count := v_count + 1;
    end loop;
  end if;

  -- 4. Tolerância de retirada vencida: "não retirado" e, se a política pedir, crédito.
  for v_order in
    select * from public.orders
    where restaurant_id = p_restaurant_id and service_model = 'quick_service'
      and fulfillment_status = 'ready' and pickup_expires_at is not null and pickup_expires_at < now()
    for update skip locked
  loop
    perform set_config('noowe.status_reason', 'Tolerância de retirada vencida', true);
    perform set_config('noowe.status_actor', 'system', true);
    update public.orders set fulfillment_status = 'not_picked_up', updated_at = now() where id = v_order.id;
    perform set_config('noowe.status_reason', '', true);
    perform set_config('noowe.status_actor', '', true);
    update public.pickup_slot_reservations set status = 'expired' where order_id = v_order.id and status = 'reserved';
    if v_policy.no_pickup_policy = 'store_credit' then
      perform private.grant_quick_store_credit(v_order);
    end if;
    perform private.log_system_audit(v_order.restaurant_id, 'quick_order.not_picked_up', 'order', v_order.id,
      'Tolerância de retirada vencida (' || v_policy.no_pickup_policy || ')',
      jsonb_build_object('fulfillmentStatus', 'ready'),
      jsonb_build_object('fulfillmentStatus', 'not_picked_up', 'noPickupPolicy', v_policy.no_pickup_policy));
    v_count := v_count + 1;
  end loop;

  return v_count;
end $function$;

CREATE OR REPLACE FUNCTION public.restaurant_complete_quality_check(p_order_id uuid, p_passed boolean, p_checklist jsonb, p_reason text DEFAULT NULL::text, p_item_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare v_order public.orders; v_tolerance integer; v_returned integer := 0;
begin
  select * into v_order from public.orders where id=p_order_id for update;
  if v_order.id is null then raise exception 'Pedido não encontrado' using errcode='P0002'; end if;
  perform private.require_restaurant_role(v_order.restaurant_id);
  if v_order.service_model<>'quick_service' or v_order.payment_status<>'confirmed'
    or v_order.fulfillment_status<>'checking' then raise exception 'Pedido não está aguardando conferência' using errcode='23514'; end if;
  if p_checklist is null or jsonb_typeof(p_checklist)<>'object' or p_checklist='{}'::jsonb then
    raise exception 'Checklist obrigatório' using errcode='22023'; end if;
  if not p_passed and nullif(trim(p_reason),'') is null then raise exception 'Motivo obrigatório' using errcode='22023'; end if;
  select pickup_expiry_min into v_tolerance from public.restaurant_model_policies
    where restaurant_id=v_order.restaurant_id and service_model='quick_service';
  insert into public.quick_quality_checks(order_id,restaurant_id,status,checklist,reason,checked_by)
    values(v_order.id,v_order.restaurant_id,case when p_passed then 'passed' else 'failed' end,p_checklist,p_reason,auth.uid());
  perform set_config('noowe.status_reason', coalesce(nullif(trim(p_reason),''), ''), true);
  if not p_passed then
    update public.order_items set status='preparing', prepared_at=null, updated_at=now()
      where order_id=v_order.id and status::text='ready'
        and (p_item_ids is null or id = any(p_item_ids));
    get diagnostics v_returned = row_count;
    if v_returned = 0 then raise exception 'Nenhum item para devolver à estação' using errcode='22023'; end if;
  end if;
  update public.orders set fulfillment_status=case when p_passed then 'ready'::public.noowe_fulfillment_status
      else 'preparing'::public.noowe_fulfillment_status end,
    actual_ready_at=case when p_passed then now() else actual_ready_at end,
    pickup_expires_at=case when p_passed then private.quick_pickup_deadline(now(), v_tolerance) else pickup_expires_at end,
    updated_at=now() where id=v_order.id;
  perform set_config('noowe.status_reason', '', true);
  return jsonb_build_object('orderId',v_order.id,'fulfillmentStatus',case when p_passed then 'ready' else 'preparing' end,
    'itemsReturned',v_returned);
end $function$;

CREATE OR REPLACE FUNCTION public.restaurant_confirm_pickup(p_order_id uuid, p_pickup_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare v_order public.orders; v_card public.stamp_cards; v_required integer;
begin
  select * into v_order from public.orders where id=p_order_id for update;
  if v_order.id is null then raise exception 'Pedido não encontrado' using errcode='P0002'; end if;
  perform private.require_restaurant_role(v_order.restaurant_id);
  if v_order.service_model<>'quick_service' or v_order.fulfillment_status<>'ready'
    or v_order.pickup_code<>upper(trim(p_pickup_code)) or v_order.pickup_expires_at<now() then
    raise exception 'Código inválido, expirado ou pedido não está pronto' using errcode='23514'; end if;
  update public.orders set fulfillment_status='picked_up',completed_at=now(),updated_at=now() where id=v_order.id;
  update public.order_items set status='delivered',updated_at=now() where order_id=v_order.id and status::text='ready';
  update public.pickup_slot_reservations set status='fulfilled' where order_id=v_order.id and status='reserved';
  select stamps_per_reward into v_required from public.restaurant_model_policies
    where restaurant_id=v_order.restaurant_id and service_model='quick_service';
  if not exists(select 1 from public.quick_stamp_events where order_id=v_order.id) then
    select * into v_card from public.stamp_cards where restaurant_id=v_order.restaurant_id
      and user_id=v_order.customer_id and service_type='quick_service' order by created_at limit 1 for update;
    if v_card.id is null then
      insert into public.stamp_cards(restaurant_id,user_id,service_type,current_stamps,required_stamps,
        reward_description,completed_cycles,completed,created_at,updated_at)
      values(v_order.restaurant_id,v_order.customer_id,'quick_service',1,v_required,'Recompensa Quick Service',0,false,now(),now()) returning * into v_card;
    else
      update public.stamp_cards set current_stamps=current_stamps+1,
        completed=(current_stamps+1)>=required_stamps,
        completed_at=case when (current_stamps+1)>=required_stamps then now() else completed_at end,
        updated_at=now() where id=v_card.id returning * into v_card;
    end if;
    insert into public.quick_stamp_events(order_id,restaurant_id,customer_id,stamp_card_id)
      values(v_order.id,v_order.restaurant_id,v_order.customer_id,v_card.id);
  end if;
  return jsonb_build_object('orderId',v_order.id,'fulfillmentStatus','picked_up','stampAwarded',true);
end $function$;

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
begin
  select * into v_order from public.orders where id = p_order_id;
  if v_order.id is null then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  perform private.require_restaurant_role(
    v_order.restaurant_id,
    array['owner','manager','waiter']::public.user_roles_role_enum[]
  );

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

CREATE OR REPLACE FUNCTION public.restaurant_resolve_approval(p_approval_id uuid, p_status text, p_resolution_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_status text := lower(trim(coalesce(p_status, '')));
  v_approval public.approvals%rowtype;
  v_updated public.approvals%rowtype;
begin
  select * into v_approval
  from public.approvals
  where id = p_approval_id
  for update;

  if v_approval.id is null then
    raise exception 'Approval not found' using errcode = 'P0002';
  end if;

  perform private.require_restaurant_role(
    v_approval.restaurant_id,
    array['owner','manager']::public.user_roles_role_enum[]
  );

  if v_status not in ('approved','rejected') then
    raise exception 'Invalid resolution status: %', p_status using errcode = '22023';
  end if;
  if v_approval.status <> 'pending' then
    raise exception 'Approval has already been resolved' using errcode = '23514';
  end if;

  if v_status = 'approved' and v_approval.order_id is not null then
    if v_approval.type in ('cancellation', 'order_cancellation') then
      update public.orders
      set cancellation_reason = coalesce(nullif(btrim(coalesce(v_approval.reason, '')), ''), 'Cancelamento aprovado'),
          updated_at = now()
      where id = v_approval.order_id
        and restaurant_id = v_approval.restaurant_id;
      -- Aprovado, sai tudo: também o que já foi entregue, ou o pedido não ficaria cancelado.
      update public.order_items oi set status = 'cancelled', updated_at = now()
      from public.orders o
      where o.id = oi.order_id and o.id = v_approval.order_id
        and o.restaurant_id = v_approval.restaurant_id and oi.status::text <> 'cancelled';
    elsif v_approval.type = 'discount' then
      update public.orders
      set discount_amount = greatest(coalesce(discount_amount, 0), v_approval.amount),
          total_amount = greatest(
            coalesce(subtotal, total_amount, 0)
              + coalesce(tax_amount, 0)
              + coalesce(tip_amount, 0)
              - greatest(coalesce(discount_amount, 0), v_approval.amount),
            0
          ),
          updated_at = now()
      where id = v_approval.order_id
        and restaurant_id = v_approval.restaurant_id;
    end if;
  end if;

  update public.approvals
  set status = v_status,
      resolver_id = auth.uid(),
      resolution_note = nullif(trim(coalesce(p_resolution_note, '')), ''),
      resolved_at = now(),
      updated_at = now()
  where id = p_approval_id
  returning * into v_updated;

  return to_jsonb(v_updated);
end;
$function$;

-- Várias etapas podem acontecer na mesma transação: com now() empatariam, e a ordem no histórico viraria sorteio.
alter table public.order_status_events alter column created_at set default clock_timestamp();
alter table public.notifications alter column created_at set default clock_timestamp();

-- ---------------------------------------------------------------------------
-- 6. Mesa: um só conjunto de estados, e só gerência escreve direto
-- ---------------------------------------------------------------------------
-- `payment` é "Conta pedida". As RPCs de mesa seguem valendo para o garçom.
alter table public.tables add constraint tables_status_check
  check (status in ('available', 'reserved', 'occupied', 'payment', 'partial_payment', 'cleaning', 'blocked'));
drop policy tables_update_restaurant_staff on public.tables;

-- ---------------------------------------------------------------------------
-- 7. Pedidos em andamento entram na regra nova
-- ---------------------------------------------------------------------------
-- Só comanda ativa e pedido do último dia. Pedido antigo parado fica como está: levá-lo a preparo encheria a cozinha e
-- avisaria o cliente de um pedido de meses atrás.
do $$
declare v_id uuid;
begin
  update public.order_items oi set status = 'awaiting_payment', updated_at = now()
    from public.orders o
    where o.id = oi.order_id and oi.status::text = 'pending'
      and o.status::text in ('pending', 'confirmed', 'preparing', 'open_for_additions')
      and o.created_at > now() - interval '1 day'
      and o.payment_status <> 'confirmed' and not private.order_may_enter_production(o);
  for v_id in
    select o.id from public.orders o
    left join public.table_sessions s on s.id = o.table_session_id
    where o.status::text in ('pending', 'confirmed', 'preparing', 'ready', 'open_for_additions', 'delivering')
      and (s.status = 'active' or (o.table_session_id is null and o.created_at > now() - interval '1 day'))
  loop
    perform private.order_items_enter_station(v_id);
    perform private.derive_order_status(v_id);
  end loop;
end $$;
