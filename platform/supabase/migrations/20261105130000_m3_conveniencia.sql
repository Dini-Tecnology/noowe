-- M3: taxa de conveniência da NOOWE, só nos fluxos parametrizados. Pronta e desligada: hoje vale R$ 0 até o contador confirmar (pendência 38).
-- Ligar é mudar a tabela, sem nova versão do app.
alter table public.orders add column convenience_fee_cents bigint not null default 0 check (convenience_fee_cents >= 0);
alter table public.gateway_transactions add column convenience_cents bigint not null default 0 check (convenience_cents >= 0);
alter table public.restaurants add column convenience_absorbed boolean not null default false;

-- Qual fluxo é este pedido: agendado tem horário de retirada; pago antes do preparo é conveniência. Conta de salão nunca.
create or replace function private.order_convenience_flow(p_order public.orders)
returns text language sql stable security definer set search_path = public, pg_temp as $$
  select case when coalesce((select p.prepaid_required from public.restaurant_model_policies p
      where p.restaurant_id = p_order.restaurant_id and p.service_model = p_order.service_model), false) and p_order.table_session_id is null
    then case when p_order.pickup_slot_start is not null then 'scheduled' else 'pickup' end end
$$;
revoke all on function private.order_convenience_flow(public.orders) from public, anon, authenticated;

-- Copia o valor para o pedido e devolve o que o cliente paga. Com o Dono assumindo, o cliente não vê: o pedido guarda, e a cobrança não soma.
create or replace function private.order_convenience_set(p_order public.orders)
returns bigint language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_flow text := private.order_convenience_flow(p_order); v_fee bigint := 0;
begin
  if v_flow is not null then v_fee := private.convenience_fee_cents(p_order.restaurant_id, v_flow); end if;
  update public.orders set convenience_fee_cents = v_fee where id = p_order.id and convenience_fee_cents <> v_fee;
  if (select convenience_absorbed from public.restaurants where id = p_order.restaurant_id) then return 0; end if;
  return v_fee;
end $$;
revoke all on function private.order_convenience_set(public.orders) from public, anon, authenticated;

create or replace function public.service_payment_reserve_order(
  p_user_id uuid, p_order_id uuid, p_payment_method text, p_idempotency_key uuid,
  p_tip_bps integer default 0, p_tip_cents bigint default 0
) returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  v_order public.orders; v_tx public.gateway_transactions; v_acct public.restaurant_payment_accounts;
  v_policy public.restaurant_model_policies; v_key text; v_expires timestamptz; v_tip bigint; v_amount bigint; v_conv bigint;
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
    v_conv := private.order_convenience_set(v_order);
    v_amount := v_order.total_cents + v_tip + v_conv;

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
      perform private.assert_online_minimum(v_amount);

      insert into public.gateway_transactions(
        restaurant_id, order_id, customer_id, provider, payment_method, amount_cents, tip_cents, convenience_cents,
        refunded_amount_cents, status, idempotency_key, purpose, payment_account_id,
        platform_fee_cents, expires_at, metadata, created_at, updated_at)
      values (
        v_order.restaurant_id, v_order.id, p_user_id, 'asaas', p_payment_method, v_amount, v_tip, v_conv,
        0, 'creating', v_key, 'order', v_acct.id, null, v_expires,
        jsonb_build_object('service_model', v_order.service_model), now(), now())
      returning * into v_tx;
      perform private.noowe_pay_freeze_fee(v_tx);

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
    'amountCents', v_tx.amount_cents,
    'providerRef', v_tx.provider_ref, 'checkoutUrl', v_tx.checkout_url, 'pixPayload', v_tx.pix_payload,
    'expiresAt', v_tx.expires_at, 'paymentAccountId', v_tx.payment_account_id,
    'walletId', v_acct.wallet_id, 'alreadyPaid', false, 'idempotentReplay', v_tx.provider_ref is not null);
end $$;

