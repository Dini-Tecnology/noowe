-- G5, o que as telas precisam: gorjeta do Quick, valores da gorjeta prontos no servidor (o app nunca faz a conta) e saldo por item.

-- Gorjeta do pedido pago antes do preparo: percentual ou valor livre, nunca os dois. A conta é do servidor.
create or replace function private.order_tip_cents(p_order public.orders, p_tip_bps integer, p_tip_cents bigint)
returns bigint language plpgsql stable security definer set search_path = public, private, pg_temp as $$
declare v_tip bigint; v_mode text;
begin
  if coalesce(p_tip_bps, 0) < 0 or coalesce(p_tip_bps, 0) > 10000 or coalesce(p_tip_cents, 0) < 0 or (coalesce(p_tip_bps, 0) > 0 and coalesce(p_tip_cents, 0) > 0) then
    raise exception 'Gorjeta inválida' using errcode = '22023'; end if;
  v_tip := coalesce(nullif(p_tip_cents, 0), div(p_order.total_cents * coalesce(p_tip_bps, 0) + 5000, 10000)::bigint);
  if v_tip > p_order.total_cents then raise exception 'Gorjeta inválida' using errcode = '22023'; end if;
  if v_tip > 0 then
    select fee_or_tip_mode into v_mode from public.restaurant_model_policies
      where restaurant_id = p_order.restaurant_id and service_model = p_order.service_model;
    if v_mode is distinct from 'tip' then
      raise exception 'Este restaurante usa taxa de serviço: não há gorjeta nesta conta' using errcode = '22023'; end if;
  end if;
  return v_tip;
end $$;
revoke all on function private.order_tip_cents(public.orders, integer, bigint) from public, anon, authenticated;

drop function if exists public.service_payment_reserve_order(uuid, uuid, text, uuid);
create or replace function public.service_payment_reserve_order(
  p_user_id uuid, p_order_id uuid, p_payment_method text, p_idempotency_key uuid,
  p_tip_bps integer default 0, p_tip_cents bigint default 0
) returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  v_order public.orders; v_tx public.gateway_transactions; v_acct public.restaurant_payment_accounts;
  v_policy public.restaurant_model_policies; v_key text; v_fee bigint; v_expires timestamptz; v_tip bigint; v_amount bigint;
begin
  if p_user_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_idempotency_key is null then raise exception 'Idempotency key required' using errcode = '22023'; end if;
  if p_payment_method not in ('pix', 'credit_card') then
    raise exception 'Forma de pagamento inválida' using errcode = '22023';
  end if;
  v_key := 'order-payment:' || p_user_id || ':' || p_idempotency_key;
  perform pg_advisory_xact_lock(hashtextextended(v_key, 0));

  select * into v_tx from public.gateway_transactions where idempotency_key = v_key and customer_id = p_user_id;
  if v_tx.id is null then
    select * into v_order from public.orders where id = p_order_id and customer_id = p_user_id for update;
    if v_order.id is null then raise exception 'Pedido não encontrado' using errcode = 'P0002'; end if;
    if v_order.fulfillment_status in ('cancelled', 'not_picked_up') or v_order.payment_status = 'failed' then
      raise exception 'Este pedido foi cancelado e não aceita mais pagamento' using errcode = 'P0001';
    end if;
    if v_order.payment_status = 'confirmed' then
      return jsonb_build_object('orderId', v_order.id, 'paymentStatus', v_order.payment_status,
        'alreadyPaid', true, 'idempotentReplay', true);
    end if;
    if v_order.total_cents is null or v_order.total_cents <= 0 then
      raise exception 'Total inválido' using errcode = '23514'; end if;

    v_tip := private.order_tip_cents(v_order, p_tip_bps, p_tip_cents);
    v_amount := v_order.total_cents + v_tip;

    -- Pix ainda válido para o mesmo pedido e o mesmo valor: reaproveita em vez de gerar outro.
    if p_payment_method = 'pix' then
      select * into v_tx from public.gateway_transactions
        where order_id = v_order.id and payment_method = 'pix' and provider = 'asaas' and amount_cents = v_amount
          and status in ('creating', 'pending') and (expires_at is null or expires_at > now())
        order by created_at desc limit 1;
    end if;

    if v_tx.id is null then
      select * into v_acct from public.restaurant_payment_accounts
        where restaurant_id = v_order.restaurant_id and status = 'active';
      if v_acct.id is null then
        raise exception 'Pagamento online indisponível neste restaurante' using errcode = 'P0007';
      end if;
      select * into v_policy from public.restaurant_model_policies
        where restaurant_id = v_order.restaurant_id and service_model = v_order.service_model;
      if p_payment_method = 'pix' and v_policy.pix_expiry_min is not null then
        v_expires := now() + make_interval(mins => v_policy.pix_expiry_min);
      end if;
      v_fee := (v_amount * v_acct.platform_fee_bps + 5000) / 10000;

      insert into public.gateway_transactions(
        restaurant_id, order_id, customer_id, provider, payment_method, amount_cents, tip_cents,
        refunded_amount_cents, status, idempotency_key, purpose, payment_account_id,
        platform_fee_cents, expires_at, metadata, created_at, updated_at)
      values (
        v_order.restaurant_id, v_order.id, p_user_id, 'asaas', p_payment_method, v_amount, v_tip,
        0, 'creating', v_key, 'order', v_acct.id, v_fee, v_expires,
        jsonb_build_object('service_model', v_order.service_model), now(), now())
      returning * into v_tx;

      -- Pedido que só entra em produção pago expira junto com o Pix.
      if coalesce(v_policy.prepaid_required, false) and v_expires is not null then
        update public.orders set payment_expires_at = v_expires, updated_at = now() where id = v_order.id;
      end if;
    end if;
  end if;

  select * into v_acct from public.restaurant_payment_accounts where id = v_tx.payment_account_id;
  return jsonb_build_object(
    'paymentId', v_tx.id, 'orderId', v_tx.order_id, 'restaurantId', v_tx.restaurant_id,
    'provider', v_tx.provider, 'method', v_tx.payment_method, 'status', v_tx.status,
    'amountCents', v_tx.amount_cents, 'platformFeeCents', v_tx.platform_fee_cents,
    'providerRef', v_tx.provider_ref, 'checkoutUrl', v_tx.checkout_url, 'pixPayload', v_tx.pix_payload,
    'expiresAt', v_tx.expires_at, 'paymentAccountId', v_tx.payment_account_id,
    'walletId', v_acct.wallet_id, 'alreadyPaid', false, 'idempotentReplay', v_tx.provider_ref is not null);
