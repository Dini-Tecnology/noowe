-- QA 25/11, decisões 1–3 (docs/DECISOES-QA-2026-11-26.md).
-- 1. PAG-07: o extrato do Dono mostra o líquido real (valor − tarifa do Asaas − split da NOOWE).
-- 2. RV-05: Quick abaixo do mínimo online vira "Pague no balcão"; só entra em produção quando o caixa confirma.
-- 3. RV-18 / RV-01: ambiente esperado por subconta (trava de cobrança) e provedor do Pix como parâmetro NOOWE.

-- 1. Desconto real do pagamento no extrato, fora a conveniência (que já sai à parte do líquido).
--    Com a tarifa do Asaas registrada (service_payment_set_split), vale o que o Asaas descontou + o split.
--    Sem ela (pagamento antigo ou fora do Asaas), fica a taxa NOOWE Pay como antes.
create or replace function private.statement_fee_cents(f private.noowe_pay_transaction_fees)
returns bigint language sql immutable as $$
  select case
    when f.gateway_transaction_id is null then 0
    when f.tariff_cents is null then case when f.fee_returned then 0 else f.fee_cents end
    else greatest(0, f.tariff_cents + coalesce(f.split_cents, 0) - coalesce(f.split_returned_cents, 0) - coalesce(f.convenience_cents, 0))
  end::bigint $$;

create or replace function public.restaurant_get_payment_statement(p_restaurant_id uuid, p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_limit integer DEFAULT 100)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare v_from timestamptz := coalesce(p_from, now() - interval '30 days'); v_to timestamptz := coalesce(p_to, now() + interval '1 minute');
begin
  perform private.require_restaurant_role(p_restaurant_id, array['owner']::public.user_roles_role_enum[]);
  return (with rows_ as (
      select g.id, coalesce(g.confirmed_at, g.created_at) as at, g.payment_method, g.provider, g.amount_cents, g.refunded_amount_cents, g.status,
        private.statement_fee_cents(f) as fee_cents, coalesce(f.convenience_cents, 0) as convenience_cents, f.fee_returned, f.chargeback_at
      from public.gateway_transactions g
      left join private.noowe_pay_transaction_fees f on f.gateway_transaction_id = g.id
      where g.restaurant_id = p_restaurant_id and g.provider <> 'simulated' and g.status in ('completed', 'refund_pending', 'refunded')
        and coalesce(g.confirmed_at, g.created_at) >= v_from and coalesce(g.confirmed_at, g.created_at) < v_to),
    limited as (select * from rows_ order by at desc limit greatest(p_limit, 1))
    select jsonb_build_object(
      'paidCents', coalesce((select sum(amount_cents) from rows_), 0),
      'feeCents', coalesce((select sum(fee_cents) from rows_), 0),
      'refundedCents', coalesce((select sum(refunded_amount_cents) from rows_), 0),
      'netCents', coalesce((select sum(amount_cents - refunded_amount_cents - convenience_cents - fee_cents) from rows_), 0),
      'payments', coalesce((select jsonb_agg(jsonb_build_object('paymentId', id, 'paidAt', at, 'method', payment_method, 'external', provider = 'manual',
          'paidCents', amount_cents, 'feeCents', fee_cents,
          'netCents', amount_cents - refunded_amount_cents - convenience_cents - fee_cents,
          'refundedCents', refunded_amount_cents, 'status', status,
          'feeDestination', case when status = 'refunded' or refunded_amount_cents > 0 or chargeback_at is not null
            then case when fee_returned then 'returned' else 'kept' end end) order by at desc) from limited), '[]'::jsonb)));
end $function$;

-- 2. O mínimo do app num lugar só: quem cobra e quem manda para o balcão leem daqui.
create or replace function private.online_minimum_cents()
returns bigint language sql stable security definer set search_path = private, pg_temp as $$
  select coalesce((select least(min_online_charge_cents, min_pix_charge_cents) from private.noowe_billing_settings), 0)::bigint $$;

create or replace function private.assert_online_minimum(p_amount bigint)
returns void language plpgsql stable security definer set search_path = private, pg_temp as $$
declare v_min bigint := private.online_minimum_cents();
begin
  if p_amount < v_min then
    raise exception 'Valor abaixo do mínimo para pagar pelo app' using errcode = 'P0013', detail = v_min::text;
  end if;
end $$;

