-- N4 / P1 — RPCs de serviço usadas pelas Edge Functions de pagamento.
--
-- Só service_role executa. O app nunca chama estas funções: o JWT do usuário é
-- validado na Edge Function, que repassa o user_id. Toda confirmação passa por
-- private.apply_payment_event (invariante 6).

-- Chave da subconta lida do Vault; nunca sai por tabela ou por RPC de cliente.
create or replace function private.payment_account_api_key(p_account_id uuid)
returns text language plpgsql security definer set search_path = public, private, vault, pg_temp as $$
declare v_secret uuid; v_key text;
begin
  select api_key_secret_id into v_secret from public.restaurant_payment_accounts where id = p_account_id;
  if v_secret is null then return null; end if;
  select decrypted_secret into v_key from vault.decrypted_secrets where id = v_secret;
  return v_key;
end $$;
revoke all on function private.payment_account_api_key(uuid) from public, anon, authenticated;

-- Reserva (ou recupera) a cobrança de um pedido. Não fala com o provedor.
create or replace function public.service_payment_reserve_order(
  p_user_id uuid, p_order_id uuid, p_payment_method text, p_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  v_order public.orders; v_tx public.gateway_transactions; v_acct public.restaurant_payment_accounts;
  v_policy public.restaurant_model_policies; v_key text; v_fee bigint; v_expires timestamptz;
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

    -- Pix ainda válido para o mesmo pedido: reaproveita em vez de gerar outro.
    if p_payment_method = 'pix' then
      select * into v_tx from public.gateway_transactions
        where order_id = v_order.id and payment_method = 'pix' and provider = 'asaas'
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
      v_fee := (v_order.total_cents * v_acct.platform_fee_bps + 5000) / 10000;

      insert into public.gateway_transactions(
        restaurant_id, order_id, customer_id, provider, payment_method, amount_cents,
        refunded_amount_cents, status, idempotency_key, purpose, payment_account_id,
        platform_fee_cents, expires_at, metadata, created_at, updated_at)
      values (
        v_order.restaurant_id, v_order.id, p_user_id, 'asaas', p_payment_method, v_order.total_cents,
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
revoke all on function public.service_payment_reserve_order(uuid, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.service_payment_reserve_order(uuid, uuid, text, uuid) to service_role;

-- Dados da conta (com a chave) para a Edge Function chamar o provedor.
create or replace function public.service_payment_account_secrets(p_account_id uuid)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_acct public.restaurant_payment_accounts;
begin
  select * into v_acct from public.restaurant_payment_accounts where id = p_account_id;
  if v_acct.id is null then return null; end if;
  return jsonb_build_object('id', v_acct.id, 'restaurantId', v_acct.restaurant_id, 'status', v_acct.status,
    'walletId', v_acct.wallet_id, 'platformFeeBps', v_acct.platform_fee_bps,
    'webhookTokenHash', v_acct.webhook_token_hash, 'apiKey', private.payment_account_api_key(v_acct.id));
end $$;
revoke all on function public.service_payment_account_secrets(uuid) from public, anon, authenticated;
grant execute on function public.service_payment_account_secrets(uuid) to service_role;

create or replace function public.service_payment_get(p_payment_id uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('paymentId', id, 'orderId', order_id, 'restaurantId', restaurant_id,
    'customerId', customer_id, 'provider', provider, 'method', payment_method, 'status', status,
    'amountCents', amount_cents, 'tipCents', tip_cents, 'providerRef', provider_ref,
    'paymentAccountId', payment_account_id, 'purpose', purpose, 'expiresAt', expires_at,
    'checkoutUrl', checkout_url, 'pixPayload', pix_payload)
  from public.gateway_transactions where id = p_payment_id
$$;
revoke all on function public.service_payment_get(uuid) from public, anon, authenticated;
grant execute on function public.service_payment_get(uuid) to service_role;

-- Cliente do provedor por conta + usuário (nunca guarda CPF/CNPJ).
create or replace function public.service_payment_customer(p_account_id uuid, p_user_id uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('providerCustomerId', pc.provider_customer_id, 'name', p.full_name, 'email', p.email, 'phone', p.phone)
  from public.profiles p
  left join public.payment_customers pc on pc.payment_account_id = p_account_id and pc.user_id = p.id
  where p.id = p_user_id
$$;
revoke all on function public.service_payment_customer(uuid, uuid) from public, anon, authenticated;
grant execute on function public.service_payment_customer(uuid, uuid) to service_role;

create or replace function public.service_payment_save_customer(p_account_id uuid, p_user_id uuid, p_provider_customer_id text)
returns void language sql security definer set search_path = public, pg_temp as $$
  insert into public.payment_customers(payment_account_id, user_id, provider_customer_id)
  values (p_account_id, p_user_id, p_provider_customer_id)
  on conflict (payment_account_id, user_id) do update set provider_customer_id = excluded.provider_customer_id
$$;
revoke all on function public.service_payment_save_customer(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.service_payment_save_customer(uuid, uuid, text) to service_role;

-- A cobrança existe no provedor: sai de `creating` para `pending`.
create or replace function public.service_payment_attach_provider(
  p_payment_id uuid, p_provider_ref text, p_checkout_url text, p_pix_payload text, p_expires_at timestamptz default null
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.gateway_transactions
    set provider_ref = p_provider_ref, checkout_url = p_checkout_url, pix_payload = p_pix_payload,
        expires_at = coalesce(p_expires_at, expires_at),
        status = case when status = 'creating' then 'pending' else status end,
        last_error = null, updated_at = now()
    where id = p_payment_id and provider = 'asaas';
  if not found then raise exception 'Payment transaction not found' using errcode = 'P0002'; end if;
end $$;
revoke all on function public.service_payment_attach_provider(uuid, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.service_payment_attach_provider(uuid, text, text, text, timestamptz) to service_role;

-- Falha do provedor: a cobrança continua `creating` e retomável pela mesma chave (N4 #6).
create or replace function public.service_payment_mark_failed(p_payment_id uuid, p_error text)
returns void language sql security definer set search_path = public, pg_temp as $$
  update public.gateway_transactions set last_error = left(p_error, 500), updated_at = now()
  where id = p_payment_id and status = 'creating'
$$;
revoke all on function public.service_payment_mark_failed(uuid, text) from public, anon, authenticated;
grant execute on function public.service_payment_mark_failed(uuid, text) to service_role;

-- Entrada pública (só service_role) da fronteira de confirmação.
create or replace function public.service_payment_apply_event(
  p_payment_id uuid, p_provider text, p_provider_event_id text, p_event_type text,
  p_outcome public.noowe_payment_status, p_amount_cents bigint default null,
  p_payload jsonb default '{}'::jsonb, p_gateway_status text default null
) returns jsonb language sql security definer set search_path = public, private, pg_temp as $$
  select private.apply_payment_event(p_payment_id, p_provider, p_provider_event_id, p_event_type,
    p_outcome, p_amount_cents, p_payload, p_gateway_status)
$$;
revoke all on function public.service_payment_apply_event(uuid, text, text, text, public.noowe_payment_status, bigint, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.service_payment_apply_event(uuid, text, text, text, public.noowe_payment_status, bigint, jsonb, text)
  to service_role;

-- Evento que não casa com nenhuma cobrança nossa fica na caixa de entrada.
create or replace function public.service_payment_record_orphan_event(
  p_provider text, p_provider_event_id text, p_event_type text, p_payment_account_id uuid, p_payload jsonb
) returns void language sql security definer set search_path = public, pg_temp as $$
  insert into public.payment_provider_events(provider, provider_event_id, event_type, payment_account_id,
      outcome, payload, error)
  values (p_provider, p_provider_event_id, p_event_type, p_payment_account_id, 'pending',
      coalesce(p_payload, '{}'::jsonb), 'unmatched_payment')
  on conflict do nothing
$$;
revoke all on function public.service_payment_record_orphan_event(text, text, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.service_payment_record_orphan_event(text, text, text, uuid, jsonb) to service_role;