create or replace function public.customer_start_payment_simulated(
  p_order_id uuid, p_payment_method text, p_idempotency_key uuid,
  p_tip_bps integer default 0, p_tip_cents bigint default 0
) returns jsonb language plpgsql security definer
set search_path = public, private, pg_temp as $$
declare v_order public.orders; v_tx public.gateway_transactions; v_result jsonb; v_key text;
  v_pix_min integer; v_async boolean; v_tip bigint; v_conv bigint;
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
  v_conv := private.order_convenience_set(v_order);
  v_async := v_order.service_model = 'quick_service' and p_payment_method = 'pix';
  if v_async then
    -- Pix já gerado e ainda válido para este pedido: reaproveita.
    select * into v_tx from public.gateway_transactions
      where order_id = v_order.id and payment_method = 'pix' and status = 'pending' and amount_cents = v_order.total_cents + v_tip + v_conv
      order by created_at desc limit 1;
    if v_tx.id is not null then
      return jsonb_build_object('transactionId',v_tx.id,'orderId',v_order.id,'paymentStatus','pending',
        'fulfillmentStatus',v_order.fulfillment_status,'paymentExpiresAt',v_order.payment_expires_at,
        'pixCode','noowe-pix-' || v_tx.id::text,'simulated',true,'idempotentReplay',true);
    end if;
  end if;

  insert into public.gateway_transactions(
    restaurant_id,order_id,customer_id,provider,payment_method,amount,amount_cents,tip_cents,convenience_cents,
    refunded_amount_cents,status,idempotency_key,metadata,created_at,updated_at
  ) values (
    v_order.restaurant_id,v_order.id,auth.uid(),'simulated',p_payment_method,
    (v_order.total_cents + v_tip + v_conv)::numeric/100,v_order.total_cents + v_tip + v_conv,v_tip,v_conv,0,'pending',v_key,
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

create or replace function private.noowe_pay_freeze_fee(p_tx public.gateway_transactions)
returns void language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_bps integer := private.noowe_pay_rate_bps(p_tx.restaurant_id, p_tx.payment_method);
begin
  if v_bps is null then raise exception 'Sem taxa NOOWE Pay definida para %', p_tx.payment_method using errcode = 'P0007'; end if;
  insert into private.noowe_pay_transaction_fees(gateway_transaction_id, restaurant_id, payment_method, rate_bps, amount_cents, fee_cents)
    values (p_tx.id, p_tx.restaurant_id, p_tx.payment_method, v_bps, p_tx.amount_cents,
      -- A conveniência fica fora da base da taxa.
      private.noowe_fee_cents(p_tx.amount_cents - p_tx.convenience_cents, v_bps))
    on conflict (gateway_transaction_id) do nothing;
end $$;

create or replace function public.service_payment_set_split(p_payment_id uuid, p_net_cents bigint)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare f private.noowe_pay_transaction_fees; v_tariff bigint; v_split bigint;
begin
  select * into f from private.noowe_pay_transaction_fees where gateway_transaction_id = p_payment_id for update;
  if f.gateway_transaction_id is null then raise exception 'Cobrança sem taxa registrada' using errcode = 'P0002'; end if;
  if p_net_cents is null or p_net_cents < 0 or p_net_cents > f.amount_cents then raise exception 'Líquido inválido' using errcode = '22023'; end if;
  v_tariff := f.amount_cents - p_net_cents;
  -- A conveniência vai 100% no split. Se o Dono assume, sai do líquido dele.
  v_split := private.noowe_pay_split_cents(f.fee_cents, v_tariff)
    + coalesce((select o.convenience_fee_cents from public.gateway_transactions g join public.orders o on o.id = g.order_id where g.id = p_payment_id), 0);
  update private.noowe_pay_transaction_fees set tariff_cents = v_tariff, split_cents = v_split, updated_at = now() where gateway_transaction_id = p_payment_id;
  return jsonb_build_object('splitCents', v_split);
end $$;

create or replace function private.refund_fee_policy(p_tx uuid)
returns void language plpgsql security definer set search_path = public, private, pg_temp as $$
declare f private.noowe_pay_transaction_fees; g public.gateway_transactions; v_same_day boolean;
begin
  select * into f from private.noowe_pay_transaction_fees where gateway_transaction_id = p_tx;
  if f.gateway_transaction_id is null or f.fee_returned is not null then return; end if;
  select * into g from public.gateway_transactions where id = p_tx;
  v_same_day := coalesce(g.confirmed_at, g.created_at) >= (private.operational_day_current(g.restaurant_id)).started_at;
  if v_same_day then
    update private.noowe_pay_compensations set status = 'voided' where gateway_transaction_id = p_tx and status = 'open';
  elsif private.noowe_pay_split_cents(f.fee_cents, coalesce(f.tariff_cents, f.fee_cents)) > 0 then
    -- Só a parte da taxa: a conveniência foi devolvida ao cliente.
    insert into private.noowe_pay_compensations(restaurant_id, gateway_transaction_id, kind, amount_cents)
      values (f.restaurant_id, p_tx, 'fee_kept_on_refund', private.noowe_pay_split_cents(f.fee_cents, coalesce(f.tariff_cents, f.fee_cents)))
      on conflict (gateway_transaction_id, kind) do nothing;
  end if;
  update private.noowe_pay_transaction_fees set fee_returned = v_same_day, updated_at = now() where gateway_transaction_id = p_tx;
end $$;

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
  from (select g.payment_method as method, sum(g.amount_cents - g.tip_cents - g.convenience_cents)::bigint as cents
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

create or replace function private.fiscal_paid_cents(p_type text, p_id uuid)
returns bigint language sql stable security definer set search_path = public, private, pg_temp as $$
  select case p_type
    when 'table_session' then (
      select case when bool_or(g.provider = 'simulated') then 0 else coalesce(sum(b.base_cents), 0) end
      from public.bill_shares b join public.gateway_transactions g on g.id = b.payment_id
      where b.table_session_id = p_id and b.status = 'paid')
    else (
      select case when bool_or(g.provider = 'simulated') then 0 else coalesce(sum(g.amount_cents - g.tip_cents - g.convenience_cents), 0) end
      from public.orders o join public.gateway_transactions g on g.order_id = o.id and g.status = 'completed'
      where o.id = p_id and o.payment_status = 'confirmed' and o.status::text <> 'cancelled')
  end::bigint
$$;

create or replace function public.restaurant_get_charge_policies(p_restaurant_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, private, pg_temp as $$
begin
  perform private.require_restaurant_role(p_restaurant_id, array['owner','manager']::public.user_roles_role_enum[]);
  return coalesce((select jsonb_agg(jsonb_build_object('serviceModel', p.service_model, 'feeOrTipMode', p.fee_or_tip_mode,
      'serviceFeeBps', p.service_fee_bps, 'tipPresetsBps', to_jsonb(p.tip_presets_bps), 'tipDefaultBps', p.tip_default_bps,
      'splitModes', to_jsonb(p.split_modes), 'prepaid', p.prepaid_required,
      'convenienceCents', case when p.prepaid_required then private.convenience_fee_cents(p.restaurant_id, 'pickup') else 0 end,
      'convenienceAbsorbed', (select r.convenience_absorbed from public.restaurants r where r.id = p.restaurant_id)) order by p.service_model)
    from public.restaurant_model_policies p
    join public.restaurant_model_configs c on c.restaurant_id = p.restaurant_id
    where p.restaurant_id = p_restaurant_id and p.service_model = any(c.service_models)), '[]'::jsonb);
end $$;

-- Quanto o cliente paga no fim: a tela mostra, e a conta é do servidor. O valor real sai do pedido, nunca do app.
create or replace function public.customer_checkout_quote(p_restaurant_id uuid, p_amount_cents bigint, p_scheduled boolean default false, p_tip_bps integer default 0, p_tip_cents bigint default 0)
returns jsonb language plpgsql stable security definer set search_path = public, private, pg_temp as $$
declare v_conv bigint := 0; v_quote jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if not coalesce((select convenience_absorbed from public.restaurants where id = p_restaurant_id), false) then
    v_conv := private.convenience_fee_cents(p_restaurant_id, case when p_scheduled then 'scheduled' else 'pickup' end);
  end if;
  v_quote := public.customer_tip_quote(p_amount_cents, p_tip_bps, p_tip_cents);
  return v_quote || jsonb_build_object('convenienceCents', v_conv, 'totalCents', (v_quote->>'totalCents')::bigint + v_conv);
end $$;
revoke all on function public.customer_checkout_quote(uuid, bigint, boolean, integer, bigint) from public, anon;
grant execute on function public.customer_checkout_quote(uuid, bigint, boolean, integer, bigint) to authenticated;

-- "Pagar a taxa de conveniência pelos meus clientes": só o Dono.
create or replace function public.restaurant_set_convenience_absorbed(p_restaurant_id uuid, p_absorbed boolean)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
begin
  perform private.require_restaurant_role(p_restaurant_id, array['owner']::public.user_roles_role_enum[]);
  update public.restaurants set convenience_absorbed = coalesce(p_absorbed, false) where id = p_restaurant_id;
  perform private.log_audit(p_restaurant_id, 'restaurant.convenience_absorbed', 'restaurant', p_restaurant_id, 'Taxa de conveniência assumida ou devolvida ao cliente',
    null, jsonb_build_object('absorbed', p_absorbed));
  return jsonb_build_object('absorbed', p_absorbed);
end $$;
revoke all on function public.restaurant_set_convenience_absorbed(uuid, boolean) from public, anon;
grant execute on function public.restaurant_set_convenience_absorbed(uuid, boolean) to authenticated;

-- Receita de conveniência, para a equipe NOOWE.
create view private.noowe_report_convenience with (security_invoker = true) as
  select g.restaurant_id, date_trunc('month', coalesce(g.confirmed_at, g.created_at)) as month, count(*) as orders,
    sum(o.convenience_fee_cents)::bigint as fee_cents
  from public.gateway_transactions g join public.orders o on o.id = g.order_id
  where g.status = 'completed' and g.provider <> 'simulated' and o.convenience_fee_cents > 0 group by 1, 2;
revoke all on private.noowe_report_convenience from public, anon, authenticated, service_role;