end $$;
revoke all on function public.service_payment_reserve_order(uuid, uuid, text, uuid, integer, bigint) from public, anon, authenticated;
grant execute on function public.service_payment_reserve_order(uuid, uuid, text, uuid, integer, bigint) to service_role;

-- O corpo simulado continua privado, e a porta pública continua exigindo a flag (só ganharam a gorjeta).
drop function if exists public.customer_start_payment(uuid, text, uuid);
drop function if exists public.customer_start_payment_simulated(uuid, text, uuid);
create function public.customer_start_payment_simulated(
  p_order_id uuid, p_payment_method text, p_idempotency_key uuid,
  p_tip_bps integer default 0, p_tip_cents bigint default 0
) returns jsonb language plpgsql security definer
set search_path = public, private, pg_temp as $$
declare v_order public.orders; v_tx public.gateway_transactions; v_result jsonb; v_key text;
  v_pix_min integer; v_async boolean; v_tip bigint;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_idempotency_key is null then raise exception 'Idempotency key required' using errcode = '22023'; end if;
  if p_payment_method not in ('pix','credit','credit_card','debit_card','apple','apple_pay','google','google_pay','tap','tap_to_pay','wallet') then
    raise exception 'Forma de pagamento inválida' using errcode = '22023';
  end if;
  v_key := 'order-payment:' || auth.uid() || ':' || p_idempotency_key;
  perform pg_advisory_xact_lock(hashtextextended(v_key,0));
  select * into v_tx from public.gateway_transactions where idempotency_key = v_key;
  if v_tx.id is not null then
    select * into v_order from public.orders where id = v_tx.order_id;
    return jsonb_build_object('transactionId',v_tx.id,'orderId',v_order.id,
      'paymentStatus',v_order.payment_status,'fulfillmentStatus',v_order.fulfillment_status,
      'paymentExpiresAt',v_order.payment_expires_at,
      'pixCode',case when v_tx.payment_method = 'pix' and v_order.payment_status = 'pending'
        then 'noowe-pix-' || v_tx.id::text end,
      'idempotentReplay',true);
  end if;
  select * into v_order from public.orders where id = p_order_id and customer_id = auth.uid() for update;
  if v_order.id is null then raise exception 'Pedido não encontrado' using errcode = 'P0002'; end if;
  if v_order.service_model = 'quick_service' then
    perform private.quick_service_sweep(v_order.restaurant_id);
    select * into v_order from public.orders where id = p_order_id for update;
  end if;
  if v_order.fulfillment_status in ('cancelled', 'not_picked_up') or v_order.payment_status = 'failed' then
    raise exception 'Este pedido foi cancelado e não aceita mais pagamento' using errcode = 'P0001';
  end if;
  if v_order.payment_status = 'confirmed' then
    return jsonb_build_object('orderId',v_order.id,'paymentStatus',v_order.payment_status,
      'fulfillmentStatus',v_order.fulfillment_status,'idempotentReplay',true);
  end if;
  if v_order.total_cents is null or v_order.total_cents < 0 then raise exception 'Total inválido' using errcode = '23514'; end if;

  v_tip := private.order_tip_cents(v_order, p_tip_bps, p_tip_cents);
  v_async := v_order.service_model = 'quick_service' and p_payment_method = 'pix';
  if v_async then
    -- Pix já gerado e ainda válido para este pedido: reaproveita.
    select * into v_tx from public.gateway_transactions
      where order_id = v_order.id and payment_method = 'pix' and status = 'pending' and amount_cents = v_order.total_cents + v_tip
      order by created_at desc limit 1;
    if v_tx.id is not null then
      return jsonb_build_object('transactionId',v_tx.id,'orderId',v_order.id,'paymentStatus','pending',
        'fulfillmentStatus',v_order.fulfillment_status,'paymentExpiresAt',v_order.payment_expires_at,
        'pixCode','noowe-pix-' || v_tx.id::text,'simulated',true,'idempotentReplay',true);
    end if;
  end if;

  insert into public.gateway_transactions(
    restaurant_id,order_id,customer_id,provider,payment_method,amount,amount_cents,tip_cents,
    refunded_amount_cents,status,idempotency_key,metadata,created_at,updated_at
  ) values (
    v_order.restaurant_id,v_order.id,auth.uid(),'simulated',p_payment_method,
    (v_order.total_cents + v_tip)::numeric/100,v_order.total_cents + v_tip,v_tip,0,'pending',v_key,
    jsonb_build_object('service_model',v_order.service_model,'simulated',true),now(),now()
  ) returning * into v_tx;

  if v_async then
    select pix_expiry_min into v_pix_min from public.restaurant_model_policies
      where restaurant_id = v_order.restaurant_id and service_model = 'quick_service';
    update public.orders set payment_expires_at = now() + make_interval(mins => v_pix_min), updated_at = now()
      where id = v_order.id returning * into v_order;
    return jsonb_build_object('transactionId',v_tx.id,'orderId',v_order.id,'paymentStatus','pending',
      'fulfillmentStatus',v_order.fulfillment_status,'paymentExpiresAt',v_order.payment_expires_at,
      'pixCode','noowe-pix-' || v_tx.id::text,'simulated',true,'idempotentReplay',false);
  end if;

  -- The simulated provider adapter is synchronous, but confirmation still
  -- enters through the same private, idempotent event boundary as a webhook.
  v_result := private.process_simulated_payment_event(v_tx.id,'simulated:' || v_tx.id,'confirmed');
  return v_result || jsonb_build_object('simulated',true);
