-- M2: taxa NOOWE Pay única por meio de pagamento. O split é a taxa menos a tarifa real do Asaas, lida na própria cobrança (spike de 04/11, ADR-031).
-- Taxa e tarifa ficam em tabela privada: nenhuma RPC do app traz gateway ou margem. O restaurante vê valor pago, taxa e líquido.

alter table private.noowe_billing_settings add column min_online_charge_cents bigint not null default 500 check (min_online_charge_cents >= 0);

create table private.noowe_pay_transaction_fees (
  gateway_transaction_id uuid primary key references public.gateway_transactions(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  payment_method text not null,
  rate_bps integer not null,
  amount_cents bigint not null,
  fee_cents bigint not null,
  tariff_cents bigint,
  split_cents bigint,
  fee_returned boolean,
  chargeback_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table private.noowe_pay_transaction_fees enable row level security;
revoke all on private.noowe_pay_transaction_fees from public, anon, authenticated, service_role;

-- Razão de compensação: o que o restaurante deve à NOOWE. Não se mistura com os Créditos NOOWE Pay. Entra na fatura, sem limite nem validade.
create table private.noowe_pay_compensations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  gateway_transaction_id uuid references public.gateway_transactions(id) on delete set null,
  kind text not null check (kind in ('tariff_over_fee', 'fee_kept_on_refund')),
  amount_cents bigint not null check (amount_cents > 0),
  status text not null default 'open' check (status in ('open', 'invoiced', 'voided')),
  invoice_id uuid,
  created_at timestamptz not null default now(),
  unique (gateway_transaction_id, kind)
);
create index noowe_pay_compensations_open_idx on private.noowe_pay_compensations(restaurant_id) where status = 'open';
alter table private.noowe_pay_compensations enable row level security;
revoke all on private.noowe_pay_compensations from public, anon, authenticated, service_role;

create or replace function private.noowe_fee_cents(p_amount bigint, p_bps integer)
returns bigint language sql immutable as $$ select div(p_amount * p_bps + 5000, 10000)::bigint $$;
revoke all on function private.noowe_fee_cents(bigint, integer) from public, anon, authenticated;

-- Split = taxa − tarifa; nunca negativo. O exemplo do item 8: R$ 110 no crédito a 3,49% com tarifa de 3,78 dá 3,84 de taxa, 0,06 de split e 106,16 líquidos.
create or replace function private.noowe_pay_split_cents(p_fee bigint, p_tariff bigint)
returns bigint language sql immutable as $$ select greatest(0, p_fee - p_tariff)::bigint $$;
revoke all on function private.noowe_pay_split_cents(bigint, bigint) from public, anon, authenticated;

-- O Asaas recusa cobrança abaixo do mínimo. Falar antes é melhor que erro do provedor.
create or replace function private.assert_online_minimum(p_amount bigint)
returns void language plpgsql stable security definer set search_path = private, pg_temp as $$
declare v_min bigint;
begin
  select min_online_charge_cents into v_min from private.noowe_billing_settings;
  if p_amount < coalesce(v_min, 0) then
    raise exception 'Valor abaixo do mínimo para pagar pelo app' using errcode = 'P0013', detail = coalesce(v_min, 0)::text;
  end if;
end $$;
revoke all on function private.assert_online_minimum(bigint) from public, anon, authenticated;

-- A taxa fica congelada na cobrança: mudar a tabela nunca reescreve o passado. Meio sem taxa definida é recusado, nunca zero.
create or replace function private.noowe_pay_freeze_fee(p_tx public.gateway_transactions)
returns void language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_bps integer := private.noowe_pay_rate_bps(p_tx.restaurant_id, p_tx.payment_method);
begin
  if v_bps is null then raise exception 'Sem taxa NOOWE Pay definida para %', p_tx.payment_method using errcode = 'P0007'; end if;
  insert into private.noowe_pay_transaction_fees(gateway_transaction_id, restaurant_id, payment_method, rate_bps, amount_cents, fee_cents)
    values (p_tx.id, p_tx.restaurant_id, p_tx.payment_method, v_bps, p_tx.amount_cents, private.noowe_fee_cents(p_tx.amount_cents, v_bps))
    on conflict (gateway_transaction_id) do nothing;
end $$;
revoke all on function private.noowe_pay_freeze_fee(public.gateway_transactions) from public, anon, authenticated;

-- A tarifa é o que o Asaas diz na própria cobrança: valor menos líquido. Repetir com o mesmo líquido dá o mesmo split.
create or replace function public.service_payment_set_split(p_payment_id uuid, p_net_cents bigint)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare f private.noowe_pay_transaction_fees; v_tariff bigint; v_split bigint;
begin
  select * into f from private.noowe_pay_transaction_fees where gateway_transaction_id = p_payment_id for update;
  if f.gateway_transaction_id is null then raise exception 'Cobrança sem taxa registrada' using errcode = 'P0002'; end if;
  if p_net_cents is null or p_net_cents < 0 or p_net_cents > f.amount_cents then raise exception 'Líquido inválido' using errcode = '22023'; end if;
  v_tariff := f.amount_cents - p_net_cents;
  v_split := private.noowe_pay_split_cents(f.fee_cents, v_tariff);
  update private.noowe_pay_transaction_fees set tariff_cents = v_tariff, split_cents = v_split, updated_at = now() where gateway_transaction_id = p_payment_id;
  return jsonb_build_object('splitCents', v_split);
end $$;
revoke all on function public.service_payment_set_split(uuid, bigint) from public, anon, authenticated;
grant execute on function public.service_payment_set_split(uuid, bigint) to service_role;

-- Tarifa acima da taxa: split zero, e a diferença entra no razão, só quando o pagamento se confirma.
create or replace function private.noowe_pay_on_confirmed(p_tx uuid)
returns void language plpgsql security definer set search_path = public, private, pg_temp as $$
declare f private.noowe_pay_transaction_fees;
begin
  select * into f from private.noowe_pay_transaction_fees where gateway_transaction_id = p_tx;
  if f.gateway_transaction_id is null or f.tariff_cents is null or f.tariff_cents <= f.fee_cents then return; end if;
  insert into private.noowe_pay_compensations(restaurant_id, gateway_transaction_id, kind, amount_cents)
    values (f.restaurant_id, p_tx, 'tariff_over_fee', f.tariff_cents - f.fee_cents)
    on conflict (gateway_transaction_id, kind) do nothing;
end $$;
revoke all on function private.noowe_pay_on_confirmed(uuid) from public, anon, authenticated;

-- Estorno total (resposta 21). No mesmo dia operacional a taxa volta, e a NOOWE assume a tarifa. Depois do dia a taxa não volta: como o Asaas
-- cancela o split em todo estorno total, o que ficaria perdido entra no razão. Parcial não passa por aqui: a taxa continua.
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
  elsif coalesce(f.split_cents, 0) > 0 then
    insert into private.noowe_pay_compensations(restaurant_id, gateway_transaction_id, kind, amount_cents)
      values (f.restaurant_id, p_tx, 'fee_kept_on_refund', f.split_cents)
      on conflict (gateway_transaction_id, kind) do nothing;
  end if;
  update private.noowe_pay_transaction_fees set fee_returned = v_same_day, updated_at = now() where gateway_transaction_id = p_tx;
end $$;
revoke all on function private.refund_fee_policy(uuid) from public, anon, authenticated;

-- Contestação não devolve a taxa. A tarifa de contestação o Asaas tira direto da subconta do restaurante.
create or replace function public.service_payment_mark_chargeback(p_payment_id uuid)
returns void language sql security definer set search_path = private, pg_temp as $$
  update private.noowe_pay_transaction_fees set chargeback_at = coalesce(chargeback_at, now()), fee_returned = false, updated_at = now()
    where gateway_transaction_id = p_payment_id
$$;
revoke all on function public.service_payment_mark_chargeback(uuid) from public, anon, authenticated;
grant execute on function public.service_payment_mark_chargeback(uuid) to service_role;

create or replace function private.payment_json(p_tx public.gateway_transactions)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'paymentId', p_tx.id, 'orderId', p_tx.order_id, 'billShareId', p_tx.bill_share_id,
    'restaurantId', p_tx.restaurant_id, 'provider', p_tx.provider, 'method', p_tx.payment_method,
    'status', p_tx.status, 'amountCents', p_tx.amount_cents, 'tipCents', p_tx.tip_cents,
    'providerRef', p_tx.provider_ref,
    'checkoutUrl', p_tx.checkout_url, 'pixPayload', p_tx.pix_payload, 'expiresAt', p_tx.expires_at,
    'paymentAccountId', p_tx.payment_account_id, 'alreadyPaid', false,
    'idempotentReplay', p_tx.provider_ref is not null)
