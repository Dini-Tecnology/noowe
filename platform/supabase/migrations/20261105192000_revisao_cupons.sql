-- Revisão da P3. O desconto vale para a parte de quem aplicou, e não para a conta inteira; uso reservado se libera quando a conta não sai;
-- cobrança antiga que não bate com o pedido volta ao cliente; desconto nunca leva a cobrança abaixo do mínimo; clientes novos não contam a
-- visita atual; a pessoa vê o desconto antes de pagar; e a recepção vê o valor final antes de cobrar.

-- Desconto a partir do que é elegível. É a mesma conta para a conta real e para a prévia.
create or replace function private.coupon_discount_from(p public.promotions, p_base bigint, p_eligible bigint, p_unit bigint)
returns bigint language plpgsql stable security definer set search_path = public, private, pg_temp as $$
declare v bigint; v_min bigint;
begin
  v := case p.discount_kind
    when 'percent' then div(p_eligible * p.discount_bps + 5000, 10000)::bigint
    when 'fixed' then p.discount_cents
    else coalesce(p_unit, 0) end;
  -- O cupom não leva a cobrança abaixo do mínimo: abaixo disso nem pagar pelo app é possível (pendência 79).
  select min_online_charge_cents into v_min from private.noowe_billing_settings;
  return least(greatest(coalesce(v, 0), 0), p_eligible, greatest(p_base - coalesce(v_min, 0), 0));
end $$;
revoke all on function private.coupon_discount_from(public.promotions, bigint, bigint, bigint) from public, anon, authenticated;

create or replace function private.coupon_item_matches(p public.promotions, p_item uuid, p_category uuid)
returns boolean language sql stable set search_path = pg_temp as $$
  select case when p.discount_kind = 'free_item' then p_item = p.free_item_id
    when p.scope = 'items' then p_item = any(p.scope_ids)
    when p.scope = 'categories' then p_category = any(p.scope_ids)
    else true end $$;
revoke all on function private.coupon_item_matches(public.promotions, uuid, uuid) from public, anon, authenticated;

-- Numa parcela com itens marcados, vale o que é dela. Nas demais, a parte proporcional do que foi pedido: o mesmo item nunca desconta duas vezes.
drop function private.coupon_discount_cents(public.promotions, uuid, uuid, bigint);
create function private.coupon_discount_cents(p public.promotions, p_session uuid, p_order uuid, p_base bigint, p_share uuid default null)
returns bigint language plpgsql stable security definer set search_path = public, private, pg_temp as $$
declare v_eligible bigint := p_base; v_unit bigint; v_matched bigint; v_total bigint; v_lines bigint;
begin
  if p.scope = 'bill' and p.discount_kind <> 'free_item' then
    return private.coupon_discount_from(p, p_base, p_base, null);
  end if;
  select min(coalesce(oi.unit_price_cents, round(oi.unit_price * 100)::bigint)) into v_unit
    from public.order_items oi join public.orders o on o.id = oi.order_id left join public.menu_items mi on mi.id = oi.menu_item_id
    where (o.table_session_id = p_session or o.id = p_order) and oi.status::text <> 'cancelled' and private.coupon_item_matches(p, oi.menu_item_id, mi.category_id);
  if p_share is not null then
    select count(*), sum(l.base_cents) filter (where private.coupon_item_matches(p, oi.menu_item_id, mi.category_id)) into v_lines, v_matched
      from public.bill_share_lines l join public.order_items oi on oi.id = l.order_item_id left join public.menu_items mi on mi.id = oi.menu_item_id
      where l.bill_share_id = p_share;
  end if;
  if coalesce(v_lines, 0) > 0 then
    v_eligible := coalesce(v_matched, 0);
  else
    select coalesce(sum(coalesce(oi.total_price_cents, round(oi.total_price * 100)::bigint)) filter (where private.coupon_item_matches(p, oi.menu_item_id, mi.category_id)), 0),
        coalesce(sum(coalesce(oi.total_price_cents, round(oi.total_price * 100)::bigint)), 0) into v_matched, v_total
      from public.order_items oi join public.orders o on o.id = oi.order_id left join public.menu_items mi on mi.id = oi.menu_item_id
      where (o.table_session_id = p_session or o.id = p_order) and oi.status::text <> 'cancelled';
    v_eligible := case when p_session is null or v_total <= 0 then v_matched else div(v_matched * least(p_base, v_total), v_total)::bigint end;
  end if;
  return private.coupon_discount_from(p, p_base, least(v_eligible, p_base), v_unit);
end $$;
revoke all on function private.coupon_discount_cents(public.promotions, uuid, uuid, bigint, uuid) from public, anon, authenticated;

create or replace function private.share_set_coupon(p_share uuid, p public.promotions, p_user uuid)
returns bigint language plpgsql security definer set search_path = public, private, pg_temp as $$
declare s public.bill_shares; v_disc bigint; v_bps integer; v_fee bigint; v_amount bigint;
begin
  select * into s from public.bill_shares where id = p_share for update;
  v_disc := case when p.id is null then 0 else private.coupon_discount_cents(p, s.table_session_id, null, s.base_cents, p_share) end;
  v_bps := private.session_fee_bps(s.table_session_id);
  v_fee := case when s.fee_waived_at is not null then 0 else private.service_fee_cents(s.base_cents - v_disc, v_bps) end;
  v_amount := s.base_cents - v_disc + v_fee;
  update public.promotion_redemptions set status = 'cancelled', updated_at = now() where bill_share_id = p_share and status = 'reserved';
  -- A gorjeta já escolhida acompanha o novo valor, sem passar dele.
  update public.bill_shares set coupon_id = p.id, coupon_discount_cents = v_disc, service_fee_cents = v_fee, amount_cents = v_amount,
      tip_cents = case when v_amount > 0 then least(tip_cents, v_amount) else tip_cents end, updated_at = now() where id = p_share;
  if p.id is not null and v_disc > 0 then
    insert into public.promotion_redemptions(promotion_id, user_id, table_session_id, bill_share_id, discount_cents, status)
      values (p.id, p_user, s.table_session_id, p_share, v_disc, 'reserved');
  end if;
  return v_disc;
end $$;

