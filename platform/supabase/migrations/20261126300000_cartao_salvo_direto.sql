-- QA PAG-02 / PAG-05 — cartão salvo na conta do cliente, cobrado direto pelo token (sem a página do Asaas).
-- O número e o CVV vão do app ao Asaas pela Edge Function payments-cards e nunca são gravados: aqui só ficam token, bandeira,
-- final e validade. O token do Asaas pertence à (sub)conta que tokenizou: um cartão vale em cada restaurante onde foi
-- tokenizado, e o mesmo cartão (bandeira + final) guarda um token por subconta.

alter table public.payment_card_tokens drop constraint if exists payment_card_tokens_pkey;
alter table public.payment_card_tokens add primary key (payment_method_id, payment_account_id);

create or replace function public.service_payment_save_card(
  p_payment_id uuid, p_token text, p_brand text, p_last4 text
) returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  tx public.gateway_transactions;
  v_pm uuid;
  v_brand text := nullif(btrim(p_brand), '');
begin
  select * into tx from public.gateway_transactions where id = p_payment_id and provider = 'asaas';
  if tx.id is null or coalesce(tx.metadata->>'save_card', 'false') <> 'true'
     or tx.customer_id is null or tx.payment_account_id is null then
    return jsonb_build_object('saved', false);
  end if;
  if p_token is null or length(btrim(p_token)) < 8 or p_last4 is null or p_last4 !~ '^\d{4}$' then
    return jsonb_build_object('saved', false);
  end if;
  v_pm := private.card_upsert(tx.customer_id, tx.payment_account_id, p_token, v_brand, p_last4, null, null);
  return jsonb_build_object('saved', true, 'paymentMethodId', v_pm);
end;
$$;

-- Mesmo cartão (bandeira + final) reaproveita o registro; o token é por subconta.
create or replace function private.card_upsert(
  p_user_id uuid, p_account_id uuid, p_token text, p_brand text, p_last4 text, p_exp_month int, p_exp_year int
) returns uuid
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare v_pm uuid;
begin
  select pm.id into v_pm from public.payment_methods pm
    where pm.user_id = p_user_id and pm.method_type = 'credit_card' and pm.is_active
      and pm.card_last_four = p_last4 and lower(coalesce(pm.card_brand, '')) = lower(coalesce(p_brand, ''))
    order by pm.created_at desc limit 1;
  if v_pm is null then
    insert into public.payment_methods(user_id, method_type, card_last_four, card_brand, card_exp_month, card_exp_year, is_default)
    values (p_user_id, 'credit_card', p_last4, p_brand, p_exp_month, p_exp_year,
      not exists (select 1 from public.payment_methods d where d.user_id = p_user_id and d.is_active and d.is_default))
    returning id into v_pm;
  elsif p_exp_month is not null then
    update public.payment_methods set card_exp_month = p_exp_month, card_exp_year = p_exp_year, updated_at = now() where id = v_pm;
  end if;
  insert into public.payment_card_tokens(payment_method_id, payment_account_id, provider, token)
  values (v_pm, p_account_id, 'asaas', btrim(p_token))
  on conflict (payment_method_id, payment_account_id) do update set token = excluded.token, created_at = now();
  return v_pm;
end;
$$;
revoke all on function private.card_upsert(uuid, uuid, text, text, text, int, int) from public, anon, authenticated;

