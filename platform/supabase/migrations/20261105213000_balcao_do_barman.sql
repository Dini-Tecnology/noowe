-- Barman cobra pedido de balcão (pendência 77): o servidor já permitia, mas o app não tinha por onde.
-- E restaurant_record_payment passa a conferir o valor e a recusar pedido já pago: o app enviava o que quisesse (invariantes 2 e 10).
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
  v_order_total bigint;
begin
  select * into v_order from public.orders where id = p_order_id;
  if v_order.id is null then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  perform private.require_restaurant_role(
    v_order.restaurant_id,
    array['owner','manager','waiter','maitre','barman']::public.user_roles_role_enum[]
  );
  -- Barman cobra no balcão (pedido sem mesa). Garçom, nas mesas dele.
  if v_order.table_id is not null and not private.has_restaurant_role(v_order.restaurant_id, array['owner','manager','waiter','maitre']::public.user_roles_role_enum[]) then
    raise exception 'Restaurant access denied' using errcode = '42501'; end if;
  if not private.has_restaurant_role(v_order.restaurant_id, array['owner','manager','maitre']::public.user_roles_role_enum[])
     and exists (select 1 from public.tables t where t.id = v_order.table_id and t.assigned_waiter_id <> auth.uid()) then
    raise exception 'Esta mesa é de outro garçom' using errcode = '42501'; end if;

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

  -- O servidor confere o valor (invariante 2). Pedido sem total conhecido não tem o que conferir: fica como veio.
  v_order_total := coalesce(v_order.total_cents, round(coalesce(v_order.total_amount, v_order.subtotal) * 100)::bigint);
  if v_order_total is not null and round(p_amount * 100)::bigint <> v_order_total then
    raise exception 'O valor não confere com o pedido' using errcode = '22023';
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

  -- Dois toques com chaves diferentes não cobram duas vezes (invariante 10).
  if v_order.payment_status::text = 'confirmed' then
    raise exception 'Este pedido já foi pago' using errcode = '23505';
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
  if p_payment_method = 'cash' then
    perform private.cash_record(v_order.restaurant_id, 'sale', round(p_amount * 100)::bigint, 'Recebido no pedido', v_tx_id, p_order_id);
  end if;

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

create or replace function public.restaurant_list_counter_orders(p_restaurant_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, private, pg_temp as $$
begin
  perform private.require_restaurant_role(p_restaurant_id, array['owner','manager','maitre','barman']::public.user_roles_role_enum[]);
  return coalesce((select jsonb_agg(x.j order by x.created_at) from (
    select o.created_at, jsonb_build_object('orderId', o.id, 'orderNumber', o.order_number, 'callName', o.call_name,
        'totalCents', coalesce(o.total_cents, round(coalesce(o.total_amount, o.subtotal, 0) * 100)::bigint), 'createdAt', o.created_at,
        'items', coalesce((select jsonb_agg(oi.quantity || 'x ' || coalesce(mi.name, 'Item')) from public.order_items oi
          left join public.menu_items mi on mi.id = oi.menu_item_id where oi.order_id = o.id), '[]'::jsonb)) as j
    from public.orders o
    where o.restaurant_id = p_restaurant_id and o.table_id is null and o.table_session_id is null
      and o.payment_status::text = 'pending' and o.status::text not in ('cancelled', 'completed')
      and (o.payment_expires_at is null or o.payment_expires_at > now())
      and o.created_at >= now() - interval '1 day') x), '[]'::jsonb);
end $$;
revoke all on function public.restaurant_list_counter_orders(uuid) from public, anon;
grant execute on function public.restaurant_list_counter_orders(uuid) to authenticated, service_role;
