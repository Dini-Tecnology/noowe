-- QA 2026-11-25: OP-01 (KDS da cozinha marcava o item do bar), AUD-ITEM (cancelar item sem motivo e sem rastro)
-- e cortesia aprovada que não mexia na conta.

-- OP-01: a tela da estação pede só os seus itens. Bar = curso drink ou estação bar/drinks, como em restaurant_get_bar_queue.
create or replace function private.is_bar_item(p_course text, p_station_id uuid)
returns boolean language sql stable security definer set search_path = public, private, pg_temp as $$
  select p_course = 'drink' or exists (
    select 1 from public.cook_stations cs where cs.id = p_station_id and cs.station_type in ('bar', 'drinks'))
$$;

drop function if exists public.restaurant_get_kds_queue(uuid, uuid);
create function public.restaurant_get_kds_queue(p_restaurant_id uuid, p_station_id uuid default null, p_station_kind text default null)
 returns jsonb language plpgsql stable security definer set search_path to 'public', 'private', 'pg_temp'
as $function$
declare result jsonb; v_kind text := lower(nullif(btrim(coalesce(p_station_kind, '')), ''));
begin
  perform private.require_restaurant_role(p_restaurant_id,
    array['owner','manager','chef','cook','barman','waiter','maitre']::public.user_roles_role_enum[]);
  if v_kind is not null and v_kind not in ('kitchen', 'bar') then
    raise exception 'Estação inválida: %', p_station_kind using errcode = '22023';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',oi.id,'order_id',o.id,'restaurant_id',o.restaurant_id,
    'service_model',o.service_model,'payment_status',o.payment_status,
    'fulfillment_status',o.fulfillment_status,'table_id',o.table_id,
    'table_number',t.table_number,'customer_name',p.full_name,
    'menu_item_id',oi.menu_item_id,'name',coalesce(mi.name,'Item'),
    'quantity',oi.quantity,'status',oi.status,'order_status',o.status,
    'station_id',coalesce(oi.station_id,mi.station_id),'course',coalesce(oi.course,mi.course),
    'special_instructions',oi.special_instructions,'customizations',oi.customizations,
    'fire_at',oi.fire_at,'expected_ready_at',oi.expected_ready_at,
    'created_at',oi.created_at,'order_created_at',o.created_at
  ) order by coalesce(oi.fire_at,o.created_at),oi.created_at),'[]'::jsonb) into result
  from public.order_items oi join public.orders o on o.id=oi.order_id
  left join public.menu_items mi on mi.id=oi.menu_item_id
  left join public.tables t on t.id=o.table_id left join public.profiles p on p.id=o.customer_id
  where o.restaurant_id=p_restaurant_id
    and o.status::text in ('confirmed','preparing','ready','open_for_additions')
    and oi.status::text in ('pending','preparing','ready')
    and private.quick_order_may_enter_production(o)
    and (p_station_id is null or coalesce(oi.station_id,mi.station_id)=p_station_id)
    and (v_kind is null or private.is_bar_item(coalesce(oi.course,mi.course), coalesce(oi.station_id,mi.station_id)) = (v_kind = 'bar'));
  return result;
end $function$;
revoke all on function public.restaurant_get_kds_queue(uuid, uuid, text) from public, anon;
grant execute on function public.restaurant_get_kds_queue(uuid, uuid, text) to authenticated, service_role;

-- AUD-ITEM: cancelar item exige motivo e grava audit_log na mesma transação (invariante 8).
drop function if exists public.restaurant_update_order_item_status(uuid, text);
create function public.restaurant_update_order_item_status(p_item_id uuid, p_status text, p_reason text default null)
 returns jsonb language plpgsql security definer set search_path to 'public', 'private', 'pg_temp'
