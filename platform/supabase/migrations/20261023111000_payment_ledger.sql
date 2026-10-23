-- N4 / P1 — livro-razão de pagamentos (spec `payments` = `gateway_transactions`).
--
--  * amount_cents / refunded_amount_cents: numeric -> bigint (invariante 1)
--  * idempotência única por restaurante (invariante 10)
--  * colunas de provedor, contas de recebimento por restaurante
--  * private.apply_payment_event: ÚNICA fronteira de confirmação (invariante 6)
--
-- `amount_cents` é o valor TOTAL cobrado do pagador, gorjeta incluída;
-- `tip_cents` é só a parcela informativa dessa gorjeta.

-- ---------------------------------------------------------------------------
-- 1. Pré-checagens: aborta antes de converter se os dados não forem íntegros
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from public.gateway_transactions
      where amount_cents <> trunc(amount_cents) or refunded_amount_cents <> trunc(refunded_amount_cents)
         or amount_cents < 0 or refunded_amount_cents < 0 or refunded_amount_cents > amount_cents) then
    raise exception 'gateway_transactions tem valores fracionados, negativos ou estorno > cobrança';
  end if;
  if exists (select 1 from public.gateway_transactions
      group by restaurant_id, idempotency_key having count(*) > 1) then
    raise exception 'gateway_transactions tem idempotency_key duplicada por restaurante';
  end if;
  if exists (select 1 from public.gateway_transactions
      where status not in ('creating','pending','completed','failed','expired','cancelled',
                           'refund_pending','refunded','partially_refunded')) then
    raise exception 'gateway_transactions tem status fora do conjunto conhecido';
  end if;
end $$;

-- Os leitores legados fazem coalesce(amount, amount_cents / 100); com bigint essa
-- divisão seria inteira. `amount` passa a estar sempre preenchido.
update public.gateway_transactions set amount = amount_cents / 100 where amount is null;

alter table public.gateway_transactions
  alter column amount_cents type bigint using amount_cents::bigint,
  alter column refunded_amount_cents type bigint using refunded_amount_cents::bigint;

create or replace function private.gateway_tx_fill_amount()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    new.amount := coalesce(new.amount, new.amount_cents::numeric / 100);
  elsif new.amount_cents is distinct from old.amount_cents then
    new.amount := new.amount_cents::numeric / 100;
  end if;
  return new;
end $$;

drop trigger if exists trg_gateway_tx_fill_amount on public.gateway_transactions;
create trigger trg_gateway_tx_fill_amount before insert or update of amount_cents
  on public.gateway_transactions for each row execute function private.gateway_tx_fill_amount();