-- Quick pago: aceite automático, se a política mandar. O gatilho do pedido leva os itens para a estação.
create or replace function private.quick_accept_after_payment(p_order_id uuid)
returns void language plpgsql security definer set search_path = public, private, pg_temp as $$
begin
  update public.orders o set fulfillment_status = 'accepted', updated_at = now()
    from public.restaurant_model_policies p
    where o.id = p_order_id and o.service_model = 'quick_service' and o.payment_status = 'confirmed'
      and o.fulfillment_status = 'received' and p.restaurant_id = o.restaurant_id
      and p.service_model = 'quick_service' and p.accept_mode = 'auto';
end $$;

-- O cliente pede "Pague no balcão". O servidor confere que o valor está mesmo abaixo do mínimo online;
-- o pedido fica aguardando pagamento (itens em awaiting_payment) e aparece na lista do balcão.
create or replace function public.customer_quick_pay_at_counter(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare o public.orders;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select * into o from public.orders where id = p_order_id and customer_id = auth.uid() for update;
  if o.id is null or o.service_model is distinct from 'quick_service' then raise exception 'Pedido não encontrado' using errcode = 'P0002'; end if;
  if o.payment_status <> 'pending' or o.fulfillment_status in ('cancelled', 'not_picked_up') then
    raise exception 'Este pedido não aguarda pagamento' using errcode = 'P0001'; end if;
  if coalesce(o.total_cents, 0) >= private.online_minimum_cents() then
    raise exception 'Este pedido pode ser pago pelo app' using errcode = 'P0001'; end if;
  update public.orders set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('pay_at_counter', true),
    payment_expires_at = null, updated_at = now() where id = o.id;
  return jsonb_build_object('orderId', o.id, 'orderNumber', o.order_number, 'totalCents', o.total_cents, 'payAtCounter', true);
end $$;
revoke all on function public.customer_quick_pay_at_counter(uuid) from public, anon;
grant execute on function public.customer_quick_pay_at_counter(uuid) to authenticated;

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
  -- Quick pago no balcão (RV-05): o mesmo aceite automático do webhook, para entrar em produção.
  if v_updated_order.service_model = 'quick_service' then perform private.quick_accept_after_payment(p_order_id); end if;

  -- Pontos de fidelidade saem do pagamento confirmado (gatilho em gateway_transactions), não daqui.

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

-- 3. Ambiente esperado da subconta. Nasce sandbox; ir para produção é decisão explícita (ação humana).
alter table public.restaurant_payment_accounts add column if not exists environment text not null default 'sandbox'
  check (environment in ('sandbox', 'production'));
-- Provedor do Pix (RV-01): parâmetro NOOWE. Só o Asaas está implementado; o payments-create recusa outro valor.
alter table private.noowe_billing_settings add column if not exists pix_provider text not null default 'asaas';

create or replace function public.service_payment_account_secrets(p_account_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare v_acct public.restaurant_payment_accounts;
begin
  select * into v_acct from public.restaurant_payment_accounts where id = p_account_id;
  if v_acct.id is null then return null; end if;
  return jsonb_build_object('id', v_acct.id, 'restaurantId', v_acct.restaurant_id, 'status', v_acct.status,
    'walletId', v_acct.wallet_id, 'environment', v_acct.environment,
    'pixProvider', (select pix_provider from private.noowe_billing_settings limit 1),
    'webhookTokenHash', v_acct.webhook_token_hash, 'apiKey', private.payment_account_api_key(v_acct.id));
end $function$;

-- Chave de um ambiente numa subconta do outro: não cobra, avisa o Dono e deixa rastro.
create or replace function public.service_payment_environment_mismatch(p_account_id uuid, p_key_environment text)
returns void language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_acct public.restaurant_payment_accounts;
begin
  select * into v_acct from public.restaurant_payment_accounts where id = p_account_id;
  if v_acct.id is null then return; end if;
  perform private.notify_owner(v_acct.restaurant_id, 'Pagamento online bloqueado',
    'A chave do Asaas é de ' || coalesce(p_key_environment, 'ambiente desconhecido') || ', mas a conta deste restaurante é de '
      || v_acct.environment || '. Nenhuma cobrança foi feita. Fale com a NOOWE para corrigir.',
    'payment_environment_mismatch', v_acct.id);
  perform private.log_system_audit(v_acct.restaurant_id, 'payment.environment_mismatch', 'restaurant_payment_account', v_acct.id,
    'Cobrança recusada: ambiente da chave diferente do esperado',
    jsonb_build_object('expected', v_acct.environment), jsonb_build_object('key', p_key_environment));
end $$;
revoke all on function public.service_payment_environment_mismatch(uuid, text) from public, anon, authenticated;
grant execute on function public.service_payment_environment_mismatch(uuid, text) to service_role;