as $function$
declare v_item public.order_items; v_order public.orders; v_current text; v_next text := lower(trim(p_status));
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  select oi.* into v_item from public.order_items oi where oi.id = p_item_id for update;
  if v_item.id is null then raise exception 'Item não encontrado' using errcode = 'P0002'; end if;
  select * into v_order from public.orders where id = v_item.order_id for update;
  perform private.require_restaurant_role(v_order.restaurant_id);
  if v_next = 'cancelled' and v_reason is null then
    raise exception 'Motivo obrigatório para cancelar item' using errcode = '22023';
  end if;
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
  if v_next = 'cancelled' and v_current <> 'cancelled' then
    perform private.log_audit(v_order.restaurant_id, 'order_item.cancelled', 'order_item', v_item.id, v_reason,
      jsonb_build_object('status', v_item.status), jsonb_build_object('status', 'cancelled', 'orderId', v_order.id));
  end if;
  return jsonb_build_object('orderId', v_order.id, 'itemId', v_item.id, 'status', v_next);
end $function$;
revoke all on function public.restaurant_update_order_item_status(uuid, text, text) from public, anon;
grant execute on function public.restaurant_update_order_item_status(uuid, text, text) to authenticated, service_role;

-- O cancelamento do item agora exige motivo: o estorno parcial repassa o seu.
CREATE OR REPLACE FUNCTION public.restaurant_refund_unavailable_item(p_order_item_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare v_item public.order_items; v_order public.orders; v_cents bigint; v_remaining bigint; v_tx_id uuid; v_refund uuid;
begin
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'Motivo obrigatório' using errcode = '22023';
  end if;
  select * into v_item from public.order_items where id = p_order_item_id for update;
  if v_item.id is null then raise exception 'Item não encontrado' using errcode = 'P0002'; end if;
  select * into v_order from public.orders where id = v_item.order_id for update;
  perform private.require_restaurant_role(v_order.restaurant_id,
    array['owner','manager','chef']::public.user_roles_role_enum[]);
  if v_order.service_model <> 'quick_service' or v_order.payment_status <> 'confirmed'
    or v_order.fulfillment_status not in ('accepted', 'preparing') then
    raise exception 'Pedido não permite estorno parcial agora' using errcode = '23514';
  end if;
  if v_item.status::text in ('ready', 'delivered', 'cancelled') then
    raise exception 'Item já concluído ou cancelado' using errcode = '23514';
  end if;

  v_cents := coalesce(v_item.total_price_cents, round(v_item.total_price * 100)::bigint);
  -- Devolve o que foi pago pelo item: o desconto do pedido se distribui entre os itens.
  if coalesce(v_order.discount_cents, 0) > 0 then
    v_cents := div(v_cents * v_order.total_cents, v_order.total_cents + v_order.discount_cents)::bigint;
  end if;
  v_remaining := coalesce(v_order.total_cents, 0) - v_order.refunded_cents;
  v_cents := least(v_cents, v_remaining);
  if v_cents <= 0 then raise exception 'Nada a estornar neste item' using errcode = '23514'; end if;

  select id into v_tx_id from public.gateway_transactions where order_id = v_order.id and status = 'completed' order by created_at desc limit 1;
  if v_tx_id is null then raise exception 'Este pedido não tem pagamento a estornar' using errcode = '23514'; end if;
  update public.orders set refunded_cents = refunded_cents + v_cents, updated_at = now() where id = v_order.id;
  -- O valor do item volta pelo provedor. Simulado e pagamento presencial já saem resolvidos.
  v_refund := private.enqueue_refund(v_tx_id, btrim(p_reason), v_cents, auth.uid());
  update public.payment_refunds set order_item_id = v_item.id where id = v_refund;
  perform private.log_audit(v_order.restaurant_id, 'quick_order.partial_refund', 'order_item', v_item.id,
    btrim(p_reason),
    jsonb_build_object('refundedCents', v_order.refunded_cents),
    jsonb_build_object('refundedCents', v_order.refunded_cents + v_cents, 'itemRefundCents', v_cents,
      'orderId', v_order.id));
  perform public.restaurant_update_order_item_status(v_item.id, 'cancelled', btrim(p_reason));
  return jsonb_build_object('orderId', v_order.id, 'itemId', v_item.id, 'refundedCents', v_cents,
    'totalRefundedCents', v_order.refunded_cents + v_cents);
end $function$;

-- Cortesia aprovada zera o item na conta.
CREATE OR REPLACE FUNCTION private.apply_approval_effect(p_approval approvals)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare v_item public.order_items; v_cents bigint;
begin
  -- Estorno aprovado: entra na fila do provedor; nada volta ao cliente sem esta aprovação (ADR-004).
  if p_approval.type = 'refund' and p_approval.gateway_transaction_id is not null then
    perform private.enqueue_refund(p_approval.gateway_transaction_id, p_approval.reason, p_approval.amount_cents,
      p_approval.requester_id, p_approval.id);
    return;
  end if;
  if p_approval.type = 'bill_reopen' and p_approval.table_session_id is not null then
    perform private.reopen_paid_session(p_approval.table_session_id, p_approval.reason);
    return;
  end if;
  if p_approval.order_id is null then return; end if;
  if p_approval.type in ('cancellation', 'order_cancellation') then
    update public.orders
    set cancellation_reason = coalesce(nullif(btrim(coalesce(p_approval.reason, '')), ''), 'Cancelamento aprovado'),
        updated_at = now()
    where id = p_approval.order_id and restaurant_id = p_approval.restaurant_id;
    -- Aprovado, sai tudo: também o que já foi entregue, ou o pedido não ficaria cancelado.
    update public.order_items oi set status = 'cancelled', updated_at = now()
    from public.orders o
    where o.id = oi.order_id and o.id = p_approval.order_id
      and o.restaurant_id = p_approval.restaurant_id and oi.status::text <> 'cancelled';
  elsif p_approval.type = 'discount' then
    -- discount_cents é o que a conta usa: sem ele, o desconto aprovado não chegava ao que o cliente paga.
    update public.orders
    set discount_cents = greatest(coalesce(discount_cents, 0), p_approval.amount_cents),
        total_cents = greatest(total_cents - greatest(p_approval.amount_cents - coalesce(discount_cents, 0), 0), 0),
        discount_amount = greatest(coalesce(discount_amount, 0), p_approval.amount),
        total_amount = greatest(
          coalesce(subtotal, total_amount, 0) + coalesce(tax_amount, 0) + coalesce(tip_amount, 0)
            - greatest(coalesce(discount_amount, 0), p_approval.amount), 0),
        updated_at = now()
    where id = p_approval.order_id and restaurant_id = p_approval.restaurant_id;
  elsif p_approval.type = 'courtesy' then
    -- Cortesia zera o item na conta: a comanda lê o valor do item; o pedido perde o mesmo valor em centavos.
    select oi.* into v_item from public.order_items oi
      left join public.menu_items mi on mi.id = oi.menu_item_id
      where oi.order_id = p_approval.order_id and oi.status::text <> 'cancelled'
        and coalesce(oi.total_price_cents, round(oi.total_price * 100)::bigint) > 0
        and lower(btrim(coalesce(mi.name, ''))) = lower(btrim(coalesce(p_approval.item_name, '')))
      order by oi.created_at, oi.id limit 1 for update of oi;
    if v_item.id is null then
      raise exception 'Cortesia: item "%" não está no pedido', p_approval.item_name using errcode = 'P0002';
    end if;
    v_cents := coalesce(v_item.total_price_cents, round(v_item.total_price * 100)::bigint);
    update public.order_items set total_price_cents = 0, total_price = 0, updated_at = now() where id = v_item.id;
    update public.orders
    set subtotal_cents = greatest(coalesce(subtotal_cents, 0) - v_cents, 0),
        total_cents = greatest(coalesce(total_cents, 0) - v_cents, 0),
        subtotal = greatest(coalesce(subtotal, 0) - v_cents / 100.0, 0),
        total_amount = greatest(coalesce(total_amount, 0) - v_cents / 100.0, 0),
        updated_at = now()
    where id = p_approval.order_id and restaurant_id = p_approval.restaurant_id;
  end if;
end $function$;