$$;

create or replace function private.reserve_share_payment(
  p_user uuid, p_share_id uuid, p_method text, p_tip_cents bigint, p_key uuid, p_provider text
) returns public.gateway_transactions language plpgsql security definer
set search_path = public, private, pg_temp as $$
declare
  s public.bill_shares; v_tx public.gateway_transactions; v_acct public.restaurant_payment_accounts;
  v_key text; v_tip bigint; v_expires timestamptz; pol public.restaurant_model_policies; v_session uuid;
begin
  if p_user is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_key is null then raise exception 'Idempotency key required' using errcode = '22023'; end if;
  if p_method not in ('pix', 'credit_card') then
    raise exception 'Forma de pagamento inválida' using errcode = '22023'; end if;
  v_key := 'share-payment:' || p_user || ':' || p_key;
  perform pg_advisory_xact_lock(hashtextextended(v_key, 0));
  select * into v_tx from public.gateway_transactions where idempotency_key = v_key and customer_id = p_user;
  if v_tx.id is not null then return v_tx; end if;

  -- Dois pagamentos ao mesmo tempo nunca abatem mais que o saldo: a sessão é a fila.
  select table_session_id into v_session from public.bill_shares where id = p_share_id;
  if v_session is null then raise exception 'Parcela não encontrada' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.table_sessions where id = v_session and status = 'active' for update) then
    raise exception 'Sessão da mesa indisponível' using errcode = 'P0001'; end if;
  select * into s from public.bill_shares where id = p_share_id for update;
  if not private.share_payer_allowed(s, p_user) then
    raise exception 'Parcela não encontrada' using errcode = 'P0002'; end if;

  v_tip := coalesce(p_tip_cents, s.tip_cents);
  if v_tip < 0 or v_tip > s.amount_cents then raise exception 'Gorjeta inválida' using errcode = '22023'; end if;
  if v_tip > 0 and private.fee_or_tip_mode(v_session) <> 'tip' then
    raise exception 'Este restaurante usa taxa de serviço: não há gorjeta nesta conta' using errcode = '22023'; end if;

  if s.status = 'pending_payment' then
    -- Cobrança em andamento, igual à pedida: reaproveita em vez de gerar outra (sem cobrança duplicada).
    select * into v_tx from public.gateway_transactions
      where id = s.payment_id and status in ('creating', 'pending') and (expires_at is null or expires_at > now())
        and payment_method = p_method and tip_cents = v_tip;
    if v_tx.id is not null then return v_tx; end if;
    -- Mudou a forma ou a gorjeta: a anterior não vale mais. Se ainda for paga, o pagamento tardio estorna.
    if s.payment_id is not null then
      perform private.apply_payment_event(s.payment_id, (select provider from public.gateway_transactions where id = s.payment_id),
        'replaced:' || s.payment_id, 'REPLACED', 'failed', null, '{}'::jsonb, 'cancelled');
    end if;
    perform private.release_bill_share_row(s.id);
    select * into s from public.bill_shares where id = p_share_id;
  end if;
  if s.status <> 'open' then raise exception 'Parcela não está aberta' using errcode = 'P0001'; end if;

  -- A conta pode ter mudado desde a divisão. Nunca altera em silêncio um valor que a pessoa confirmou.
  if not private.share_fits_balance(s) then
    raise exception 'A conta mudou. Confira os valores atualizados.' using errcode = 'P0012'; end if;

  if p_provider = 'asaas' then
    select * into v_acct from public.restaurant_payment_accounts
      where restaurant_id = s.restaurant_id and status = 'active';
    if v_acct.id is null then
      raise exception 'Pagamento online indisponível neste restaurante' using errcode = 'P0007'; end if;
    perform private.assert_online_minimum(s.amount_cents + v_tip);
  end if;
  select p.* into pol from public.table_sessions t
    join public.restaurant_model_policies p on p.restaurant_id = t.restaurant_id and p.service_model = t.service_model
    where t.id = v_session;
  v_expires := now() + make_interval(mins => case when p_method = 'pix' then pol.pix_expiry_min else pol.card_hold_min end);

  insert into public.gateway_transactions(
    restaurant_id, customer_id, provider, payment_method, amount_cents, tip_cents, refunded_amount_cents,
    status, idempotency_key, purpose, table_session_id, bill_share_id, payment_account_id,
    platform_fee_cents, expires_at, metadata, created_at, updated_at)
  values (
    s.restaurant_id, p_user, p_provider, p_method, s.amount_cents + v_tip, v_tip, 0,
    case when p_provider = 'asaas' then 'creating' else 'pending' end, v_key, 'bill_share',
    s.table_session_id, s.id, v_acct.id,
    null,
    v_expires, jsonb_build_object('split_mode', s.mode), now(), now())
  returning * into v_tx;
  perform private.noowe_pay_freeze_fee(v_tx);
  update public.bill_shares set status = 'pending_payment', payment_id = v_tx.id, tip_cents = v_tip,
      payer_user_id = p_user, updated_at = now() where id = s.id;
  return v_tx;