-- O automático que melhor serve. Trava as linhas: quem aplica ao mesmo tempo espera, e o limite não estoura.
create or replace function private.coupon_best_auto(p_restaurant uuid, p_model text, p_user uuid, p_session uuid, p_order uuid, p_base bigint, p_share uuid default null)
returns public.promotions language plpgsql security definer set search_path = public, private, pg_temp as $$
declare p public.promotions; v_best public.promotions; v_best_cents bigint := 0; v bigint;
begin
  for p in select * from public.promotions x where x.restaurant_id = p_restaurant and x.is_auto and x.status = 'active' and x.discount_kind is not null for update loop
    continue when private.coupon_refusal(p, p_model, p_user, p_base) is not null;
    v := private.coupon_discount_cents(p, p_session, p_order, p_base, p_share);
    if v > v_best_cents then v_best := p; v_best_cents := v; end if;
  end loop;
  return v_best;
end $$;
revoke all on function private.coupon_best_auto(uuid, text, uuid, uuid, uuid, bigint, uuid) from public, anon, authenticated;

create or replace function private.coupon_attach(p_share uuid, p_previous uuid)
returns void language plpgsql security definer set search_path = public, private, pg_temp as $$
declare s public.bill_shares; p public.promotions; v_user uuid; v_model text; v_best public.promotions;
begin
  select * into s from public.bill_shares where id = p_share;
  select user_id into v_user from public.table_session_participants where id = s.participant_id;
  select service_model::text into v_model from public.table_sessions where id = s.table_session_id;
  if p_previous is not null then
    select * into p from public.promotions where id = p_previous for update;
    if p.id is not null and private.coupon_refusal(p, v_model, v_user, s.base_cents) is null then
      perform private.share_set_coupon(p_share, p, v_user);
      return;
    end if;
  end if;
  if exists (select 1 from public.bill_shares b where b.participant_id = s.participant_id and b.table_session_id = s.table_session_id and b.status = 'paid' and b.coupon_id is not null) then return; end if;
  v_best := private.coupon_best_auto(s.restaurant_id, v_model, v_user, s.table_session_id, null, s.base_cents, p_share);
  if v_best.id is not null then perform private.share_set_coupon(p_share, v_best, v_user); end if;
end $$;

create or replace function private.coupon_order_set(p_order public.orders, p public.promotions, p_user uuid)
returns bigint language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_gross bigint := p_order.total_cents + p_order.coupon_discount_cents; v_disc bigint;
begin
  v_disc := case when p.id is null then 0 else private.coupon_discount_cents(p, null, p_order.id, v_gross) end;
  update public.promotion_redemptions set status = 'cancelled', updated_at = now() where order_id = p_order.id and status = 'reserved';
  update public.orders set coupon_id = p.id, coupon_discount_cents = v_disc, total_cents = v_gross - v_disc,
      discount_cents = coalesce(discount_cents, 0) - p_order.coupon_discount_cents + v_disc,
      discount_amount = (coalesce(discount_cents, 0) - p_order.coupon_discount_cents + v_disc)::numeric / 100,
      total_amount = (v_gross - v_disc)::numeric / 100, updated_at = now()
    where id = p_order.id;
  if p.id is not null and v_disc > 0 then
    insert into public.promotion_redemptions(promotion_id, user_id, order_id, discount_cents, status) values (p.id, p_user, p_order.id, v_disc, 'reserved');
  end if;
  return v_disc;
end $$;

create or replace function private.coupon_order_auto(p_order public.orders)
returns void language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_best public.promotions;
begin
  if p_order.coupon_id is not null then return; end if;
  v_best := private.coupon_best_auto(p_order.restaurant_id, p_order.service_model::text, p_order.customer_id, null, p_order.id, p_order.total_cents);
  if v_best.id is not null then perform private.coupon_order_set(p_order, v_best, p_order.customer_id); end if;
end $$;

-- Pedido pago, o uso vale. Pedido que não saiu devolve o uso.
create or replace function private.coupon_follow_order()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.coupon_id is null then return new; end if;
  if new.payment_status = 'confirmed' and old.payment_status is distinct from 'confirmed' then
    update public.promotion_redemptions set status = 'applied', updated_at = now() where order_id = new.id and status = 'reserved';
    update public.promotions set first_used_at = coalesce(first_used_at, now()) where id = new.coupon_id;
  elsif new.payment_status = 'refunded' and old.payment_status is distinct from 'refunded' then
    update public.promotion_redemptions set status = 'cancelled', updated_at = now() where order_id = new.id and status in ('reserved', 'applied');
  elsif new.payment_status = 'failed' or new.fulfillment_status = 'cancelled' then
    update public.promotion_redemptions set status = 'cancelled', updated_at = now() where order_id = new.id and status = 'reserved';
  end if;
  return new;
end $$;
revoke all on function private.coupon_follow_order() from public, anon, authenticated;
create trigger zz_orders_coupon after update of payment_status, fulfillment_status on public.orders for each row execute function private.coupon_follow_order();

-- Conta encerrada sem a parcela paga: o uso reservado volta.
create or replace function private.coupon_follow_session()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if old.status = 'active' and new.status <> 'active' then
    update public.promotion_redemptions set status = 'cancelled', updated_at = now() where table_session_id = new.id and status = 'reserved';
  end if;
  return new;
end $$;
revoke all on function private.coupon_follow_session() from public, anon, authenticated;
create trigger zz_table_sessions_coupon after update of status on public.table_sessions for each row execute function private.coupon_follow_session();

-- A visita atual não conta como visita anterior: comanda aberta e pedido ainda não pago ficam de fora.
create or replace function private.customer_in_group(p_restaurant uuid, p_user uuid, p_audience text, p_inactive_days integer)
returns boolean language plpgsql stable security definer set search_path = public, pg_temp as $$
declare c public.customer_profiles; v_last timestamptz;
begin
  if p_audience = 'all' then return true; end if;
  if p_user is null then return false; end if;
  select * into c from public.customer_profiles where restaurant_id = p_restaurant and user_id = p_user;
  select max(o.created_at) into v_last from public.orders o where o.restaurant_id = p_restaurant and o.customer_id = p_user and o.status::text <> 'cancelled'
    and case when o.table_session_id is not null then exists (select 1 from public.table_sessions s where s.id = o.table_session_id and s.status <> 'active')
      else o.payment_status = 'confirmed' end;
  v_last := greatest(v_last, c.last_visit_at);
  -- Sem ficha, o resultado seria nulo, e o cupom passaria por engano.
  return coalesce(case p_audience
    when 'new' then v_last is null and coalesce(c.total_visits, 0) = 0
    when 'vip' then c.segment = 'vip'
    when 'birthday' then (select extract(month from coalesce(c.birthday, p.birth_date)) from public.profiles p where p.id = p_user) = extract(month from now() at time zone 'America/Sao_Paulo')
    when 'inactive' then v_last is not null and v_last < now() - make_interval(days => p_inactive_days)
    else false end, false);