end $$;

revoke all on function public.customer_start_payment_simulated(uuid, text, uuid, integer, bigint) from public, anon, authenticated;

create function public.customer_start_payment(
  p_order_id uuid, p_payment_method text, p_idempotency_key uuid,
  p_tip_bps integer default 0, p_tip_cents bigint default 0
) returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_restaurant uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select restaurant_id into v_restaurant from public.orders where id = p_order_id and customer_id = auth.uid();
  if v_restaurant is null then raise exception 'Pedido não encontrado' using errcode = 'P0002'; end if;
  if private.payment_mode(v_restaurant, 'simulate_order_payment') <> 'simulated' then
    raise exception 'Pagamento simulado desligado; use o pagamento online.' using errcode = '42501'; end if;
  return public.customer_start_payment_simulated(p_order_id, p_payment_method, p_idempotency_key, p_tip_bps, p_tip_cents);
end $$;
revoke all on function public.customer_start_payment(uuid, text, uuid, integer, bigint) from public, anon;
grant execute on function public.customer_start_payment(uuid, text, uuid, integer, bigint) to authenticated;

-- Quanto dá a gorjeta sobre um valor: a tela mostra, e o servidor é quem sabe fazer a conta.
create or replace function public.customer_tip_quote(p_amount_cents bigint, p_tip_bps integer default 0, p_tip_cents bigint default 0)
returns jsonb language plpgsql immutable as $$
declare v_tip bigint;
begin
  if p_amount_cents is null or p_amount_cents < 0 or coalesce(p_tip_bps, 0) < 0 or coalesce(p_tip_cents, 0) < 0 then
    raise exception 'Valor inválido' using errcode = '22023'; end if;
  v_tip := coalesce(nullif(p_tip_cents, 0), div(p_amount_cents * coalesce(p_tip_bps, 0) + 5000, 10000)::bigint);
  return jsonb_build_object('tipCents', v_tip, 'totalCents', p_amount_cents + v_tip);