end $$;

drop function if exists public.service_payment_reserve_order(uuid, uuid, text, uuid, integer, bigint);
create function public.service_payment_reserve_order(
  p_user_id uuid, p_order_id uuid, p_payment_method text, p_idempotency_key uuid,
  p_tip_bps integer default 0, p_tip_cents bigint default 0
) returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  v_order public.orders; v_tx public.gateway_transactions; v_acct public.restaurant_payment_accounts;
  v_policy public.restaurant_model_policies; v_key text; v_expires timestamptz; v_tip bigint; v_amount bigint;
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
      perform private.assert_online_minimum(v_amount);

      insert into public.gateway_transactions(
        restaurant_id, order_id, customer_id, provider, payment_method, amount_cents, tip_cents,
        refunded_amount_cents, status, idempotency_key, purpose, payment_account_id,
        platform_fee_cents, expires_at, metadata, created_at, updated_at)
      values (
        v_order.restaurant_id, v_order.id, p_user_id, 'asaas', p_payment_method, v_amount, v_tip,
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
revoke all on function public.service_payment_reserve_order(uuid, uuid, text, uuid, integer, bigint) from public, anon, authenticated;
grant execute on function public.service_payment_reserve_order(uuid, uuid, text, uuid, integer, bigint) to service_role;

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
    return jsonb_build_object('transactionId', v_tx.id, 'orderId', v_tx.order_id, 'partialRefund', true, 'idempotentReplay', false);
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

create or replace function public.service_refund_record(p_refund_id uuid, p_outcome text, p_error text default null)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare r public.payment_refunds; g public.gateway_transactions; p record; v_failed boolean;
begin
  if p_outcome not in ('sent', 'transient', 'failed', 'deferred') then
    raise exception 'Resultado de estorno inválido: %', p_outcome using errcode = '22023'; end if;
  select * into p from private.refund_retry_policy();
  select * into r from public.payment_refunds where id = p_refund_id for update;
  if r.id is null then raise exception 'Estorno não encontrado' using errcode = 'P0002'; end if;
  if r.status <> 'processing' then return jsonb_build_object('status', r.status, 'ignored', true); end if;
  if p_outcome = 'sent' then
    update public.payment_refunds set status = 'sent', sent_at = now(), next_attempt_at = now() + p.verify_after,
        error_message = null, updated_at = now() where id = r.id returning * into r;
    return jsonb_build_object('status', r.status);
  end if;
  -- O Asaas só aceita estorno parcial de cartão no dia seguinte ao pagamento. Não é falha: tenta amanhã, sem gastar tentativa.
  if p_outcome = 'deferred' then
    update public.payment_refunds set status = 'pending', attempts = greatest(attempts - 1, 0), error_message = p_error, updated_at = now(),
        next_attempt_at = (((now() at time zone 'America/Sao_Paulo')::date + 1)::timestamp + interval '6 hours') at time zone 'America/Sao_Paulo'
      where id = r.id returning * into r;
    return jsonb_build_object('status', r.status, 'deferred', true);
  end if;
  v_failed := p_outcome = 'failed' or r.attempts >= p.max_attempts;
  if not v_failed then
    update public.payment_refunds set status = 'pending', error_message = p_error, updated_at = now(),
        next_attempt_at = now() + least(p.base_delay * power(2, greatest(r.attempts - 1, 0)), p.max_delay)
      where id = r.id returning * into r;
    return jsonb_build_object('status', r.status);
  end if;
  update public.payment_refunds set status = 'failed', error_message = p_error, updated_at = now() where id = r.id returning * into r;
  -- O dinheiro não saiu: a venda volta a valer como estava, até alguém decidir.
  perform set_config('noowe.status_actor', 'system', true);
  update public.gateway_transactions set status = 'completed', updated_at = now() where id = r.gateway_transaction_id and status = 'refund_pending' returning * into g;
  if g.order_id is not null then
    update public.orders set payment_status = 'confirmed', updated_at = now() where id = g.order_id and payment_status = 'refund_pending';
  end if;
  perform set_config('noowe.status_actor', '', true);
  perform private.log_system_audit(r.restaurant_id, 'payment.refund_failed', 'payment', r.gateway_transaction_id, coalesce(p_error, 'Estorno recusado'),
    null, jsonb_build_object('refundId', r.id, 'amountCents', r.amount_cents, 'attempts', r.attempts));
  perform private.notify_restaurant_staff(r.restaurant_id, array['owner','manager']::public.user_roles_role_enum[],
    'Estorno não concluído', 'O provedor não devolveu ' || to_char(r.amount_cents::numeric / 100, 'FM999G990D00') || ' ao cliente. Confira e devolva por outro meio.',
    'staff_bill_refund_review', r.id, null, jsonb_build_object('kind', 'staff_refund_failed', 'refund_id', r.id, 'payment_id', r.gateway_transaction_id));
  return jsonb_build_object('status', r.status);
end $$;

-- Sai a comissão única: cada cobrança lê a taxa de noowe_pay_rates, e o cadastro de subconta não depende mais dela.
create or replace function private.payment_account_view(p_account public.restaurant_payment_accounts)
returns jsonb language sql stable set search_path = public, pg_temp as $$
  select jsonb_build_object('accountId', p_account.id, 'restaurantId', p_account.restaurant_id,
    'status', p_account.status, 'providerAccountId', p_account.provider_account_id,
    'onboardingUrl', p_account.onboarding_url)
$$;

create or replace function public.service_payment_account_begin(
  p_user_id uuid, p_restaurant_id uuid, p_webhook_token_hash text
) returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_acct public.restaurant_payment_accounts;
begin
  if p_user_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_webhook_token_hash is null or p_webhook_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Webhook token hash inválido' using errcode = '22023'; end if;
  if not private.user_has_restaurant_role(p_user_id, p_restaurant_id, array['owner']::public.user_roles_role_enum[]) then
    raise exception 'Só o dono pode cadastrar a conta de recebimento' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('payment-account:' || p_restaurant_id, 0));

  select * into v_acct from public.restaurant_payment_accounts
    where restaurant_id = p_restaurant_id and status <> 'disabled' for update;
  if v_acct.id is not null then
    if v_acct.provider_account_id is not null then
      return private.payment_account_view(v_acct) || jsonb_build_object('alreadyCreated', true);
    end if;
    -- Tentativa anterior não chegou ao Asaas: o token novo substitui o antigo.
    update public.restaurant_payment_accounts
      set webhook_token_hash = p_webhook_token_hash, updated_at = now()
      where id = v_acct.id returning * into v_acct;
    return private.payment_account_view(v_acct) || jsonb_build_object('alreadyCreated', false);
  end if;

  insert into public.restaurant_payment_accounts(restaurant_id, provider, status, webhook_token_hash, created_by)
  values (p_restaurant_id, 'asaas', 'creating', p_webhook_token_hash, p_user_id)
  returning * into v_acct;
  perform private.payment_account_audit(v_acct, p_user_id, 'payment_account_started',
    'Dono iniciou o cadastro da conta de recebimento', null, jsonb_build_object('status', v_acct.status));
  return private.payment_account_view(v_acct) || jsonb_build_object('alreadyCreated', false);