end $$;

-- A pessoa vê o desconto antes de pagar. Só mostra: quem aplica é o servidor, na hora de cobrar.
create or replace function public.customer_coupon_preview(p_restaurant_id uuid, p_code text, p_amount_cents bigint, p_items jsonb, p_service_model text default null)
returns jsonb language plpgsql stable security definer set search_path = public, private, pg_temp as $$
declare p public.promotions; v_user uuid := auth.uid(); v_refusal text; v_disc bigint := 0; v_best_cents bigint := 0; v_code text := nullif(btrim(coalesce(p_code, '')), '');
  x public.promotions; v bigint;
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if v_code is not null then
    select * into p from public.promotions c where c.restaurant_id = p_restaurant_id and upper(c.code) = upper(v_code) and c.discount_kind is not null;
    if p.id is null then return jsonb_build_object('discountCents', 0, 'amountCents', p_amount_cents, 'refusal', 'Cupom não encontrado'); end if;
    v_refusal := private.coupon_refusal(p, p_service_model, v_user, p_amount_cents);
    if v_refusal is not null then return jsonb_build_object('discountCents', 0, 'amountCents', p_amount_cents, 'refusal', v_refusal); end if;
    v_disc := private.coupon_preview_cents(p, p_amount_cents, p_items);
    if v_disc <= 0 then return jsonb_build_object('discountCents', 0, 'amountCents', p_amount_cents, 'refusal', 'Este cupom não vale para o que você pediu'); end if;
  else
    for x in select * from public.promotions c where c.restaurant_id = p_restaurant_id and c.is_auto and c.status = 'active' and c.discount_kind is not null loop
      continue when private.coupon_refusal(x, p_service_model, v_user, p_amount_cents) is not null;
      v := private.coupon_preview_cents(x, p_amount_cents, p_items);
      if v > v_best_cents then p := x; v_best_cents := v; end if;
    end loop;
    v_disc := v_best_cents;
  end if;
  return jsonb_build_object('discountCents', v_disc, 'amountCents', p_amount_cents - v_disc, 'couponTitle', p.title);
end $$;
revoke all on function public.customer_coupon_preview(uuid, text, bigint, jsonb, text) from public, anon;
grant execute on function public.customer_coupon_preview(uuid, text, bigint, jsonb, text) to authenticated;

create or replace function private.coupon_preview_cents(p public.promotions, p_amount bigint, p_items jsonb)
returns bigint language plpgsql stable security definer set search_path = public, private, pg_temp as $$
declare v_matched bigint; v_unit bigint;
begin
  if p.scope = 'bill' and p.discount_kind <> 'free_item' then return private.coupon_discount_from(p, p_amount, p_amount, null); end if;
  select coalesce(sum(round(m.price * 100)::bigint * (i->>'quantity')::integer), 0), min(round(m.price * 100)::bigint) into v_matched, v_unit
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) i join public.menu_items m on m.id = (i->>'menuItemId')::uuid and m.restaurant_id = p.restaurant_id
    where private.coupon_item_matches(p, m.id, m.category_id);
  return private.coupon_discount_from(p, p_amount, least(v_matched, p_amount), v_unit);
end $$;
revoke all on function private.coupon_preview_cents(public.promotions, bigint, jsonb) from public, anon, authenticated;

create or replace function public.customer_remove_coupon_from_order(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare o public.orders; v_none public.promotions;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select * into o from public.orders where id = p_order_id and customer_id = auth.uid() for update;
  if o.id is null then raise exception 'Pedido não encontrado' using errcode = 'P0002'; end if;
  if o.payment_status = 'confirmed' then raise exception 'Este pedido já foi pago' using errcode = 'P0001'; end if;
  perform private.coupon_order_set(o, v_none, auth.uid());
  select * into o from public.orders where id = p_order_id;
  return jsonb_build_object('orderId', o.id, 'totalCents', o.total_cents);
end $$;
revoke all on function public.customer_remove_coupon_from_order(uuid) from public, anon;
grant execute on function public.customer_remove_coupon_from_order(uuid) to authenticated;

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

  -- Estorno parcial: a venda continua de pé. A transação segue concluída, e só o valor estornado muda.
  if p_outcome = 'refunded' and p_gateway_status = 'partially_refunded' then
    perform private.refund_settle(v_tx.id, false);
    -- O último estorno pode zerar a venda mesmo chegando como parcial.
    if (select g.refunded_amount_cents < g.amount_cents from public.gateway_transactions g where g.id = v_tx.id) then
      return jsonb_build_object('transactionId', v_tx.id, 'orderId', v_tx.order_id, 'partialRefund', true, 'idempotentReplay', false);
    end if;
    p_gateway_status := 'refunded';
  end if;
  if p_outcome = 'refund_pending' and not private.refund_is_total(v_tx.id) then
    return jsonb_build_object('transactionId', v_tx.id, 'orderId', v_tx.order_id, 'partialRefund', true, 'idempotentReplay', false);
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
    -- Outra cobrança já pagou este pedido: esta volta ao cliente.
    or v_order.payment_status = 'confirmed'
    -- Cobrança de antes de o cupom mudar: o valor não é mais o do pedido, e o pedido não sai por ela.
    or (v_tx.purpose = 'order' and v_order.total_cents is not null and v_tx.amount_cents - v_tx.tip_cents - v_tx.convenience_cents <> v_order.total_cents)
  ) then
    v_late := true;
  end if;

  perform set_config('noowe.status_actor', 'system', true);
  update public.gateway_transactions
    set status = case when v_late then 'completed' else v_status end,
        confirmed_at = case when p_outcome = 'confirmed' then coalesce(confirmed_at, now()) else confirmed_at end,
        updated_at = now()
    where id = v_tx.id;
  if p_outcome = 'refunded' then
    perform private.refund_settle(v_tx.id, true);
    perform private.refund_fee_policy(v_tx.id);
  end if;
  if p_outcome = 'confirmed' and not v_late then perform private.noowe_pay_on_confirmed(v_tx.id); end if;
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