-- ---------------------------------------------------------------------------
-- 2. Contas de recebimento (subconta Asaas por restaurante)
-- ---------------------------------------------------------------------------
create table if not exists public.restaurant_payment_accounts (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  provider text not null check (provider in ('asaas')),
  status public.noowe_payment_account_status not null default 'creating',
  provider_account_id text,
  wallet_id text,
  api_key_secret_id uuid,
  webhook_token_hash text,
  platform_fee_bps integer not null check (platform_fee_bps between 0 and 10000),
  onboarding_url text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists restaurant_payment_accounts_one_live
  on public.restaurant_payment_accounts(restaurant_id) where status <> 'disabled';
alter table public.restaurant_payment_accounts enable row level security;
revoke all on public.restaurant_payment_accounts from anon, authenticated;
grant select (id, restaurant_id, provider, status, onboarding_url, platform_fee_bps, created_at, updated_at)
  on public.restaurant_payment_accounts to authenticated;
drop policy if exists restaurant_payment_accounts_select on public.restaurant_payment_accounts;
create policy restaurant_payment_accounts_select on public.restaurant_payment_accounts
  for select to authenticated
  using (private.has_restaurant_role(restaurant_id, array['owner','manager']::public.user_roles_role_enum[]));

create table if not exists public.payment_customers (
  payment_account_id uuid not null references public.restaurant_payment_accounts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider_customer_id text not null,
  created_at timestamptz not null default now(),
  primary key (payment_account_id, user_id)
);
alter table public.payment_customers enable row level security;
revoke all on public.payment_customers from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Colunas do livro-razão
-- ---------------------------------------------------------------------------
alter table public.gateway_transactions
  add column if not exists purpose public.noowe_payment_purpose not null default 'order',
  add column if not exists table_session_id uuid references public.table_sessions(id) on delete set null,
  add column if not exists bill_share_id uuid,
  add column if not exists payment_account_id uuid references public.restaurant_payment_accounts(id) on delete set null,
  add column if not exists provider_ref text,
  add column if not exists checkout_url text,
  add column if not exists pix_payload text,
  add column if not exists expires_at timestamptz,
  add column if not exists confirmed_at timestamptz,
  add column if not exists tip_cents bigint not null default 0,
  add column if not exists platform_fee_cents bigint,
  add column if not exists last_error text,
  add column if not exists refund_requested_at timestamptz;

alter table public.gateway_transactions
  drop constraint if exists gateway_transactions_money_check,
  add constraint gateway_transactions_money_check check (
    amount_cents >= 0 and tip_cents >= 0 and tip_cents <= amount_cents
    and refunded_amount_cents >= 0 and refunded_amount_cents <= amount_cents
    and (platform_fee_cents is null or platform_fee_cents >= 0)),
  drop constraint if exists gateway_transactions_status_check,
  add constraint gateway_transactions_status_check check (status in (
    'creating','pending','completed','failed','expired','cancelled',
    'refund_pending','refunded','partially_refunded'));

create unique index if not exists gateway_transactions_idempotency
  on public.gateway_transactions(restaurant_id, idempotency_key);
create unique index if not exists gateway_transactions_provider_ref
  on public.gateway_transactions(provider, provider_ref) where provider_ref is not null;
create index if not exists gateway_transactions_table_session_idx
  on public.gateway_transactions(table_session_id) where table_session_id is not null;

-- ---------------------------------------------------------------------------
-- 4. Caixa de entrada de eventos do provedor
-- ---------------------------------------------------------------------------
alter table public.payment_provider_events
  alter column gateway_transaction_id drop not null,
  alter column processed_at drop not null,
  add column if not exists restaurant_id uuid references public.restaurants(id) on delete set null,
  add column if not exists payment_account_id uuid references public.restaurant_payment_accounts(id) on delete set null,
  add column if not exists event_type text,
  add column if not exists received_at timestamptz not null default now(),
  add column if not exists error text;

-- ---------------------------------------------------------------------------
-- 5. Estorno enfileirado (o provedor é chamado pela Edge Function em P5)
-- ---------------------------------------------------------------------------
create or replace function private.enqueue_refund(
  p_transaction_id uuid, p_reason text
) returns void language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_tx public.gateway_transactions;
begin
  select * into v_tx from public.gateway_transactions where id = p_transaction_id for update;
  if v_tx.id is null then raise exception 'Payment transaction not found' using errcode = 'P0002'; end if;
  update public.gateway_transactions
    set status = 'refund_pending', refund_requested_at = coalesce(refund_requested_at, now()),
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('refund_reason', p_reason),
        updated_at = now()
    where id = v_tx.id;
  perform private.log_system_audit(v_tx.restaurant_id, 'payment.refund_enqueued', 'payment', v_tx.id,
    p_reason, jsonb_build_object('status', v_tx.status), jsonb_build_object('status', 'refund_pending'));
end $$;
revoke all on function private.enqueue_refund(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Fronteira única de confirmação
--
-- Webhook (Edge Function, service_role) e provedor simulado entram aqui.
-- Transição inválida é registrada e ignorada, nunca levantada: um erro faria o
-- provedor reenviar o mesmo evento indefinidamente.
-- ---------------------------------------------------------------------------
create or replace function private.apply_payment_event(
  p_transaction_id uuid, p_provider text, p_provider_event_id text, p_event_type text,
  p_outcome public.noowe_payment_status, p_amount_cents bigint default null,
  p_payload jsonb default '{}'::jsonb, p_gateway_status text default null
) returns jsonb language plpgsql security definer
set search_path = public, private, pg_temp as $$
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
  -- Pagamento tardio: o dinheiro já foi capturado, então o pedido não é reaberto;
  -- a cobrança vira estorno enfileirado em vez de erro.
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
  elsif v_order.id is not null and v_tx.purpose = 'order' then
    update public.orders set payment_status = p_outcome,
      status = case when p_outcome = 'confirmed' and service_model = 'quick_service'
        then 'confirmed'::public.orders_status_enum else status end,
      updated_at = now() where id = v_order.id returning * into v_order;
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
  -- purpose = 'bill_share': a liquidação da parcela entra com a fatia G3 (P3).
  perform set_config('noowe.status_actor', '', true);

  return jsonb_build_object('transactionId', v_tx.id, 'orderId', v_order.id,
    'paymentStatus', v_order.payment_status, 'fulfillmentStatus', v_order.fulfillment_status,
    'latePayment', v_late, 'idempotentReplay', false);
end $$;
revoke all on function private.apply_payment_event(uuid, text, text, text, public.noowe_payment_status, bigint, jsonb, text)
  from public, anon, authenticated;

-- O provedor simulado mantém o contrato antigo: pedido encerrado devolve erro
-- ao cliente em vez de estorno silencioso.
create or replace function private.process_simulated_payment_event(
  p_transaction_id uuid, p_provider_event_id text, p_outcome public.noowe_payment_status
) returns jsonb language plpgsql security definer
set search_path = public, private, pg_temp as $$
declare v_tx public.gateway_transactions; v_order public.orders;
begin
  select * into v_tx from public.gateway_transactions where id = p_transaction_id;
  if v_tx.id is null or v_tx.provider <> 'simulated' then
    raise exception 'Payment transaction not found' using errcode = 'P0002'; end if;
  if p_outcome = 'confirmed' and v_tx.order_id is not null then
    select * into v_order from public.orders where id = v_tx.order_id;
    if v_order.fulfillment_status in ('cancelled', 'not_picked_up')
      or v_order.payment_status in ('failed', 'refunded')
      or (v_order.payment_expires_at is not null and v_order.payment_expires_at < now()) then
      raise exception 'Este pedido não aceita mais pagamento' using errcode = 'P0001';
    end if;
  end if;
  return private.apply_payment_event(p_transaction_id, 'simulated', p_provider_event_id,
    'simulated', p_outcome);
end $$;
revoke all on function private.process_simulated_payment_event(uuid, text, public.noowe_payment_status)
  from public, anon, authenticated;