-- Subconta ativa do restaurante onde o cartão é tokenizado.
create or replace function public.service_payment_card_account(p_restaurant_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select a.id from public.restaurant_payment_accounts a where a.restaurant_id = p_restaurant_id and a.status = 'active' limit 1
$$;

-- Cartão tokenizado pelo payments-cards. Devolve só o que o app pode ver.
create or replace function public.service_payment_add_card(
  p_user_id uuid, p_account_id uuid, p_token text, p_brand text, p_last4 text, p_exp_month int, p_exp_year int
) returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare v_pm uuid; v public.payment_methods;
begin
  if p_user_id is null or p_account_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_token is null or length(btrim(p_token)) < 8 or p_last4 is null or p_last4 !~ '^\d{4}$'
     or p_exp_month not between 1 and 12 or p_exp_year < 2000 then
    raise exception 'Cartão inválido' using errcode = '22023';
  end if;
  v_pm := private.card_upsert(p_user_id, p_account_id, p_token, nullif(btrim(p_brand), ''), p_last4, p_exp_month, p_exp_year);
  select * into v from public.payment_methods where id = v_pm;
  return jsonb_build_object('id', v.id, 'brand', v.card_brand, 'last4', v.card_last_four,
    'expMonth', v.card_exp_month, 'expYear', v.card_exp_year, 'isDefault', v.is_default);
end;
$$;

-- Remover apaga os tokens (gatilho de is_active); o padrão passa ao cartão mais recente que sobrar.
create or replace function public.service_payment_remove_card(p_user_id uuid, p_card_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare v_was_default boolean;
begin
  update public.payment_methods set is_active = false, is_default = false, updated_at = now()
    where id = p_card_id and user_id = p_user_id and method_type = 'credit_card' and is_active
    returning true into v_was_default;
  if not found then raise exception 'Payment method not found' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.payment_methods where user_id = p_user_id and is_active and is_default) then
    update public.payment_methods set is_default = true, updated_at = now()
      where id = (select id from public.payment_methods where user_id = p_user_id and is_active and method_type = 'credit_card'
                  order by created_at desc limit 1);
  end if;
end;
$$;

create or replace function public.service_payment_set_default_card(p_user_id uuid, p_card_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if not exists (select 1 from public.payment_methods
                 where id = p_card_id and user_id = p_user_id and method_type = 'credit_card' and is_active) then
    raise exception 'Payment method not found' using errcode = 'P0002';
  end if;
  update public.payment_methods set is_default = (id = p_card_id), updated_at = now()
    where user_id = p_user_id and is_active and (is_default or id = p_card_id);
end;
$$;

-- Cartão recusado na hora (payWithCreditCard): a cobrança falha já. A parcela da conta volta a ficar aberta; o pedido
-- continua pendente (não entra em produção) e aceita outra tentativa com outro cartão.
create or replace function public.service_payment_card_declined(p_payment_id uuid, p_user_id uuid, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare v public.gateway_transactions;
begin
  select * into v from public.gateway_transactions
    where id = p_payment_id and customer_id = p_user_id and payment_method = 'credit_card' and status in ('creating', 'pending')
    for update;
  if v.id is null then return false; end if;
  if v.purpose = 'bill_share' then
    perform private.apply_payment_event(v.id, v.provider, 'card_declined:' || v.id, 'CARD_DECLINED', 'failed', null,
      jsonb_build_object('reason', left(p_reason, 300)), 'failed');
  else
    perform set_config('noowe.status_actor', 'system', true);
    update public.gateway_transactions set status = 'failed', updated_at = now() where id = v.id;
    perform set_config('noowe.status_actor', '', true);
  end if;
  update public.gateway_transactions set last_error = left(p_reason, 500), updated_at = now() where id = v.id;
  return true;
end;
$$;

revoke all on function public.service_payment_save_card(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.service_payment_save_card(uuid, text, text, text) to service_role;
revoke all on function public.service_payment_card_account(uuid) from public, anon, authenticated;
revoke all on function public.service_payment_add_card(uuid, uuid, text, text, text, int, int) from public, anon, authenticated;
revoke all on function public.service_payment_remove_card(uuid, uuid) from public, anon, authenticated;
revoke all on function public.service_payment_set_default_card(uuid, uuid) from public, anon, authenticated;
revoke all on function public.service_payment_card_declined(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.service_payment_card_account(uuid) to service_role;
grant execute on function public.service_payment_add_card(uuid, uuid, text, text, text, int, int) to service_role;
grant execute on function public.service_payment_remove_card(uuid, uuid) to service_role;
grant execute on function public.service_payment_set_default_card(uuid, uuid) to service_role;
grant execute on function public.service_payment_card_declined(uuid, uuid, text) to service_role;

-- Lista com validade; com p_restaurant_id, só os cartões que dá para cobrar naquele restaurante.
drop function if exists public.customer_list_saved_cards();
create or replace function public.customer_list_saved_cards(p_restaurant_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', pm.id, 'brand', pm.card_brand, 'lastFour', pm.card_last_four, 'last4', pm.card_last_four,
      'expMonth', pm.card_exp_month, 'expYear', pm.card_exp_year, 'isDefault', pm.is_default)
      order by pm.is_default desc, pm.created_at desc)
    from public.payment_methods pm
    where pm.user_id = auth.uid() and pm.is_active and pm.method_type = 'credit_card'
      and exists (select 1 from public.payment_card_tokens t
                  left join public.restaurant_payment_accounts a on a.id = t.payment_account_id
                  where t.payment_method_id = pm.id and (p_restaurant_id is null or a.restaurant_id = p_restaurant_id))
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.customer_list_saved_cards(uuid) from public, anon;
grant execute on function public.customer_list_saved_cards(uuid) to authenticated;

CREATE OR REPLACE FUNCTION public.service_payment_reserve_order(p_user_id uuid, p_order_id uuid, p_payment_method text, p_idempotency_key uuid, p_tip_bps integer DEFAULT 0, p_tip_cents bigint DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
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

    perform private.coupon_order_auto(v_order);
    select * into v_order from public.orders where id = v_order.id;
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
      -- Cartão também tem prazo (card_hold_min): pedido pago só no cartão não fica pendurado (QA PAG-05).
      v_expires := now() + make_interval(mins => case when p_payment_method = 'pix' then v_policy.pix_expiry_min else v_policy.card_hold_min end);
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

      -- Pedido que só entra em produção pago expira junto com a cobrança (Pix ou cartão).
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

  -- 1. Cobrança expirada (Pix ou cartão, prazo da política): o pagamento falha e o pedido é cancelado.
  for v_order in
    select * from public.orders
    where restaurant_id = p_restaurant_id and service_model = 'quick_service'
      and payment_status = 'pending' and fulfillment_status = 'received'
      and payment_expires_at is not null and payment_expires_at < now()
    for update skip locked
  loop
    perform private.quick_cancel_order(v_order.id, 'Pagamento expirado sem confirmação', null, 'quick_order.pix_expired');
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