create or replace function public.customer_apply_coupon_to_order(p_order_id uuid, p_code text)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare o public.orders; p public.promotions; v bigint;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select * into o from public.orders where id = p_order_id and customer_id = auth.uid() for update;
  if o.id is null then raise exception 'Pedido não encontrado' using errcode = 'P0002'; end if;
  if o.payment_status = 'confirmed' then raise exception 'Este pedido já foi pago' using errcode = 'P0001'; end if;
  -- Pedido de comanda abate do saldo da mesa: o cupom é da parte da pessoa, na hora de pagar.
  if o.table_session_id is not null then raise exception 'Nesta comanda, use o cupom na hora de pagar a sua parte' using errcode = 'P0017'; end if;
  p := private.coupon_for_code(o.restaurant_id, p_code);
  if o.coupon_id = p.id then return jsonb_build_object('orderId', o.id, 'discountCents', o.coupon_discount_cents, 'totalCents', o.total_cents, 'couponTitle', p.title); end if;
  update public.promotion_redemptions set status = 'cancelled', updated_at = now() where order_id = o.id and status = 'reserved';
  perform private.coupon_assert_valid(p, o.service_model::text, auth.uid(), o.total_cents + o.coupon_discount_cents);
  v := private.coupon_order_set(o, p, auth.uid());
  if v <= 0 then raise exception 'Este cupom não vale para o que você pediu' using errcode = 'P0017'; end if;
  select * into o from public.orders where id = p_order_id;
  return jsonb_build_object('orderId', o.id, 'discountCents', v, 'totalCents', o.total_cents, 'couponTitle', p.title);
end $$;

create or replace function public.customer_set_share_fee_waived(p_share_id uuid, p_waived boolean)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare s public.bill_shares; v_bps integer; v_base bigint; v_fee bigint; v_total bigint; v_balance bigint;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  perform 1 from public.table_sessions t join public.bill_shares b on b.table_session_id = t.id where b.id = p_share_id for update of t;
  select * into s from public.bill_shares where id = p_share_id for update;
  if s.id is null or not private.share_payer_allowed(s, auth.uid()) then
    raise exception 'Parcela não encontrada' using errcode = 'P0002'; end if;
  if s.status <> 'open' then raise exception 'Parcela não está aberta' using errcode = 'P0001'; end if;
  if private.fee_or_tip_mode(s.table_session_id) <> 'service_fee' then
    raise exception 'Este restaurante não cobra taxa de serviço' using errcode = '22023'; end if;
  if coalesce(p_waived, false) = (s.fee_waived_at is not null) then
    return jsonb_build_object('shareId', s.id, 'baseCents', s.base_cents, 'feeCents', s.service_fee_cents,
      'amountCents', s.amount_cents, 'feeWaived', s.fee_waived_at is not null);
  end if;
  v_bps := private.session_fee_bps(s.table_session_id);
  v_balance := private.session_consumption_balance(s.table_session_id);
  -- O cupom fica de fora da conta: o valor fixo é antes dele, e retirar e devolver a taxa não desconta de novo.
  v_total := s.amount_cents + s.coupon_discount_cents;
  if s.mode = 'fixed_amount' then
    -- Valor fixo é o que sai do cartão: sem a taxa, o mesmo valor é todo consumo.
    if p_waived then
      v_base := private.adjust_to_balance(v_total, v_balance); v_fee := 0;
    else
      select x.base_cents, x.rest_cents into v_base, v_fee from private.split_out_of_total(v_total, v_bps) x;
    end if;
  else
    v_base := s.base_cents;
    v_fee := case when p_waived then 0 else private.service_fee_cents(v_base - s.coupon_discount_cents, v_bps) end;
  end if;
  update public.bill_shares set base_cents = v_base, service_fee_cents = v_fee, amount_cents = v_base - s.coupon_discount_cents + v_fee,
      fee_waived_by = case when p_waived then auth.uid() end,
      fee_waived_at = case when p_waived then now() end,
      fee_waived_reason = case when p_waived then 'A pedido do cliente' end,
      updated_at = now()
    where id = s.id;
  perform private.log_audit(s.restaurant_id, case when p_waived then 'bill.fee_waived' else 'bill.fee_restored' end,
    'bill_share', s.id, case when p_waived then 'A pedido do cliente' else 'Cliente manteve a taxa' end,
    jsonb_build_object('feeCents', s.service_fee_cents), jsonb_build_object('feeCents', v_fee));
  return jsonb_build_object('shareId', s.id, 'baseCents', v_base, 'feeCents', v_fee, 'amountCents', v_base - s.coupon_discount_cents + v_fee, 'feeWaived', p_waived);
end $$;

create or replace function private.commit_split(
  p_session uuid, p_actor uuid, p_mode public.noowe_split_mode, p_params jsonb,
  p_expected_version text, p_key uuid
) returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  v_session public.table_sessions; v_plan jsonb; v_share jsonb; v_id uuid; v_round integer; v_ids uuid[] := '{}';
  v_line jsonb; v_prev public.bill_shares; v_part uuid; v_sum bigint := 0; v_balance bigint;