end $$;
revoke all on function public.customer_tip_quote(bigint, integer, bigint) from public, anon;
grant execute on function public.customer_tip_quote(bigint, integer, bigint) to authenticated;

create or replace function public.customer_my_table_balance(p_table_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $$
declare v_participant uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select p.id into v_participant from public.table_session_participants p
    join public.table_sessions s on s.id = p.table_session_id and s.status = 'active'
    where p.table_session_id = p_table_session_id and p.user_id = auth.uid();
  if v_participant is null then
    raise exception 'Active table session not accessible' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'owedCents', private.participant_open_balance_cents(p_table_session_id, v_participant),
    'isHost', (select is_host from public.table_session_participants where id = v_participant),
    'hasConsumption', exists (
      select 1 from public.orders o
      where o.table_session_id = p_table_session_id and o.customer_id = auth.uid()
        and o.status::text <> 'cancelled')
  );
end;
$$;

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
        'name', coalesce(p.display_name, 'Convidado'), 'leftAt', p.walkout_at) order by p.walkout_at)
      from public.table_session_participants p
      where p.table_session_id = p_table_session_id and p.walkout_at is not null), '[]'::jsonb));
end $$;

-- A gorjeta não entra nas formas de pagamento da nota.
create or replace function private.fiscal_enqueue_order(p_order uuid)
returns uuid language plpgsql security definer set search_path = public, private, pg_temp as $$
declare o public.orders; v_ids uuid[]; v_gross bigint[]; v_disc bigint[]; v_lines jsonb; v_payments jsonb; v_id uuid; v_total bigint;
begin
  select * into o from public.orders where id = p_order;
  if o.id is null then return null; end if;
  if exists (select 1 from public.gateway_transactions g
             where g.order_id = p_order and g.status = 'completed' and g.provider = 'simulated') then
    return null;
  end if;
  select array_agg(oi.id order by oi.created_at, oi.id),
         array_agg(coalesce(oi.total_price_cents, round(oi.total_price * 100)::bigint) order by oi.created_at, oi.id)
    into v_ids, v_gross
  from public.order_items oi
  where oi.order_id = p_order and oi.status::text <> 'cancelled'
    and coalesce(oi.total_price_cents, round(oi.total_price * 100)::bigint) > 0;
  if v_ids is null then return null; end if;
  select sum(x) into v_total from unnest(v_gross) x;
  v_disc := private.allocate_proportional(least(coalesce(o.discount_cents, 0), v_total), v_gross);
  v_total := v_total - least(coalesce(o.discount_cents, 0), v_total);
  select jsonb_agg(jsonb_build_object('orderItemId', oi.id, 'menuItemId', oi.menu_item_id,
           'description', coalesce(mi.name, 'Item'), 'quantity', oi.quantity,
           'grossCents', v_gross[x.ord], 'discountCents', v_disc[x.ord], 'feeCents', 0) order by x.ord)
    into v_lines
  from unnest(v_ids) with ordinality as x(id, ord)
  join public.order_items oi on oi.id = x.id
  left join public.menu_items mi on mi.id = oi.menu_item_id;
  select jsonb_agg(jsonb_build_object('method', m.method, 'weightCents', m.cents) order by m.method)
    into v_payments
  from (select g.payment_method as method, sum(g.amount_cents - g.tip_cents)::bigint as cents
        from public.gateway_transactions g
        where g.order_id = p_order and g.status = 'completed' group by g.payment_method) m;
  insert into public.fiscal_documents(restaurant_id, order_id, external_ref, total_cents, snapshot)
  values (o.restaurant_id, p_order, 'o-' || p_order, v_total,
    jsonb_build_object('lines', v_lines, 'payments', coalesce(v_payments, '[]'::jsonb)))
  on conflict (external_ref) do update set total_cents = excluded.total_cents, snapshot = excluded.snapshot,
      status = 'pending', attempts = 0, next_attempt_at = now(), error_code = null, error_message = null, updated_at = now()
    where fiscal_documents.status = 'blocked' and fiscal_documents.error_code = 'enqueue_failed'
  returning id into v_id;
  return v_id;
end $$;