end $$;

drop view private.noowe_report_payment_margin;
drop function private.platform_fee_bps();
drop table private.payment_platform_config;
alter table public.restaurant_payment_accounts drop column platform_fee_bps;

-- Margem por pagamento, sem pagamentos simulados. Só a equipe NOOWE, direto no banco.
create view private.noowe_report_payment_margin with (security_invoker = true) as
  select g.id as payment_id, g.restaurant_id, coalesce(g.confirmed_at, g.created_at) as paid_at,
    g.payment_method, g.amount_cents, g.tip_cents, f.rate_bps, f.fee_cents, f.tariff_cents,
    coalesce(f.split_cents, g.platform_fee_cents, 0) as noowe_split_cents, f.fee_returned
  from public.gateway_transactions g
  left join private.noowe_pay_transaction_fees f on f.gateway_transaction_id = g.id
  where g.status in ('completed', 'refund_pending', 'refunded') and g.provider <> 'simulated';
revoke all on private.noowe_report_payment_margin from public, anon, authenticated, service_role;

-- Diferenças a compensar.
create view private.noowe_report_compensations with (security_invoker = true) as
  select c.restaurant_id, c.kind, c.status, count(*) as lines, sum(c.amount_cents)::bigint as amount_cents
  from private.noowe_pay_compensations c group by 1, 2, 3;