begin
  select * into v_session from public.table_sessions where id = p_session for update;
  if v_session.id is null or v_session.status <> 'active' then
    raise exception 'Sessão da mesa indisponível' using errcode = 'P0001'; end if;
  if p_actor is not null and not exists (
    select 1 from public.table_session_participants where table_session_id = p_session and user_id = p_actor) then
    raise exception 'Participante não encontrado' using errcode = 'P0001'; end if;

  if p_key is not null and p_actor is not null then
    select coalesce(array_agg(id), '{}') into v_ids from public.bill_shares
      where committed_by = p_actor and idempotency_key = p_key and table_session_id = p_session;
    if cardinality(v_ids) > 0 then
      return jsonb_build_object('shareIds', to_jsonb(v_ids), 'idempotentReplay', true);
    end if;
  end if;
  if p_expected_version is not null and p_expected_version <> private.split_version(p_session) then
    raise exception 'A conta mudou. Confira os valores atualizados.' using errcode = 'P0012'; end if;

  v_plan := private.compute_split(p_session, p_mode, p_params, p_actor);
  v_balance := (v_plan->>'balanceCents')::bigint;
  select coalesce(max(round_no), 0) + 1 into v_round from public.bill_shares where table_session_id = p_session;
  v_ids := '{}';
  for v_share in select * from jsonb_array_elements(v_plan->'shares') loop
    v_part := (v_share->>'participantId')::uuid;
    v_sum := v_sum + (v_share->>'baseCents')::bigint;
    select * into v_prev from public.bill_shares s
      where s.table_session_id = p_session and s.participant_id = v_part and s.status = 'open';
    update public.bill_shares set status = 'superseded', updated_at = now()
      where table_session_id = p_session and participant_id = v_part and status = 'open';
    insert into public.bill_shares(restaurant_id, table_session_id, participant_id, round_no, mode,
        base_cents, service_fee_cents, amount_cents, tip_cents, committed_by, idempotency_key,
        fee_waived_by, fee_waived_at, fee_waived_reason)
      values (v_session.restaurant_id, p_session, v_part, v_round,
        (v_share->>'mode')::public.noowe_split_mode, (v_share->>'baseCents')::bigint,
        (v_share->>'feeCents')::bigint, (v_share->>'amountCents')::bigint, (v_share->>'tipCents')::bigint, p_actor, p_key,
        case when (v_share->>'feeWaived')::boolean then coalesce(v_prev.fee_waived_by, p_actor) end,
        case when (v_share->>'feeWaived')::boolean then coalesce(v_prev.fee_waived_at, now()) end,
        case when (v_share->>'feeWaived')::boolean then coalesce(v_prev.fee_waived_reason, 'A pedido do cliente') end)
      returning id into v_id;
    v_ids := v_ids || v_id;
    if (v_share->>'feeWaived')::boolean and v_prev.fee_waived_at is null then
      perform private.log_audit(v_session.restaurant_id, 'bill.fee_waived', 'bill_share', v_id, 'A pedido do cliente',
        null, jsonb_build_object('baseCents', v_share->'baseCents'), p_actor);
    end if;
    for v_line in select * from jsonb_array_elements(v_share->'lines') loop
      insert into public.bill_share_lines(bill_share_id, order_item_id, base_cents)
        values (v_id, (v_line->>'orderItemId')::uuid, (v_line->>'baseCents')::bigint);
    end loop;
    -- O cupom acompanha a pessoa, como a retirada da taxa. Sem cupom, vale o automático, se a regra bater.
    -- Depois das linhas: desconto por item olha o que é desta parcela.
    perform private.coupon_attach(v_id, v_prev.coupon_id);
  end loop;
  -- O que o plano substitui e não recriou (quem saiu da divisão) também deixa de valer.
  update public.bill_shares set status = 'superseded', updated_at = now()
    where id in (select (x)::uuid from jsonb_array_elements_text(v_plan->'excludeShareIds') x) and status = 'open';
  update public.table_sessions set billing_status = 'billing',
      billing_started_at = coalesce(billing_started_at, now()), updated_at = now() where id = p_session;

  -- Invariante: nunca se cobra mais consumo do que o saldo.
  if v_sum > v_balance then
    raise exception 'Soma das parcelas (%) excede o saldo (%)', v_sum, v_balance using errcode = 'P0009'; end if;
  return v_plan - 'shares' || jsonb_build_object('shareIds', to_jsonb(v_ids), 'round', v_round,
    'sharesCount', cardinality(v_ids), 'idempotentReplay', false);
end $$;

create or replace function public.restaurant_record_bill_payment(
  p_table_session_id uuid, p_payment_method text, p_idempotency_key uuid,
  p_base_cents bigint default null, p_waive_fee boolean default false, p_tip_cents bigint default 0, p_reason text default null,
  p_voucher_kind text default null, p_coupon_code text default null
) returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  v_session public.table_sessions; v_key text; v_tx public.gateway_transactions; v_balance bigint; v_bps integer; v_base bigint; v_fee bigint;
  v_tip bigint := coalesce(p_tip_cents, 0); v_share uuid; v_kind public.noowe_tip_allocation; v_waiter uuid; v_closed boolean := false;
  v_reason text := coalesce(nullif(btrim(p_reason), ''), 'A pedido do cliente');
  v_coupon public.promotions; v_discount bigint := 0;
begin
  if p_idempotency_key is null then raise exception 'Idempotency key required' using errcode = '22023'; end if;
  if p_payment_method not in ('cash', 'credit_card', 'debit_card', 'pix', 'voucher') then
    raise exception 'Forma de pagamento inválida' using errcode = '22023'; end if;
  select * into v_session from public.table_sessions where id = p_table_session_id for update;
  -- O Dono escolhe quais vales aceita. Vale é sempre externo: maquininha da casa.
  if p_payment_method = 'voucher' and not coalesce((select p_voucher_kind = any(r.accepted_vouchers) from public.restaurants r where r.id = v_session.restaurant_id), false) then
    raise exception 'Este vale não é aceito neste restaurante' using errcode = '22023'; end if;
  if v_session.id is null then raise exception 'Table session not found' using errcode = 'P0002'; end if;
  perform private.require_restaurant_role(v_session.restaurant_id, array['owner','manager','waiter','maitre']::public.user_roles_role_enum[]);
  perform private.require_table_access(v_session, auth.uid());

  v_key := 'manual-share:' || p_table_session_id || ':' || p_idempotency_key;
  select * into v_tx from public.gateway_transactions where idempotency_key = v_key;
  if v_tx.id is not null then
    return jsonb_build_object('transactionId', v_tx.id, 'shareId', v_tx.bill_share_id, 'amountCents', v_tx.amount_cents, 'idempotentReplay', true);
  end if;
  if v_session.status <> 'active' then raise exception 'Sessão já encerrada' using errcode = 'P0001'; end if;

  v_balance := private.session_consumption_balance(p_table_session_id);
  if v_balance <= 0 and coalesce(p_tip_cents, 0) = 0 then raise exception 'Esta conta já está quitada' using errcode = 'P0011'; end if;
  -- Valor zero com gorjeta: pagamento misto, com vale no consumo e cartão na gorjeta.
  if p_base_cents is not null and (p_base_cents < 0 or (p_base_cents = 0 and coalesce(p_tip_cents, 0) = 0)) then raise exception 'Valor inválido' using errcode = '22023'; end if;
  v_base := private.adjust_to_balance(coalesce(p_base_cents, v_balance), v_balance);
  v_bps := private.session_fee_bps(p_table_session_id);
  -- Garçom aplica o cupom a pedido do cliente sem app. O desconto entra antes da taxa.
  if nullif(btrim(coalesce(p_coupon_code, '')), '') is not null then
    v_coupon := private.coupon_for_code(v_session.restaurant_id, p_coupon_code);
    perform private.coupon_assert_valid(v_coupon, v_session.service_model::text, null, v_base);
    v_discount := private.coupon_discount_cents(v_coupon, p_table_session_id, null, v_base);
    if v_discount <= 0 then raise exception 'Este cupom não vale para esta conta' using errcode = 'P0017'; end if;
  elsif v_base > 0 then
    -- Na comanda, sem cliente identificado, o automático vale se for para todos.
    v_coupon := private.coupon_best_auto(v_session.restaurant_id, v_session.service_model::text, null, p_table_session_id, null, v_base);
    if v_coupon.id is not null then v_discount := private.coupon_discount_cents(v_coupon, p_table_session_id, null, v_base); end if;
  end if;
  v_fee := case when coalesce(p_waive_fee, false) then 0 else private.service_fee_cents(v_base - v_discount, v_bps) end;
  -- Gorjeta só no cartão (vale no consumo): o teto é o saldo que ela acompanha.
  if v_tip < 0 or v_tip > (case when v_base > 0 then v_base + v_fee else v_balance end) then raise exception 'Gorjeta inválida' using errcode = '22023'; end if;
  if v_tip > 0 and private.fee_or_tip_mode(p_table_session_id) <> 'tip' then
    raise exception 'Este restaurante usa taxa de serviço: não há gorjeta nesta conta' using errcode = '22023'; end if;

  select c.tip_allocation into v_kind from public.restaurant_model_configs c where c.restaurant_id = v_session.restaurant_id;
  if v_kind = 'table_waiter' then
    select t.assigned_waiter_id into v_waiter from public.tables t where t.id = v_session.table_id;
  end if;
  insert into public.bill_shares(restaurant_id, table_session_id, participant_id, round_no, mode, base_cents, service_fee_cents, amount_cents, coupon_discount_cents, coupon_id,
      tip_cents, tip_recipient_kind, tip_recipient_user_id, status, committed_by, paid_at, fee_waived_by, fee_waived_at, fee_waived_reason)
    values (v_session.restaurant_id, p_table_session_id, null,
      (select coalesce(max(round_no), 0) + 1 from public.bill_shares where table_session_id = p_table_session_id),
      'fixed_amount', v_base, v_fee, v_base - v_discount + v_fee, v_discount, v_coupon.id, v_tip, v_kind, v_waiter, 'paid', auth.uid(), now(),
      case when p_waive_fee and v_bps > 0 then auth.uid() end, case when p_waive_fee and v_bps > 0 then now() end,
      case when p_waive_fee and v_bps > 0 then v_reason end)
    returning id into v_share;
  insert into public.gateway_transactions(restaurant_id, provider, payment_method, amount_cents, tip_cents, refunded_amount_cents, status,
      idempotency_key, purpose, table_session_id, bill_share_id, confirmed_at, metadata, created_at, updated_at)
    values (v_session.restaurant_id, 'manual', p_payment_method, v_base - v_discount + v_fee + v_tip, v_tip, 0, 'completed', v_key, 'bill_share',
      p_table_session_id, v_share, now(), jsonb_build_object('recorded_by', auth.uid(), 'external', p_payment_method <> 'cash', 'voucher_kind', p_voucher_kind), now(), now())
    returning * into v_tx;
  -- Maquininha da casa é pagamento externo, fora do caixa. Dinheiro entra na gaveta (pendência 36).
  if p_payment_method = 'cash' then
    perform private.cash_record(v_session.restaurant_id, 'sale', v_tx.amount_cents, 'Recebido na comanda', v_tx.id, null);
  end if;
  update public.bill_shares set payment_id = v_tx.id where id = v_share;
  if v_discount > 0 then
    insert into public.promotion_redemptions(promotion_id, user_id, table_session_id, bill_share_id, discount_cents, status)
      values (v_coupon.id, null, p_table_session_id, v_share, v_discount, 'applied');
    update public.promotions set first_used_at = coalesce(first_used_at, now()) where id = v_coupon.id;
  end if;
  if p_waive_fee and v_bps > 0 then
    perform private.log_audit(v_session.restaurant_id, 'bill.fee_waived', 'bill_share', v_share, v_reason,
      null, jsonb_build_object('baseCents', v_base));
  end if;
  begin
    v_closed := private.close_session_if_settled(p_table_session_id);
  exception when others then
    perform private.log_system_audit(v_session.restaurant_id, 'bill.close_failed', 'table_session', p_table_session_id, sqlerrm, null, null);
  end;
  return jsonb_build_object('transactionId', v_tx.id, 'shareId', v_share, 'baseCents', v_base, 'feeCents', v_fee, 'tipCents', v_tip,
    'amountCents', v_tx.amount_cents, 'balanceCents', v_balance - v_base, 'requestedCents', p_base_cents,
    'adjusted', p_base_cents is not null and p_base_cents > v_balance, 'closed', v_closed, 'idempotentReplay', false);
end $$;

create or replace function public.restaurant_send_coupon(p_coupon_id uuid)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare p public.promotions; v_user uuid; v_n integer := 0;
begin
  select * into p from public.promotions where id = p_coupon_id;
  if p.id is null then raise exception 'Cupom não encontrado' using errcode = 'P0002'; end if;
  perform private.require_restaurant_role(p.restaurant_id, array['owner','manager']::public.user_roles_role_enum[]);
  if private.coupon_display_status(p) <> 'active' then raise exception 'Só um cupom ativo pode ser enviado' using errcode = 'P0001'; end if;
  for v_user in
    select distinct u.id from public.profiles u
    where u.marketing_consent and (u.id in (select customer_id from public.orders where restaurant_id = p.restaurant_id and customer_id is not null)
      or u.id in (select user_id from public.customer_profiles where restaurant_id = p.restaurant_id))
  loop
    continue when not private.customer_in_group(p.restaurant_id, v_user, p.audience, p.inactive_days);
    perform private.create_notification(v_user, p.title, coalesce(p.description, 'Use o cupom ' || p.code || '.'), 'system', p.id, null,
      jsonb_build_object('kind', 'restaurant_coupon', 'restaurant_id', p.restaurant_id, 'code', p.code));
    v_n := v_n + 1;
  end loop;
  perform private.log_audit(p.restaurant_id, 'coupon.sent', 'promotion', p.id, 'Cupom enviado a um grupo', null, jsonb_build_object('recipients', v_n));
  return jsonb_build_object('recipients', v_n);
end $$;

create or replace function private.coupon_assert_shape(p_restaurant uuid, p jsonb) returns void language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_from text := nullif(p->>'hoursFrom', ''); v_until text := nullif(p->>'hoursUntil', ''); v_scope text := coalesce(p->>'scope', 'bill'); v_format text := '^([01][0-9]|2[0-3]):[0-5][0-9]$';
begin
  if (v_from is null) <> (v_until is null) then raise exception 'Informe o início e o fim do horário' using errcode = '22023'; end if;
  if v_from is not null and (v_from !~ v_format or v_until !~ v_format) then raise exception 'Confira o horário, no formato 15:00' using errcode = '22023'; end if;
  if v_from is not null and v_from >= v_until then raise exception 'O horário final precisa ser depois do inicial' using errcode = '22023'; end if;
  if p->>'audience' = 'inactive' and coalesce((p->>'inactiveDays')::integer, 0) <= 0 then raise exception 'Diga há quantos dias sem visita' using errcode = '22023'; end if;
  if v_scope <> 'bill' and coalesce(jsonb_array_length(p->'scopeIds'), 0) = 0 then raise exception 'Escolha onde o cupom vale' using errcode = '22023'; end if;
  if p->>'discountKind' = 'free_item' and not exists (select 1 from public.menu_items m where m.id = (p->>'freeItemId')::uuid and m.restaurant_id = p_restaurant) then
    raise exception 'Escolha o item grátis' using errcode = '22023'; end if;