revoke all on private.noowe_report_compensations from public, anon, authenticated, service_role;

-- Parte da taxa que incidiu sobre taxa de serviço e gorjeta.
create or replace function private.noowe_pay_fee_on_tips(p_restaurant uuid, p_from timestamptz, p_to timestamptz)
returns bigint language sql stable security definer set search_path = public, private, pg_temp as $$
  select coalesce(sum(div(f.fee_cents * (coalesce(b.service_fee_cents, 0) + g.tip_cents) + g.amount_cents / 2, greatest(g.amount_cents, 1))), 0)::bigint
  from public.gateway_transactions g
  join private.noowe_pay_transaction_fees f on f.gateway_transaction_id = g.id
  left join public.bill_shares b on b.id = g.bill_share_id
  where g.restaurant_id = p_restaurant and g.status = 'completed' and coalesce(g.confirmed_at, g.created_at) >= p_from and coalesce(g.confirmed_at, g.created_at) < p_to
$$;
revoke all on function private.noowe_pay_fee_on_tips(uuid, timestamptz, timestamptz) from public, anon, authenticated;

create or replace function public.restaurant_tip_report(p_restaurant_id uuid, p_day_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, private, pg_temp as $$
declare t public.tip_distributions; d public.operational_days;
begin
  perform private.require_restaurant_role(p_restaurant_id, array['owner','manager']::public.user_roles_role_enum[]);
  select * into t from public.tip_distributions where restaurant_id = p_restaurant_id and operational_day_id = p_day_id;
  if t.id is null then raise exception 'Rateio não encontrado' using errcode = 'P0002'; end if;
  select * into d from public.operational_days where id = p_day_id;
  return jsonb_build_object('mode', t.mode, 'retentionBps', t.retention_bps, 'poolCents', t.pool_cents, 'retainedCents', t.retained_cents,
    'distributedCents', t.distributed_cents, 'unallocatedCents', t.unallocated_cents,
    -- Parte da taxa NOOWE Pay que incidiu sobre taxa de serviço e gorjeta: o contador usa isso na folha. Só para o Dono.
    'noowePayFeeOnTipsCents', case when private.has_restaurant_role(p_restaurant_id, array['owner']::public.user_roles_role_enum[])
      then private.noowe_pay_fee_on_tips(p_restaurant_id, d.started_at, coalesce(d.ended_at, now())) end,
    'lines', coalesce((select jsonb_agg(jsonb_build_object('userId', l.user_id, 'name', coalesce(p.full_name, 'Sem nome'), 'role', l.role, 'weight', l.weight, 'amountCents', l.amount_cents) order by p.full_name)
      from public.tip_distribution_lines l left join public.profiles p on p.id = l.user_id where l.distribution_id = t.id), '[]'::jsonb));
end $$;

-- Extrato do Dono: valor pago, taxa e líquido por pagamento. Tarifa do Asaas e split não saem daqui.
create or replace function public.restaurant_get_payment_statement(p_restaurant_id uuid, p_from timestamptz default null, p_to timestamptz default null, p_limit integer default 100)
returns jsonb language plpgsql stable security definer set search_path = public, private, pg_temp as $$
declare v_from timestamptz := coalesce(p_from, now() - interval '30 days'); v_to timestamptz := coalesce(p_to, now() + interval '1 minute');
begin
  perform private.require_restaurant_role(p_restaurant_id, array['owner']::public.user_roles_role_enum[]);
  return (with rows_ as (
      select g.id, coalesce(g.confirmed_at, g.created_at) as at, g.payment_method, g.provider, g.amount_cents, g.refunded_amount_cents, g.status,
        coalesce(f.fee_cents, 0) as fee_cents, f.fee_returned, f.chargeback_at
      from public.gateway_transactions g
      left join private.noowe_pay_transaction_fees f on f.gateway_transaction_id = g.id
      where g.restaurant_id = p_restaurant_id and g.provider <> 'simulated' and g.status in ('completed', 'refund_pending', 'refunded')
        and coalesce(g.confirmed_at, g.created_at) >= v_from and coalesce(g.confirmed_at, g.created_at) < v_to),
    limited as (select * from rows_ order by at desc limit greatest(p_limit, 1))
    select jsonb_build_object(
      'paidCents', coalesce((select sum(amount_cents) from rows_), 0),
      'feeCents', coalesce((select sum(case when fee_returned then 0 else fee_cents end) from rows_), 0),
      'refundedCents', coalesce((select sum(refunded_amount_cents) from rows_), 0),
      'netCents', coalesce((select sum(amount_cents - refunded_amount_cents - case when fee_returned then 0 else fee_cents end) from rows_), 0),
      'payments', coalesce((select jsonb_agg(jsonb_build_object('paymentId', id, 'paidAt', at, 'method', payment_method, 'external', provider = 'manual',
          'paidCents', amount_cents, 'feeCents', case when fee_returned then 0 else fee_cents end,
          'netCents', amount_cents - refunded_amount_cents - case when fee_returned then 0 else fee_cents end,
          'refundedCents', refunded_amount_cents, 'status', status,
          'feeDestination', case when status = 'refunded' or refunded_amount_cents > 0 or chargeback_at is not null
            then case when fee_returned then 'returned' else 'kept' end end) order by at desc) from limited), '[]'::jsonb)));
end $$;
revoke all on function public.restaurant_get_payment_statement(uuid, timestamptz, timestamptz, integer) from public, anon;
grant execute on function public.restaurant_get_payment_statement(uuid, timestamptz, timestamptz, integer) to authenticated;