end $$;

create or replace function private.write_share_receipt(p_tx_id uuid)
returns void language plpgsql security definer set search_path = public, private, pg_temp as $$
declare tx public.gateway_transactions; s public.bill_shares; v_items jsonb;
begin
  select * into tx from public.gateway_transactions where id = p_tx_id;
  select * into s from public.bill_shares where id = tx.bill_share_id;
  if s.id is null or tx.customer_id is null then return; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'name', coalesce(mi.name, 'Item') || case when l.base_cents < item.cents then ' (parcial)' else '' end,
      'quantity', case when l.base_cents < item.cents then 1 else oi.quantity end,
      'unitPrice', l.base_cents::numeric / 100 / (case when l.base_cents < item.cents then 1 else greatest(oi.quantity, 1) end),
      'totalPrice', l.base_cents::numeric / 100) order by oi.created_at, oi.id), '[]'::jsonb)
    into v_items
  from public.bill_share_lines l
  join public.order_items oi on oi.id = l.order_item_id
  left join public.menu_items mi on mi.id = oi.menu_item_id
  cross join lateral (select coalesce(oi.total_price_cents, round(oi.total_price * 100)::bigint) as cents) item
  where l.bill_share_id = s.id;
  -- Valor fixo e partes iguais abatem do saldo sem marcar item.
  if jsonb_array_length(v_items) = 0 then
    v_items := jsonb_build_array(jsonb_build_object('name', 'Consumo', 'quantity', 1,
      'unitPrice', s.base_cents::numeric / 100, 'totalPrice', s.base_cents::numeric / 100));
  end if;
  insert into public.casual_dining_receipts(gateway_transaction_id, restaurant_id, customer_id, table_session_id,
      items, subtotal, service_fee_percent, service_fee, total, tip, payment_method, discount, discount_reason)
  values (tx.id, s.restaurant_id, tx.customer_id, s.table_session_id, v_items,
    s.base_cents::numeric / 100,
    case when s.service_fee_cents > 0 then private.session_fee_bps(s.table_session_id)::numeric / 100 else 0 end,
    s.service_fee_cents::numeric / 100, s.amount_cents::numeric / 100, tx.tip_cents::numeric / 100, tx.payment_method,
    s.coupon_discount_cents::numeric / 100, case when s.coupon_discount_cents > 0 then 'Cupom' end)
  on conflict (gateway_transaction_id) do nothing;
end $$;

drop function public.restaurant_get_session_bill(uuid, bigint);
create function public.restaurant_get_session_bill(p_table_session_id uuid, p_base_cents bigint default null, p_coupon_code text default null)
returns jsonb language plpgsql stable security definer set search_path = public, private, pg_temp as $$
declare s public.table_sessions; t record; v_bps integer; v_base bigint; c public.promotions; v_disc bigint := 0; v_refusal text; v_fee bigint; v_code text := nullif(btrim(coalesce(p_coupon_code, '')), '');
begin
  select * into s from public.table_sessions where id = p_table_session_id;
  if s.id is null then raise exception 'Table session not found' using errcode = 'P0002'; end if;
  perform private.require_restaurant_role(s.restaurant_id, array['owner','manager','waiter','maitre']::public.user_roles_role_enum[]);
  perform private.require_table_access(s, auth.uid());
  if p_base_cents is not null and p_base_cents <= 0 then raise exception 'Valor inválido' using errcode = '22023'; end if;
  select * into t from private.session_totals(p_table_session_id);
  v_bps := private.session_fee_bps(p_table_session_id);
  v_base := private.adjust_to_balance(coalesce(p_base_cents, t.base_rem), t.base_rem);
  -- O valor que sai é o do servidor, com o cupom: quem cobra vê antes de digitar na maquininha.
  if v_code is not null then
    select * into c from public.promotions x where x.restaurant_id = s.restaurant_id and upper(x.code) = upper(v_code) and x.discount_kind is not null;
    v_refusal := case when c.id is null then 'Cupom não encontrado' else private.coupon_refusal(c, s.service_model::text, null, v_base) end;
    if v_refusal is null then
      v_disc := private.coupon_discount_cents(c, p_table_session_id, null, v_base);
      if v_disc <= 0 then v_refusal := 'Este cupom não vale para esta conta'; end if;
    end if;
  elsif v_base > 0 then
    for c in select * from public.promotions x where x.restaurant_id = s.restaurant_id and x.is_auto and x.status = 'active' and x.discount_kind is not null loop
      continue when private.coupon_refusal(c, s.service_model::text, null, v_base) is not null;
      v_disc := greatest(v_disc, private.coupon_discount_cents(c, p_table_session_id, null, v_base));
    end loop;
  end if;
  v_fee := private.service_fee_cents(v_base - v_disc, v_bps);
  return jsonb_build_object('tableSessionId', s.id, 'consumptionCents', t.base_all, 'paidCents', t.paid_sum, 'balanceCents', t.base_rem,
    'feeOrTipMode', private.fee_or_tip_mode(p_table_session_id), 'feeBps', v_bps,
    'chargeBaseCents', v_base, 'feeCents', v_fee, 'couponDiscountCents', v_disc, 'couponRefusal', v_refusal,
    'totalWithFeeCents', v_base - v_disc + v_fee, 'totalWithoutFeeCents', v_base - v_disc,
    'adjusted', p_base_cents is not null and p_base_cents > t.base_rem,
    'acceptedVouchers', to_jsonb((select accepted_vouchers from public.restaurants where id = s.restaurant_id)),
    'tapActive', private.tap_available(s.restaurant_id),
    -- Quem cobra a mesa vê quem já pagou. Maître vê o status, sem o valor de cada pagamento.
    'payers', coalesce((select jsonb_agg(jsonb_build_object('name', coalesce(p.display_name, 'Pago no salão'),
        'baseCents', case when private.has_restaurant_role(s.restaurant_id, array['owner','manager','waiter']::public.user_roles_role_enum[]) then b.base_cents end,
        'method', g.payment_method, 'paidAt', b.paid_at) order by b.paid_at)
      from public.bill_shares b left join public.table_session_participants p on p.id = b.participant_id
      left join public.gateway_transactions g on g.id = b.payment_id
      where b.table_session_id = p_table_session_id and b.status = 'paid'), '[]'::jsonb));
end $$;
revoke all on function public.restaurant_get_session_bill(uuid, bigint, text) from public, anon;
grant execute on function public.restaurant_get_session_bill(uuid, bigint, text) to authenticated;

drop function public.service_tap_begin(uuid, uuid, uuid, bigint, boolean, bigint, text);
create or replace function public.service_tap_begin(p_user_id uuid, p_table_session_id uuid, p_idempotency_key uuid, p_base_cents bigint default null, p_waive_fee boolean default false, p_tip_cents bigint default 0, p_reason text default null, p_coupon_code text default null)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_coupon public.promotions; v_amount bigint; v_hold integer; v_reason text := coalesce(nullif(btrim(p_reason), ''), 'A pedido do cliente'); s public.table_sessions; v_key text; t public.gateway_transactions; v_balance bigint; v_bps integer; v_base bigint; v_fee bigint; v_tip bigint := coalesce(p_tip_cents, 0); v_share uuid; v_expires timestamptz;
begin
  if not private.tap_provider_active() then raise exception 'Pagamento por aproximação indisponível' using errcode = 'P0007'; end if;
  if p_idempotency_key is null then raise exception 'Idempotency key required' using errcode = '22023'; end if;
  select * into s from public.table_sessions where id = p_table_session_id for update;
  if s.id is null then raise exception 'Table session not found' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.user_roles u where u.user_id = p_user_id and u.restaurant_id = s.restaurant_id and u.is_active
      and u.role in ('owner', 'manager', 'waiter', 'maitre')) then
    raise exception 'Restaurant access denied' using errcode = '42501'; end if;
  perform private.require_table_access(s, p_user_id);
  if not private.tap_available(s.restaurant_id) then raise exception 'Pagamento por aproximação indisponível neste restaurante' using errcode = 'P0007'; end if;
  v_key := 'tap:' || p_table_session_id || ':' || p_idempotency_key;
  select * into t from public.gateway_transactions where idempotency_key = v_key;
  if t.id is not null then return private.payment_json(t) || jsonb_build_object('idempotentReplay', true, 'sdkPayload', t.metadata->'sdk_payload'); end if;
  if s.status <> 'active' then raise exception 'Sessão já encerrada' using errcode = 'P0001'; end if;
  v_balance := private.session_consumption_balance(p_table_session_id);
  if v_balance <= 0 then raise exception 'Esta conta já está quitada' using errcode = 'P0011'; end if;
  if p_base_cents is not null and p_base_cents <= 0 then raise exception 'Valor inválido' using errcode = '22023'; end if;
  v_base := private.adjust_to_balance(coalesce(p_base_cents, v_balance), v_balance);
  v_bps := private.session_fee_bps(p_table_session_id);
  v_fee := case when coalesce(p_waive_fee, false) then 0 else private.service_fee_cents(v_base, v_bps) end;
  if v_tip < 0 or v_tip > v_base + v_fee then raise exception 'Gorjeta inválida' using errcode = '22023'; end if;
  if v_tip > 0 and private.fee_or_tip_mode(p_table_session_id) <> 'tip' then
    raise exception 'Este restaurante usa taxa de serviço: não há gorjeta nesta conta' using errcode = '22023'; end if;
  select p.card_hold_min into v_hold from public.restaurant_model_policies p where p.restaurant_id = s.restaurant_id and p.service_model = s.service_model;
  if v_hold is null then raise exception 'Serviço sem política de cobrança' using errcode = 'P0007'; end if;
  v_expires := now() + make_interval(mins => v_hold);
  insert into public.bill_shares(restaurant_id, table_session_id, participant_id, round_no, mode, base_cents, service_fee_cents, amount_cents, tip_cents, status, committed_by, fee_waived_by, fee_waived_at, fee_waived_reason)
    values (s.restaurant_id, s.id, null, (select coalesce(max(round_no), 0) + 1 from public.bill_shares where table_session_id = s.id), 'fixed_amount', v_base, v_fee, v_base + v_fee, v_tip, 'pending_payment', p_user_id,
      case when p_waive_fee and v_bps > 0 then p_user_id end, case when p_waive_fee and v_bps > 0 then now() end, case when p_waive_fee and v_bps > 0 then v_reason end)
    returning id into v_share;
  -- O cupom entra na parcela antes da cobrança: o valor é o que sobra dele.
  if nullif(btrim(coalesce(p_coupon_code, '')), '') is not null then
    v_coupon := private.coupon_for_code(s.restaurant_id, p_coupon_code);
    perform private.coupon_assert_valid(v_coupon, s.service_model::text, null, v_base);
  else
    v_coupon := private.coupon_best_auto(s.restaurant_id, s.service_model::text, null, p_table_session_id, null, v_base);
  end if;
  if v_coupon.id is not null then perform private.share_set_coupon(v_share, v_coupon, null); end if;
  select amount_cents into v_amount from public.bill_shares where id = v_share;
  insert into public.gateway_transactions(restaurant_id, provider, payment_method, amount_cents, tip_cents, refunded_amount_cents, status, idempotency_key, purpose, table_session_id, bill_share_id, expires_at, metadata, created_at, updated_at)
    values (s.restaurant_id, 'tap', 'tap_card', v_amount + v_tip, v_tip, 0, 'pending', v_key, 'bill_share', s.id, v_share, v_expires, jsonb_build_object('recorded_by', p_user_id), now(), now())
    returning * into t;
  perform private.noowe_pay_freeze_fee(t);
  update public.bill_shares set payment_id = t.id where id = v_share;
  -- Retirar a taxa fica registrado, como na cobrança presencial.
  if p_waive_fee and v_bps > 0 then
    perform private.log_audit(s.restaurant_id, 'bill.fee_waived', 'bill_share', v_share, v_reason, null, jsonb_build_object('baseCents', v_base), p_user_id);
  end if;
  return private.payment_json(t);
end $$;
revoke all on function public.service_tap_begin(uuid, uuid, uuid, bigint, boolean, bigint, text, text) from public, anon, authenticated;
grant execute on function public.service_tap_begin(uuid, uuid, uuid, bigint, boolean, bigint, text, text) to service_role;
