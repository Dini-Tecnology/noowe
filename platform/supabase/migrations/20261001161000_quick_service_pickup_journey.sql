-- ADR-013 — Jornada Quick Service: pedido antecipado, aceite, retirada e estornos.
--
-- O Quick Service é o "totem de autoatendimento dentro do app": o cliente pede,
-- paga, acompanha e retira.  Esta migration acrescenta ao runtime V2:
--   * configuração por restaurante (tolerância 15–60, aceite, Pix, pausa, ...);
--   * aceite automático/manual, tolerância contada a partir de "pronto" e
--     o estado terminal "não retirado";
--   * código de retirada aleatório, único por restaurante por dia;
--   * pedido duplicado bloqueado, pedidos pausados/fora do horário recusados;
--   * Pix com expiração; cancelamento e estorno com motivo e audit_log;
--   * log de cada mudança de status (order_status_events) e push por transição.
--
-- Não há pg_cron: toda expiração é preguiçosa, aplicada por
-- private.quick_service_sweep quando alguém lê ou age (mesmo padrão de
-- 20260928102000_table_session_user_invites.sql).
--
-- O Pix simulado só confirma com a flag de desenvolvimento ligada:
--   update private.dev_flags set enabled = true, updated_at = now()
--   where key = 'simulate_pix_payment';

-- ---------------------------------------------------------------------------
-- 1. Configuração (valores de regra vivem em restaurant_model_policies)
-- ---------------------------------------------------------------------------

update public.restaurant_model_configs
  set pickup_expiry_min = least(60, greatest(15, pickup_expiry_min))
  where pickup_expiry_min not between 15 and 60;
update public.restaurant_model_policies
  set pickup_expiry_min = least(60, greatest(15, pickup_expiry_min))
  where pickup_expiry_min not between 15 and 60;

alter table public.restaurant_model_configs
  drop constraint if exists restaurant_model_configs_pickup_expiry_range;
alter table public.restaurant_model_configs
  add constraint restaurant_model_configs_pickup_expiry_range
  check (pickup_expiry_min between 15 and 60);
alter table public.restaurant_model_policies
  drop constraint if exists restaurant_model_policies_pickup_expiry_range;
alter table public.restaurant_model_policies
  add constraint restaurant_model_policies_pickup_expiry_range
  check (pickup_expiry_min between 15 and 60);

alter table public.restaurant_model_policies
  add column if not exists no_pickup_policy text not null default 'none'
    check (no_pickup_policy in ('none', 'store_credit')),
  add column if not exists accept_mode text not null default 'auto'
    check (accept_mode in ('auto', 'manual')),
  add column if not exists accept_timeout_min integer not null default 5
    check (accept_timeout_min between 1 and 60),
  add column if not exists orders_paused boolean not null default false,
  add column if not exists default_prep_min integer not null default 10
    check (default_prep_min between 1 and 120),
  add column if not exists prep_minutes_per_queued_order integer not null default 2
    check (prep_minutes_per_queued_order between 0 and 30),
  add column if not exists close_orders_before_min integer not null default 15
    check (close_orders_before_min between 0 and 120),
  add column if not exists pix_expiry_min integer not null default 15
    check (pix_expiry_min between 1 and 60),
  add column if not exists distance_warning_km numeric(5,1) not null default 2.0
    check (distance_warning_km > 0),
  add column if not exists pickup_location text
    check (pickup_location is null or char_length(pickup_location) <= 160);

alter table public.profiles
  add column if not exists call_name text
    check (call_name is null or char_length(btrim(call_name)) between 1 and 40);

create table if not exists private.dev_flags (
  key text primary key,
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into private.dev_flags (key, enabled)
values ('simulate_pix_payment', false)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Colunas do pedido
-- ---------------------------------------------------------------------------

alter table public.orders
  add column if not exists call_name text
    check (call_name is null or char_length(btrim(call_name)) between 1 and 40),
  add column if not exists consumption_mode text
    check (consumption_mode is null or consumption_mode in ('dine_here', 'takeaway')),
  add column if not exists pickup_policy_accepted_at timestamptz,
  add column if not exists paid_at timestamptz,
  add column if not exists accepted_at timestamptz,
  add column if not exists picked_up_at timestamptz,
  add column if not exists payment_expires_at timestamptz,
  add column if not exists pickup_code_day date,
  add column if not exists cart_fingerprint text,
  add column if not exists refunded_cents bigint not null default 0 check (refunded_cents >= 0),
  add column if not exists pickup_recalled_at timestamptz,
  add column if not exists pickup_recall_count integer not null default 0;

-- Backfill ANTES de criar os triggers de evento/notificação, para que pedidos
-- antigos não gerem push nem eventos falsos.
update public.orders
  set pickup_code_day = (created_at at time zone 'America/Sao_Paulo')::date
  where service_model = 'quick_service' and pickup_code is not null and pickup_code_day is null;
update public.orders
  set paid_at = coalesce(paid_at, updated_at)
  where service_model = 'quick_service' and payment_status in ('confirmed', 'refunded') and paid_at is null;
update public.orders
  set accepted_at = coalesce(accepted_at, updated_at),
      fulfillment_status = case when fulfillment_status = 'received'
        then 'accepted'::public.noowe_fulfillment_status else fulfillment_status end
  where service_model = 'quick_service' and payment_status = 'confirmed'
    and fulfillment_status not in ('cancelled') and accepted_at is null;
update public.orders
  set picked_up_at = coalesce(picked_up_at, completed_at, updated_at)
  where service_model = 'quick_service' and fulfillment_status = 'picked_up' and picked_up_at is null;

-- O código deixa de ser único para sempre e passa a ser único por dia.
drop index if exists public.uq_orders_pickup_code;
create unique index if not exists uq_orders_pickup_code_day
  on public.orders (restaurant_id, pickup_code_day, pickup_code)
  where pickup_code is not null and pickup_code_day is not null;
create index if not exists idx_orders_quick_open
  on public.orders (restaurant_id, fulfillment_status, created_at)
  where service_model = 'quick_service';
create index if not exists idx_orders_quick_fingerprint
  on public.orders (customer_id, restaurant_id, cart_fingerprint)
  where service_model = 'quick_service';

-- ---------------------------------------------------------------------------
-- 3. Regras isoladas em funções nomeadas
-- ---------------------------------------------------------------------------

-- Tolerância de retirada: conta a partir de "pronto" (ADR-013 §2.3).
create or replace function private.quick_pickup_deadline(p_ready_at timestamptz, p_tolerance_min integer)
returns timestamptz language sql immutable set search_path = pg_catalog as $$
  select p_ready_at + make_interval(mins => p_tolerance_min)
$$;

-- Estimativa de preparo: tempo base do restaurante + fila em produção.
create or replace function private.quick_estimated_prep_minutes(p_restaurant_id uuid)
returns integer language sql stable security definer set search_path = public, pg_temp as $$
  select p.default_prep_min + p.prep_minutes_per_queued_order * (
    select count(*) from public.orders o
    where o.restaurant_id = p_restaurant_id and o.service_model = 'quick_service'
      and o.payment_status = 'confirmed'
      and o.fulfillment_status in ('accepted', 'preparing', 'checking')
  )::integer
  from public.restaurant_model_policies p
  where p.restaurant_id = p_restaurant_id and p.service_model = 'quick_service'
$$;

-- Minutos até o fim do turno atual; null se fechado ou sem horário de fechamento.
create or replace function private.quick_minutes_until_close(p_restaurant_id uuid)
returns integer language plpgsql stable security definer set search_path = public, private, pg_temp as $$
declare
  v_tz constant text := 'America/Sao_Paulo';
  v_hours jsonb; v_status jsonb; v_local timestamp; v_close time; v_diff integer;
begin
  select coalesce(opening_hours, '{}'::jsonb) into v_hours from public.restaurants where id = p_restaurant_id;
  v_local := now() at time zone v_tz;
  v_status := private.opening_hours_status(v_hours, v_local);
  if not coalesce((v_status->>'isOpen')::boolean, false) then return null; end if;
  if nullif(v_status->>'closesAt', '') is null then return null; end if;
  v_close := (v_status->>'closesAt')::time;
  v_diff := floor(extract(epoch from (v_close - v_local::time)) / 60)::integer;
  if v_diff < 0 then v_diff := v_diff + 1440; end if;
  return v_diff;
exception when others then
  return null;
end $$;

create or replace function private.quick_orders_accepting(p_restaurant_id uuid)
returns text language plpgsql stable security definer set search_path = public, private, pg_temp as $$
declare v_policy public.restaurant_model_policies; v_left integer;
begin
  select * into v_policy from public.restaurant_model_policies
    where restaurant_id = p_restaurant_id and service_model = 'quick_service';
  if v_policy.restaurant_id is null then return 'unavailable'; end if;
  if v_policy.orders_paused then return 'paused'; end if;
  if not private.restaurant_is_open_now(p_restaurant_id) then return 'closed'; end if;
  v_left := private.quick_minutes_until_close(p_restaurant_id);
  if v_left is not null and v_left < v_policy.close_orders_before_min then return 'closing'; end if;
  return 'open';
end $$;

-- Código de retirada: 6 caracteres sem ambíguos, único por restaurante por dia.
create or replace function private.generate_pickup_code(p_restaurant_id uuid, p_day date)
returns text language plpgsql volatile security definer
set search_path = public, private, extensions, pg_temp as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text; v_bytes bytea; v_try integer := 0;
begin
  loop
    v_bytes := gen_random_bytes(6);
    v_code := '';
    for i in 0..5 loop
      v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, i) % length(v_alphabet)) + 1, 1);
    end loop;
    exit when not exists (
      select 1 from public.orders
      where restaurant_id = p_restaurant_id and pickup_code_day = p_day and pickup_code = v_code
    );
    v_try := v_try + 1;
    if v_try > 25 then raise exception 'Não foi possível gerar o código de retirada' using errcode = '55000'; end if;
  end loop;
  return v_code;
end $$;

-- Auditoria de ações do sistema (sem usuário): invariante 8, ator "system".
create or replace function private.log_system_audit(
  p_restaurant_id uuid, p_action text, p_entity_type text, p_entity_id uuid,
  p_reason text, p_before jsonb default null, p_after jsonb default null
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.audit_logs(restaurant_id, user_id, action, entity_type, entity_id,
    reason, "before", "after", success, metadata, created_at)
  values (p_restaurant_id, null, p_action, p_entity_type, p_entity_id,
    p_reason, p_before, p_after, true,
    jsonb_build_object('audit_kind', 'operational', 'actor', 'system'), now());
end $$;
revoke all on function private.log_system_audit(uuid, text, text, uuid, text, jsonb, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Log de status (order_status_events) e carimbos de tempo
-- ---------------------------------------------------------------------------

create table if not exists public.order_status_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  field text not null check (field in ('payment_status', 'fulfillment_status')),
  from_value text,
  to_value text not null,
  actor_id uuid,
  actor_kind text not null check (actor_kind in ('customer', 'staff', 'system')),
  reason text,
  created_at timestamptz not null default now()
);
create index if not exists idx_order_status_events_order on public.order_status_events(order_id, created_at);
alter table public.order_status_events enable row level security;
revoke insert, update, delete on public.order_status_events from anon, authenticated;
drop policy if exists order_status_events_read on public.order_status_events;
create policy order_status_events_read on public.order_status_events
  for select to authenticated using (
    exists (select 1 from public.orders o where o.id = order_id and o.customer_id = auth.uid())
    or private.has_restaurant_role(restaurant_id)
  );

create or replace function private.quick_order_stamp_times()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.fulfillment_status = 'accepted' and new.accepted_at is null then new.accepted_at := now(); end if;
  if new.fulfillment_status = 'picked_up' and new.picked_up_at is null then new.picked_up_at := now(); end if;
  if new.payment_status = 'confirmed' and new.paid_at is null then new.paid_at := now(); end if;
  return new;
end $$;
drop trigger if exists orders_quick_stamp_times on public.orders;
create trigger orders_quick_stamp_times before update on public.orders
for each row when (new.service_model = 'quick_service') execute function private.quick_order_stamp_times();

create or replace function private.quick_order_record_events()
returns trigger language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  v_actor uuid := auth.uid();
  v_kind text;
  v_reason text := nullif(current_setting('noowe.status_reason', true), '');
  v_initial boolean := tg_op = 'INSERT' or old.service_model is distinct from new.service_model;
begin
  v_kind := case
    when current_setting('noowe.status_actor', true) = 'system' or v_actor is null then 'system'
    when v_actor = new.customer_id then 'customer'
    else 'staff' end;
  if v_kind = 'system' then v_actor := null; end if;

  -- Na criação o pedido ainda é "genérico" (service_model nulo) e só vira Quick no
  -- UPDATE de customer_create_order_v2: o primeiro evento nasce nessa virada.
  if v_initial or old.payment_status is distinct from new.payment_status then
    insert into public.order_status_events(order_id, restaurant_id, field, from_value, to_value, actor_id, actor_kind, reason)
    values (new.id, new.restaurant_id, 'payment_status',
      case when not v_initial then old.payment_status::text end, new.payment_status::text,
      v_actor, v_kind, v_reason);
  end if;
  if v_initial or old.fulfillment_status is distinct from new.fulfillment_status then
    insert into public.order_status_events(order_id, restaurant_id, field, from_value, to_value, actor_id, actor_kind, reason)
    values (new.id, new.restaurant_id, 'fulfillment_status',
      case when not v_initial then old.fulfillment_status::text end, new.fulfillment_status::text,
      v_actor, v_kind, v_reason);
  end if;
  return null;
end $$;
-- Sem "UPDATE OF": o cancelamento muda fulfillment_status dentro de um trigger BEFORE,
-- e a lista de colunas só enxerga o que está no SET do UPDATE original.
drop trigger if exists orders_quick_record_events on public.orders;
create trigger orders_quick_record_events after update on public.orders
for each row when (
  new.service_model = 'quick_service' and (
    old.service_model is distinct from new.service_model
    or old.payment_status is distinct from new.payment_status
    or old.fulfillment_status is distinct from new.fulfillment_status)
) execute function private.quick_order_record_events();

-- Push por transição: reaproveita private.dispatch_customer_notification_push,
-- que já escuta a tabela notifications.
create or replace function private.quick_order_notify()
returns trigger language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  v_type public.notifications_notification_type_enum;
  v_title text; v_message text; v_location text;
begin
  select pickup_location into v_location from public.restaurant_model_policies
    where restaurant_id = new.restaurant_id and service_model = 'quick_service';

  if old.payment_status is distinct from new.payment_status and new.payment_status = 'confirmed' then
    v_type := 'order_placed'; v_title := 'Pagamento confirmado';
    v_message := 'Recebemos seu pagamento. O restaurante vai aceitar seu pedido em instantes.';
  elsif old.payment_status is distinct from new.payment_status and new.payment_status = 'refunded' then
    v_type := 'order_cancelled'; v_title := 'Pedido estornado';
    v_message := 'O valor do seu pedido foi estornado integralmente.';
  elsif old.fulfillment_status is distinct from new.fulfillment_status then
    case new.fulfillment_status::text
      when 'accepted' then
        v_type := 'order_confirmed'; v_title := 'Pedido aceito';
        v_message := 'O restaurante aceitou seu pedido.';
      when 'preparing' then
        v_type := 'order_confirmed'; v_title := 'Pedido em preparo';
        v_message := 'Seu pedido entrou em preparo.';
      when 'ready' then
        v_type := 'order_ready'; v_title := 'Pedido pronto!';
        v_message := 'Retire seu pedido' || coalesce(' em ' || v_location, '')
          || '. Apresente o código ' || coalesce(new.pickup_code, '') || '.';
      when 'picked_up' then
        v_type := 'order_delivered'; v_title := 'Pedido retirado';
        v_message := 'Pedido retirado. Obrigado! Conte como foi na avaliação.';
      when 'not_picked_up' then
        v_type := 'system'; v_title := 'Pedido não retirado';
        v_message := 'O prazo de retirada terminou e o pedido foi marcado como não retirado.';
      when 'cancelled' then
        v_type := 'order_cancelled'; v_title := 'Pedido cancelado';
        v_message := case when new.payment_status = 'refunded'
          then 'Seu pedido foi cancelado e o valor estornado integralmente.'
          else 'Seu pedido foi cancelado.' end;
      else return null;
    end case;
  else
    return null;
  end if;

  if new.customer_id is not null then
    insert into public.notifications(user_id, title, message, notification_type, related_id, related_type, metadata)
    values (new.customer_id, v_title, v_message, v_type, new.id, 'order',
      jsonb_build_object('orderId', new.id, 'restaurantId', new.restaurant_id,
        'fulfillmentStatus', new.fulfillment_status, 'paymentStatus', new.payment_status));
  end if;
  return null;
end $$;
drop trigger if exists orders_quick_notify on public.orders;
create trigger orders_quick_notify after update on public.orders
for each row when (
  new.service_model = 'quick_service' and old.service_model = 'quick_service' and (
    old.payment_status is distinct from new.payment_status
    or old.fulfillment_status is distinct from new.fulfillment_status)
) execute function private.quick_order_notify();

-- ---------------------------------------------------------------------------
-- 5. Cancelamento/estorno unificado
-- ---------------------------------------------------------------------------

-- Único ponto que cancela um pedido Quick: o trigger release_quick_resources_on_cancel
-- libera o slot e marca o estorno integral quando o pagamento estava confirmado.
create or replace function private.quick_cancel_order(
  p_order_id uuid, p_reason text, p_actor_id uuid, p_action text
) returns public.orders language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_order public.orders; v_before jsonb;
begin
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'Motivo obrigatório' using errcode = '22023';
  end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then raise exception 'Pedido não encontrado' using errcode = 'P0002'; end if;
  if v_order.fulfillment_status in ('cancelled', 'picked_up', 'not_picked_up', 'delivered') then
    raise exception 'Este pedido não pode mais ser cancelado' using errcode = 'P0001';
  end if;
  v_before := jsonb_build_object('fulfillmentStatus', v_order.fulfillment_status,
    'paymentStatus', v_order.payment_status, 'totalCents', v_order.total_cents);

  perform set_config('noowe.status_reason', btrim(p_reason), true);
  if p_actor_id is null then perform set_config('noowe.status_actor', 'system', true); end if;

  update public.order_items set status = 'cancelled', updated_at = now()
    where order_id = v_order.id and status::text <> 'cancelled';
  update public.gateway_transactions set status = 'failed', updated_at = now()
    where order_id = v_order.id and status = 'pending';
  update public.orders set
      status = 'cancelled', cancellation_reason = btrim(p_reason),
      payment_status = case when payment_status = 'pending' then 'failed'::public.noowe_payment_status
        else payment_status end,
      updated_at = now()
    where id = v_order.id returning * into v_order;

  perform set_config('noowe.status_reason', '', true);
  perform set_config('noowe.status_actor', '', true);

  if p_actor_id is null then
    perform private.log_system_audit(v_order.restaurant_id, p_action, 'order', v_order.id,
      btrim(p_reason), v_before,
      jsonb_build_object('fulfillmentStatus', v_order.fulfillment_status, 'paymentStatus', v_order.payment_status));
  else
    perform private.log_audit(v_order.restaurant_id, p_action, 'order', v_order.id, btrim(p_reason),
      v_before,
      jsonb_build_object('fulfillmentStatus', v_order.fulfillment_status, 'paymentStatus', v_order.payment_status),
      p_actor_id);
  end if;
  return v_order;
end $$;
revoke all on function private.quick_cancel_order(uuid, text, uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Varredura preguiçosa (ADR-013 §2.3–§2.5)
-- ---------------------------------------------------------------------------

create or replace function private.grant_quick_store_credit(p_order public.orders)
returns void language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_wallet_id uuid; v_wallet public.wallets; v_amount numeric := round(p_order.total_cents::numeric / 100, 2);
begin
  v_wallet_id := private.ensure_customer_wallet(p_order.customer_id);
  select * into v_wallet from public.wallets where id = v_wallet_id for update;
  if exists (select 1 from public.wallet_transactions
    where wallet_id = v_wallet_id and idempotency_key = 'quick-no-pickup:' || p_order.id::text) then return; end if;
  update public.wallets set balance = balance + v_amount, updated_at = now() where id = v_wallet_id;
  insert into public.wallet_transactions(wallet_id, transaction_type, amount, balance_before, balance_after,
    description, order_id, idempotency_key, metadata)
  values (v_wallet_id, 'store_credit', v_amount, v_wallet.balance, v_wallet.balance + v_amount,
    'Crédito por pedido não retirado', p_order.id, 'quick-no-pickup:' || p_order.id::text,
    jsonb_build_object('order_id', p_order.id, 'reason', 'not_picked_up'));
end $$;
revoke all on function private.grant_quick_store_credit(public.orders) from public, anon, authenticated;

create or replace function private.quick_service_sweep(p_restaurant_id uuid)
returns integer language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  v_policy public.restaurant_model_policies; v_order public.orders; v_count integer := 0;
  v_closed boolean; v_has_hours boolean;
begin
  select * into v_policy from public.restaurant_model_policies
    where restaurant_id = p_restaurant_id and service_model = 'quick_service';
  if v_policy.restaurant_id is null then return 0; end if;

  -- 1. Pix expirado: o pagamento falha e o pedido é cancelado.
  for v_order in
    select * from public.orders
    where restaurant_id = p_restaurant_id and service_model = 'quick_service'
      and payment_status = 'pending' and fulfillment_status = 'received'
      and payment_expires_at is not null and payment_expires_at < now()
    for update skip locked
  loop
    perform private.quick_cancel_order(v_order.id, 'Pix expirado sem pagamento', null, 'quick_order.pix_expired');
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
    update public.orders set fulfillment_status = 'not_picked_up',
      status = 'completed', updated_at = now() where id = v_order.id;
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
end $$;
revoke all on function private.quick_service_sweep(uuid) from public, anon, authenticated;

-- Qualquer usuário autenticado pode pedir a varredura: ela só aplica regras de
-- tempo determinísticas, nunca decide nada por quem chama.
create or replace function public.quick_service_refresh(p_restaurant_id uuid)
returns integer language plpgsql security definer set search_path = public, private, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  return private.quick_service_sweep(p_restaurant_id);
end $$;
revoke all on function public.quick_service_refresh(uuid) from public, anon;
grant execute on function public.quick_service_refresh(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Capacidades: orderAhead e novas políticas
-- ---------------------------------------------------------------------------

alter function public.get_restaurant_model_capabilities_v2(uuid, public.noowe_service_model)
  rename to get_restaurant_model_capabilities_v2_base;
revoke all on function public.get_restaurant_model_capabilities_v2_base(uuid, public.noowe_service_model)
  from public, anon, authenticated;

create or replace function public.get_restaurant_model_capabilities_v2(
  p_restaurant_id uuid, p_service_model public.noowe_service_model
) returns jsonb language plpgsql stable security definer
set search_path = public, private, pg_temp as $$
declare v_result jsonb; v_policy public.restaurant_model_policies;
begin
  v_result := public.get_restaurant_model_capabilities_v2_base(p_restaurant_id, p_service_model);
  if p_service_model = 'quick_service' then
    select * into v_policy from public.restaurant_model_policies
      where restaurant_id = p_restaurant_id and service_model = 'quick_service';
    v_result := jsonb_set(v_result, '{capabilities,orderAhead}', to_jsonb(v_policy.prepaid_required), true);
    v_result := jsonb_set(v_result, '{policies}', (v_result->'policies') || jsonb_build_object(
      'noPickupPolicy', v_policy.no_pickup_policy,
      'acceptMode', v_policy.accept_mode,
      'acceptTimeoutMin', v_policy.accept_timeout_min,
      'ordersPaused', v_policy.orders_paused,
      'defaultPrepMin', v_policy.default_prep_min,
      'closeOrdersBeforeMin', v_policy.close_orders_before_min,
      'pixExpiryMin', v_policy.pix_expiry_min,
      'distanceWarningKm', v_policy.distance_warning_km,
      'pickupLocation', v_policy.pickup_location
    ), true);
  else
    v_result := jsonb_set(v_result, '{capabilities,orderAhead}', 'false'::jsonb, true);
  end if;
  return v_result;
end $$;
revoke all on function public.get_restaurant_model_capabilities_v2(uuid, public.noowe_service_model) from public;
grant execute on function public.get_restaurant_model_capabilities_v2(uuid, public.noowe_service_model)
  to anon, authenticated, service_role;

-- Status em lote para a lista e a página do restaurante.
create or replace function public.customer_quick_service_status(p_restaurant_ids uuid[])
returns jsonb language plpgsql stable security definer set search_path = public, private, pg_temp as $$
declare v_result jsonb := '[]'::jsonb; v_id uuid; v_policy public.restaurant_model_policies;
  v_state text; v_left integer; v_live jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  foreach v_id in array coalesce(p_restaurant_ids, array[]::uuid[]) loop
    select * into v_policy from public.restaurant_model_policies
      where restaurant_id = v_id and service_model = 'quick_service';
    continue when v_policy.restaurant_id is null;
    v_state := private.quick_orders_accepting(v_id);
    v_left := private.quick_minutes_until_close(v_id);
    v_live := private.restaurant_live_status(v_id);
    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'restaurantId', v_id,
      'state', v_state,
      'acceptingOrders', v_state = 'open',
      'isOpen', v_state not in ('closed', 'unavailable'),
      'paused', v_policy.orders_paused,
      'closesAt', v_live->>'closesAt',
      'acceptsUntilMinutes', case when v_left is null then null
        else greatest(0, v_left - v_policy.close_orders_before_min) end,
      'pickupLocation', v_policy.pickup_location,
      'estimatedPrepMinutes', private.quick_estimated_prep_minutes(v_id),
      'ordersInQueue', (select count(*) from public.orders o
        where o.restaurant_id = v_id and o.service_model = 'quick_service' and o.payment_status = 'confirmed'
          and o.fulfillment_status in ('accepted', 'preparing', 'checking'))
    ));
  end loop;
  return v_result;
end $$;
revoke all on function public.customer_quick_service_status(uuid[]) from public, anon;
grant execute on function public.customer_quick_service_status(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Pedido: nome para chamada, comer aqui/levar, política, duplicado, pausa
-- ---------------------------------------------------------------------------

drop function if exists public.customer_create_order_v2(
  uuid, public.noowe_service_model, jsonb, uuid, uuid, uuid, timestamptz);

create or replace function public.customer_create_order_v2(
  p_restaurant_id uuid,
  p_service_model public.noowe_service_model,
  p_items jsonb,
  p_client_request_id uuid,
  p_table_session_id uuid default null,
  p_waitlist_entry_id uuid default null,
  p_pickup_slot_start timestamptz default null,
  p_call_name text default null,
  p_consumption_mode text default null,
  p_pickup_policy_accepted boolean default false
) returns jsonb language plpgsql security definer
set search_path = public, private, pg_temp as $$
declare v_policy public.restaurant_model_policies; v_session public.table_sessions; v_result jsonb; v_existing public.orders;
  v_order_id uuid; v_capacity integer; v_code text; v_discount_cents bigint := 0;
  v_state text; v_fingerprint text; v_dup uuid; v_call_name text; v_mode text; v_day date;
  v_slot_tolerance_min integer;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_client_request_id is null then raise exception 'Idempotency key required' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || ':' || p_client_request_id::text,0));
  select * into v_existing from public.orders where customer_id=auth.uid() and client_request_id=p_client_request_id;
  if v_existing.id is not null then
    return jsonb_build_object('id',v_existing.id,'restaurant_id',v_existing.restaurant_id,
      'table_id',v_existing.table_id,'table_session_id',v_existing.table_session_id,
      'service_model',v_existing.service_model,'status',v_existing.status,
      'payment_status',v_existing.payment_status,'fulfillment_status',v_existing.fulfillment_status,
      'subtotal',v_existing.subtotal,'total_amount',v_existing.total_amount,
      'pickup_code',v_existing.pickup_code,'pickup_expires_at',v_existing.pickup_expires_at,
      'call_name',v_existing.call_name,'consumption_mode',v_existing.consumption_mode,
      'order_items',private.order_items_json(v_existing.id),'idempotentReplay',true);
  end if;
  select * into v_policy from public.restaurant_model_policies
    where restaurant_id = p_restaurant_id and service_model = p_service_model;
  if v_policy.restaurant_id is null then raise exception 'Modelo de serviço indisponível' using errcode = '22023'; end if;

  if p_service_model = 'quick_service' then
    if p_table_session_id is not null or p_waitlist_entry_id is not null then
      raise exception 'Quick Service não usa mesa ou fila' using errcode = '23514';
    end if;
    perform private.quick_service_sweep(p_restaurant_id);

    v_state := private.quick_orders_accepting(p_restaurant_id);
    if v_state = 'paused' then
      raise exception 'O restaurante pausou os pedidos por enquanto' using errcode = 'P0006';
    elsif v_state in ('closed', 'closing') then
      raise exception 'O restaurante não está aceitando pedidos agora' using errcode = 'P0007';
    end if;

    if not coalesce(p_pickup_policy_accepted, false) then
      raise exception 'Aceite a política de retirada para continuar' using errcode = '22023';
    end if;
    v_mode := coalesce(nullif(btrim(p_consumption_mode), ''), 'takeaway');
    if v_mode not in ('dine_here', 'takeaway') then
      raise exception 'Modo de consumo inválido' using errcode = '22023';
    end if;
    v_call_name := nullif(btrim(coalesce(p_call_name, '')), '');
    if v_call_name is null then
      select coalesce(nullif(btrim(pr.call_name), ''), nullif(split_part(btrim(coalesce(pr.full_name, '')), ' ', 1), ''))
        into v_call_name from public.profiles pr where pr.id = auth.uid();
    end if;
    if v_call_name is null then raise exception 'Informe o nome para chamada' using errcode = '22023'; end if;
    v_call_name := left(v_call_name, 40);

    -- Pedido duplicado: mesmo carrinho já em andamento neste restaurante.
    select md5(coalesce(jsonb_agg(jsonb_build_object(
        'i', item->>'menu_item_id', 'q', coalesce(item->>'quantity', '1'),
        'c', coalesce(item->'customizations', 'null'::jsonb), 'g', coalesce(item->>'combo_group', ''))
      order by item->>'menu_item_id', coalesce(item->>'combo_group', ''), coalesce((item->'customizations')::text, '')
    ), '[]'::jsonb)::text) into v_fingerprint
    from jsonb_array_elements(p_items) item;
    select id into v_dup from public.orders
      where customer_id = auth.uid() and restaurant_id = p_restaurant_id and service_model = 'quick_service'
        and cart_fingerprint = v_fingerprint
        and fulfillment_status in ('received', 'accepted', 'preparing', 'checking', 'ready')
        and payment_status in ('pending', 'confirmed')
      order by created_at desc limit 1;
    if v_dup is not null then
      raise exception 'Você já tem um pedido igual em andamento' using errcode = 'P0005', detail = v_dup::text;
    end if;

    if p_pickup_slot_start is not null and v_policy.pickup_capacity_per_slot is not null then
      perform pg_advisory_xact_lock(hashtextextended(p_restaurant_id::text || ':' || p_pickup_slot_start::text, 0));
      select count(*) into v_capacity from public.pickup_slot_reservations
      where restaurant_id = p_restaurant_id and slot_start = p_pickup_slot_start and status = 'reserved';
      if v_capacity >= v_policy.pickup_capacity_per_slot then
        raise exception 'Horário de retirada esgotado' using errcode = 'P0004';
      end if;
    end if;
    v_result := public.place_order(p_restaurant_id, 'pickup', p_items, null, null, null, null);
  else
    if (p_table_session_id is null) = (p_waitlist_entry_id is null) then
      raise exception 'Pedido de salão exige exatamente uma origem: mesa ou fila' using errcode = '23514';
    end if;
    if p_table_session_id is not null then
      select * into v_session from public.table_sessions where id = p_table_session_id
        and restaurant_id = p_restaurant_id and status = 'active' for update;
      if v_session.id is null or not private.is_table_session_participant(v_session.id) then
        raise exception 'Sessão de mesa inválida' using errcode = 'P0001';
      end if;
      if v_session.service_model is distinct from p_service_model then
        raise exception 'Modelo da mesa incompatível' using errcode = '23514';
      end if;
    elsif not v_policy.order_while_waiting or not exists (
      select 1 from public.waitlist_entries where id = p_waitlist_entry_id
        and restaurant_id = p_restaurant_id and customer_id = auth.uid() and status::text in ('waiting','called','arrived')
    ) then raise exception 'Entrada de fila inválida para pedido' using errcode = 'P0001'; end if;
    v_result := public.place_order(p_restaurant_id, 'dine_in', p_items, v_session.table_id, null, null, null);
  end if;

  v_order_id := (v_result->>'id')::uuid;
  v_slot_tolerance_min := v_policy.pickup_expiry_min;
  if p_service_model = 'quick_service' then
    v_day := (now() at time zone 'America/Sao_Paulo')::date;
    v_code := private.generate_pickup_code(p_restaurant_id, v_day);
    -- A combo is represented by three server-priced lines carrying the same
    -- combo_group. The client identifies the grouping; it never supplies price.
    select coalesce(round(sum(mi.price * greatest(1,coalesce((item->>'quantity')::integer,1)))
      * v_policy.combo_discount_bps / 10000 * 100)::bigint,0)
    into v_discount_cents
    from jsonb_array_elements(p_items) item
    join public.menu_items mi on mi.id=(item->>'menu_item_id')::uuid and mi.restaurant_id=p_restaurant_id
    where nullif(item->>'combo_group','') is not null;
  end if;
  -- pickup_expires_at fica nulo até o pedido ficar pronto (ADR-013 §2.3).
  update public.orders set
    client_request_id = p_client_request_id,
    service_model = p_service_model,
    origin_type = case when p_service_model = 'quick_service' then 'counter'::public.noowe_order_origin
      when p_table_session_id is not null then 'table_session'::public.noowe_order_origin
      else 'waitlist'::public.noowe_order_origin end,
    table_session_id = p_table_session_id,
    waitlist_entry_id = p_waitlist_entry_id,
    payment_status = 'pending', fulfillment_status = 'received',
    subtotal_cents = round(coalesce(subtotal,0) * 100)::bigint,
    discount_cents = v_discount_cents,
    total_cents = greatest(0,round(coalesce(total_amount,0) * 100)::bigint-v_discount_cents),
    discount_amount = v_discount_cents::numeric/100,
    total_amount = greatest(0,coalesce(total_amount,0)-v_discount_cents::numeric/100),
    pickup_code = v_code,
    pickup_code_day = v_day,
    pickup_expires_at = null,
    pickup_slot_start = p_pickup_slot_start,
    call_name = v_call_name,
    consumption_mode = v_mode,
    pickup_policy_accepted_at = case when p_service_model = 'quick_service' then now() end,
    cart_fingerprint = v_fingerprint
  where id = v_order_id;
  if p_pickup_slot_start is not null then
    insert into public.pickup_slot_reservations(restaurant_id, order_id, slot_start, expires_at)
    values (p_restaurant_id, v_order_id, p_pickup_slot_start, now() + make_interval(mins => v_slot_tolerance_min));
  end if;
  return v_result || jsonb_build_object('service_model',p_service_model,'payment_status','pending',
    'discount_amount',v_discount_cents::numeric/100,
    'total_amount',greatest(0,coalesce((v_result->>'total_amount')::numeric,0)-v_discount_cents::numeric/100),
    'fulfillment_status','received','pickup_code',v_code,'pickup_expires_at',null,
    'call_name',v_call_name,'consumption_mode',v_mode);
end $$;
revoke all on function public.customer_create_order_v2(
  uuid, public.noowe_service_model, jsonb, uuid, uuid, uuid, timestamptz, text, text, boolean) from public;
grant execute on function public.customer_create_order_v2(
  uuid, public.noowe_service_model, jsonb, uuid, uuid, uuid, timestamptz, text, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Pagamento: Pix pendente com expiração; aceite automático
-- ---------------------------------------------------------------------------

create or replace function private.process_simulated_payment_event(
  p_transaction_id uuid, p_provider_event_id text, p_outcome public.noowe_payment_status
) returns jsonb language plpgsql security definer
set search_path = public, private, pg_temp as $$
declare v_tx public.gateway_transactions; v_order public.orders; v_status text; v_mode text;
begin
  select * into v_tx from public.gateway_transactions where id = p_transaction_id for update;
  if v_tx.id is null or v_tx.provider <> 'simulated' then raise exception 'Payment transaction not found' using errcode = 'P0002'; end if;
  insert into public.payment_provider_events(provider,provider_event_id,gateway_transaction_id,outcome)
    values ('simulated',p_provider_event_id,v_tx.id,p_outcome) on conflict do nothing;
  if not found then
    select * into v_order from public.orders where id = v_tx.order_id;
    return jsonb_build_object('transactionId',v_tx.id,'orderId',v_tx.order_id,
      'paymentStatus',v_order.payment_status,'idempotentReplay',true);
  end if;
  select * into v_order from public.orders where id = v_tx.order_id for update;
  -- Um pedido já cancelado (ex.: Pix expirado) não aceita mais confirmação.
  if p_outcome = 'confirmed' and (
    v_order.fulfillment_status in ('cancelled', 'not_picked_up')
    or v_order.payment_status in ('failed', 'refunded')
    or (v_order.payment_expires_at is not null and v_order.payment_expires_at < now())
  ) then
    raise exception 'Este pedido não aceita mais pagamento' using errcode = 'P0001';
  end if;
  v_status := case p_outcome when 'confirmed' then 'completed' when 'failed' then 'failed'
    when 'refunded' then 'refunded' else 'pending' end;
  -- A confirmação vem do provedor, não de quem abriu a requisição: o log registra "system".
  perform set_config('noowe.status_actor', 'system', true);
  update public.gateway_transactions set status = v_status, updated_at = now() where id = v_tx.id;
  update public.orders set payment_status = p_outcome,
    status = case when p_outcome = 'confirmed' and service_model = 'quick_service'
      then 'confirmed'::public.orders_status_enum else status end,
    updated_at = now() where id = v_tx.order_id returning * into v_order;
  if p_outcome = 'confirmed' and v_order.service_model = 'quick_service' then
    select accept_mode into v_mode from public.restaurant_model_policies
      where restaurant_id = v_order.restaurant_id and service_model = 'quick_service';
    if v_mode = 'auto' then
      update public.orders set fulfillment_status = 'accepted', updated_at = now()
        where id = v_order.id returning * into v_order;
    end if;
  end if;
  if p_outcome = 'failed' then
    update public.pickup_slot_reservations set status = 'released' where order_id = v_order.id and status = 'reserved';
  end if;
  perform set_config('noowe.status_actor', '', true);
  return jsonb_build_object('transactionId',v_tx.id,'orderId',v_order.id,
    'paymentStatus',v_order.payment_status,'fulfillmentStatus',v_order.fulfillment_status,
    'idempotentReplay',false);
end $$;
revoke all on function private.process_simulated_payment_event(uuid,text,public.noowe_payment_status) from public, anon, authenticated;

create or replace function public.customer_start_payment(
  p_order_id uuid, p_payment_method text, p_idempotency_key uuid
) returns jsonb language plpgsql security definer
set search_path = public, private, pg_temp as $$
declare v_order public.orders; v_tx public.gateway_transactions; v_result jsonb; v_key text;
  v_pix_min integer; v_async boolean;
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

  v_async := v_order.service_model = 'quick_service' and p_payment_method = 'pix';
  if v_async then
    -- Pix já gerado e ainda válido para este pedido: reaproveita.
    select * into v_tx from public.gateway_transactions
      where order_id = v_order.id and payment_method = 'pix' and status = 'pending'
      order by created_at desc limit 1;
    if v_tx.id is not null then
      return jsonb_build_object('transactionId',v_tx.id,'orderId',v_order.id,'paymentStatus','pending',
        'fulfillmentStatus',v_order.fulfillment_status,'paymentExpiresAt',v_order.payment_expires_at,
        'pixCode','noowe-pix-' || v_tx.id::text,'simulated',true,'idempotentReplay',true);
    end if;
  end if;

  insert into public.gateway_transactions(
    restaurant_id,order_id,customer_id,provider,payment_method,amount,amount_cents,
    refunded_amount_cents,status,idempotency_key,metadata,created_at,updated_at
  ) values (
    v_order.restaurant_id,v_order.id,auth.uid(),'simulated',p_payment_method,
    v_order.total_cents::numeric/100,v_order.total_cents,0,'pending',v_key,
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
revoke all on function public.customer_start_payment(uuid,text,uuid) from public;
grant execute on function public.customer_start_payment(uuid,text,uuid) to authenticated;

-- Atalho de desenvolvimento: confirma o Pix simulado pendente. Só roda com a
-- flag ligada e só toca transações do provedor "simulated".
create or replace function public.customer_confirm_simulated_pix(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_tx public.gateway_transactions;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if not exists (select 1 from private.dev_flags where key = 'simulate_pix_payment' and enabled) then
    raise exception 'A confirmação de Pix simulado está desligada no banco.' using errcode = '42501';
  end if;
  select gt.* into v_tx from public.gateway_transactions gt
    join public.orders o on o.id = gt.order_id
    where gt.order_id = p_order_id and o.customer_id = auth.uid()
      and gt.payment_method = 'pix' and gt.provider = 'simulated' and gt.status = 'pending'
    order by gt.created_at desc limit 1;
  if v_tx.id is null then raise exception 'Nenhum Pix pendente para este pedido' using errcode = 'P0002'; end if;
  return private.process_simulated_payment_event(v_tx.id, 'simulated-pix:' || v_tx.id, 'confirmed');
end $$;
revoke all on function public.customer_confirm_simulated_pix(uuid) from public, anon;
grant execute on function public.customer_confirm_simulated_pix(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 10. Produção só com pagamento confirmado E pedido aceito
-- ---------------------------------------------------------------------------

create or replace function private.quick_order_may_enter_production(p_order public.orders)
returns boolean language sql immutable set search_path=pg_catalog,public as $$
  select p_order.service_model is distinct from 'quick_service'::public.noowe_service_model
    or (p_order.payment_status = 'confirmed' and p_order.accepted_at is not null)
$$;

create or replace function public.restaurant_update_order_item_status(p_item_id uuid, p_status text)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_item public.order_items; v_order public.orders; v_current text; v_next text := lower(trim(p_status));
  v_all_ready boolean; v_any_preparing boolean; v_all_cancelled boolean;
begin
  select oi.* into v_item from public.order_items oi
    where oi.id=p_item_id for update;
  if v_item.id is null then raise exception 'Item não encontrado' using errcode='P0002'; end if;
  select * into v_order from public.orders where id=v_item.order_id for update;
  perform private.require_restaurant_role(v_order.restaurant_id);
  if v_order.service_model='quick_service' and v_next <> 'cancelled'
    and not private.quick_order_may_enter_production(v_order) then
    raise exception 'Pedido Quick ainda não está pago e aceito' using errcode='23514';
  end if;
  v_current := case v_item.status::text when 'pending' then 'received' else v_item.status::text end;
  if not ((v_current='received' and v_next in ('preparing','cancelled'))
    or (v_current='preparing' and v_next in ('ready','cancelled'))
    or v_current=v_next) then raise exception 'Transição de item inválida: % -> %',v_current,v_next using errcode='23514'; end if;
  update public.order_items set status=(case when v_next='received' then 'pending' else v_next end)::public.order_items_status_enum,
    prepared_at=case when v_next='ready' then coalesce(prepared_at,now()) else prepared_at end, updated_at=now()
    where id=v_item.id;
  select bool_and(status::text in ('ready','delivered','cancelled')),
    bool_or(status::text='preparing'),bool_and(status::text='cancelled')
  into v_all_ready,v_any_preparing,v_all_cancelled from public.order_items where order_id=v_order.id;
  update public.orders set fulfillment_status=case
      when v_all_cancelled then 'cancelled'::public.noowe_fulfillment_status
      when v_all_ready and service_model='quick_service' then 'checking'::public.noowe_fulfillment_status
      when v_all_ready then 'ready'::public.noowe_fulfillment_status
      when v_any_preparing then 'preparing'::public.noowe_fulfillment_status
      when fulfillment_status = 'accepted'::public.noowe_fulfillment_status then 'accepted'::public.noowe_fulfillment_status
      else 'received'::public.noowe_fulfillment_status end,
    status=case when v_all_cancelled then 'cancelled'::public.orders_status_enum
      when v_all_ready and service_model='quick_service' then 'preparing'::public.orders_status_enum
      when v_all_ready then 'ready'::public.orders_status_enum
      when v_any_preparing then 'preparing'::public.orders_status_enum else status end,
    updated_at=now() where id=v_order.id;
  return jsonb_build_object('orderId',v_order.id,'itemId',v_item.id,'status',v_next);
end $$;
grant execute on function public.restaurant_update_order_item_status(uuid,text) to authenticated, service_role;

create or replace function public.restaurant_update_order_status(
  p_order_id uuid,p_status text,p_estimated_time integer default null
) returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_order public.orders; v_next text:=lower(trim(p_status)); v_result jsonb;
begin
  select * into v_order from public.orders where id=p_order_id for update;
  if v_order.id is null then raise exception 'Order not found' using errcode='P0002'; end if;
  perform private.require_restaurant_role(v_order.restaurant_id);
  if v_order.service_model='quick_service' then
    if v_next in ('confirmed','preparing','ready','delivered','picked_up')
      and not private.quick_order_may_enter_production(v_order) then
      raise exception 'Pedido Quick ainda não está pago e aceito' using errcode='23514'; end if;
    if v_next='ready' then raise exception 'Quick Service exige conferência antes de ficar pronto' using errcode='23514'; end if;
    if v_next in ('delivered','picked_up') then raise exception 'Use a confirmação de retirada com código' using errcode='23514'; end if;
    if v_next='cancelled' then raise exception 'Use o cancelamento com motivo' using errcode='23514'; end if;
  elsif v_next='ready' and exists(
    select 1 from public.order_items where order_id=v_order.id and status::text not in ('ready','delivered','cancelled')
  ) then raise exception 'O pedido só fica pronto quando todos os itens terminarem' using errcode='23514';
  end if;
  v_result:=public.restaurant_update_order_status_legacy_v1(p_order_id,p_status,p_estimated_time);
  update public.orders set fulfillment_status=case v_next
      when 'preparing' then 'preparing'::public.noowe_fulfillment_status
      when 'ready' then 'ready'::public.noowe_fulfillment_status
      when 'delivered' then 'delivered'::public.noowe_fulfillment_status
      when 'completed' then 'delivered'::public.noowe_fulfillment_status
      when 'cancelled' then 'cancelled'::public.noowe_fulfillment_status
      else fulfillment_status end
    where id=p_order_id;
  return v_result||jsonb_build_object('payment_status',v_order.payment_status,
    'fulfillment_status',(select fulfillment_status from public.orders where id=p_order_id));
end $$;
revoke all on function public.restaurant_update_order_status(uuid,text,integer) from public;
grant execute on function public.restaurant_update_order_status(uuid,text,integer) to authenticated,service_role;

-- A conferência aprovada marca "pronto" e inicia a contagem da tolerância. Reprovada, devolve à
-- estação só os itens apontados (critério Q1 #9); os demais ficam prontos e o pedido volta à
-- conferência quando o item devolvido terminar de novo.
drop function if exists public.restaurant_complete_quality_check(uuid, boolean, jsonb, text);
create or replace function public.restaurant_complete_quality_check(
  p_order_id uuid, p_passed boolean, p_checklist jsonb, p_reason text default null,
  p_item_ids uuid[] default null
) returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_order public.orders; v_tolerance integer; v_returned integer := 0;
begin
  select * into v_order from public.orders where id=p_order_id for update;
  if v_order.id is null then raise exception 'Pedido não encontrado' using errcode='P0002'; end if;
  perform private.require_restaurant_role(v_order.restaurant_id);
  if v_order.service_model<>'quick_service' or v_order.payment_status<>'confirmed'
    or v_order.fulfillment_status<>'checking' then raise exception 'Pedido não está aguardando conferência' using errcode='23514'; end if;
  if p_checklist is null or jsonb_typeof(p_checklist)<>'object' or p_checklist='{}'::jsonb then
    raise exception 'Checklist obrigatório' using errcode='22023'; end if;
  if not p_passed and nullif(trim(p_reason),'') is null then raise exception 'Motivo obrigatório' using errcode='22023'; end if;
  select pickup_expiry_min into v_tolerance from public.restaurant_model_policies
    where restaurant_id=v_order.restaurant_id and service_model='quick_service';
  insert into public.quick_quality_checks(order_id,restaurant_id,status,checklist,reason,checked_by)
    values(v_order.id,v_order.restaurant_id,case when p_passed then 'passed' else 'failed' end,p_checklist,p_reason,auth.uid());
  perform set_config('noowe.status_reason', coalesce(nullif(trim(p_reason),''), ''), true);
  if not p_passed then
    update public.order_items set status='preparing', prepared_at=null, updated_at=now()
      where order_id=v_order.id and status::text='ready'
        and (p_item_ids is null or id = any(p_item_ids));
    get diagnostics v_returned = row_count;
    if v_returned = 0 then raise exception 'Nenhum item para devolver à estação' using errcode='22023'; end if;
  end if;
  update public.orders set fulfillment_status=case when p_passed then 'ready'::public.noowe_fulfillment_status
      else 'preparing'::public.noowe_fulfillment_status end,
    status=case when p_passed then 'ready'::public.orders_status_enum else 'preparing'::public.orders_status_enum end,
    actual_ready_at=case when p_passed then now() else actual_ready_at end,
    pickup_expires_at=case when p_passed then private.quick_pickup_deadline(now(), v_tolerance) else pickup_expires_at end,
    updated_at=now() where id=v_order.id;
  perform set_config('noowe.status_reason', '', true);
  return jsonb_build_object('orderId',v_order.id,'fulfillmentStatus',case when p_passed then 'ready' else 'preparing' end,
    'itemsReturned',v_returned);
end $$;
revoke all on function public.restaurant_complete_quality_check(uuid,boolean,jsonb,text,uuid[]) from public;
grant execute on function public.restaurant_complete_quality_check(uuid,boolean,jsonb,text,uuid[]) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 11. Cancelamento pelo cliente: só até o início do preparo, estorno integral
-- ---------------------------------------------------------------------------

create or replace function public.customer_cancel_order(p_order_id uuid, p_reason text default null)
returns public.orders language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_order public.orders;
begin
  if auth.uid() is null then
    raise exception 'Autenticação necessária.' using errcode = '28000';
  end if;
  select * into v_order from public.orders
  where id = p_order_id and customer_id = auth.uid()
  for update;
  if v_order.id is null then
    raise exception 'Pedido não encontrado.' using errcode = 'P0002';
  end if;

  if v_order.service_model = 'quick_service' then
    if v_order.fulfillment_status not in ('received', 'accepted') or exists (
      select 1 from public.order_items oi
      where oi.order_id = v_order.id and oi.status::text in ('preparing', 'ready', 'delivered')
    ) then
      raise exception 'Este pedido já entrou em preparo e não pode mais ser cancelado.' using errcode = 'P0001';
    end if;
    return private.quick_cancel_order(v_order.id,
      coalesce(nullif(btrim(p_reason), ''), 'Cancelado pelo cliente'), auth.uid(), 'quick_order.customer_cancel');
  end if;

  if v_order.status::text not in ('pending', 'confirmed')
     or exists (
       select 1 from public.order_items oi
       where oi.order_id = v_order.id
         and oi.status::text in ('preparing', 'ready', 'delivered')
     )
  then
    raise exception 'Este pedido já entrou em preparo e não pode mais ser cancelado.' using errcode = 'P0001';
  end if;

  update public.orders
  set status = 'cancelled', cancellation_reason = nullif(trim(p_reason), ''), updated_at = now()
  where id = v_order.id
  returning * into v_order;
  return v_order;
end $$;
revoke all on function public.customer_cancel_order(uuid, text) from public;
grant execute on function public.customer_cancel_order(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 12. Operação do restaurante
-- ---------------------------------------------------------------------------

create or replace function public.restaurant_accept_quick_order(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_order public.orders;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then raise exception 'Pedido não encontrado' using errcode = 'P0002'; end if;
  perform private.require_restaurant_role(v_order.restaurant_id);
  if v_order.service_model <> 'quick_service' or v_order.payment_status <> 'confirmed'
    or v_order.fulfillment_status <> 'received' then
    raise exception 'Pedido não está aguardando aceite' using errcode = '23514';
  end if;
  update public.orders set fulfillment_status = 'accepted', updated_at = now() where id = v_order.id;
  return jsonb_build_object('orderId', v_order.id, 'fulfillmentStatus', 'accepted');
end $$;
revoke all on function public.restaurant_accept_quick_order(uuid) from public, anon;
grant execute on function public.restaurant_accept_quick_order(uuid) to authenticated;

-- Cancelar ou recusar: motivo obrigatório, estorno integral, audit_log.
-- Antes do preparo qualquer equipe pode; depois, só dono e gerente.
create or replace function public.restaurant_cancel_quick_order(p_order_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_order public.orders; v_result public.orders;
begin
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'Motivo obrigatório' using errcode = '22023';
  end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then raise exception 'Pedido não encontrado' using errcode = 'P0002'; end if;
  if v_order.service_model <> 'quick_service' then
    raise exception 'Use o cancelamento do salão' using errcode = '23514';
  end if;
  if v_order.fulfillment_status in ('received', 'accepted') then
    perform private.require_restaurant_role(v_order.restaurant_id);
  else
    perform private.require_restaurant_role(v_order.restaurant_id,
      array['owner','manager']::public.user_roles_role_enum[]);
  end if;
  v_result := private.quick_cancel_order(v_order.id, p_reason, auth.uid(), 'quick_order.restaurant_cancel');
  return jsonb_build_object('orderId', v_result.id, 'fulfillmentStatus', v_result.fulfillment_status,
    'paymentStatus', v_result.payment_status, 'refundedCents',
    case when v_result.payment_status = 'refunded' then v_result.total_cents else 0 end);
end $$;
revoke all on function public.restaurant_cancel_quick_order(uuid, text) from public, anon;
grant execute on function public.restaurant_cancel_quick_order(uuid, text) to authenticated;

-- Item esgotado depois do pagamento: estorno parcial calculado no servidor.
create or replace function public.restaurant_refund_unavailable_item(p_order_item_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_item public.order_items; v_order public.orders; v_cents bigint; v_remaining bigint;
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
  v_remaining := coalesce(v_order.total_cents, 0) - v_order.refunded_cents;
  v_cents := least(v_cents, v_remaining);
  if v_cents <= 0 then raise exception 'Nada a estornar neste item' using errcode = '23514'; end if;

  update public.orders set refunded_cents = refunded_cents + v_cents, updated_at = now() where id = v_order.id;
  update public.gateway_transactions
    set refunded_amount_cents = least(amount_cents, refunded_amount_cents + v_cents), updated_at = now()
    where order_id = v_order.id and status = 'completed';
  perform private.log_audit(v_order.restaurant_id, 'quick_order.partial_refund', 'order_item', v_item.id,
    btrim(p_reason),
    jsonb_build_object('refundedCents', v_order.refunded_cents),
    jsonb_build_object('refundedCents', v_order.refunded_cents + v_cents, 'itemRefundCents', v_cents,
      'orderId', v_order.id));
  perform public.restaurant_update_order_item_status(v_item.id, 'cancelled');
  return jsonb_build_object('orderId', v_order.id, 'itemId', v_item.id, 'refundedCents', v_cents,
    'totalRefundedCents', v_order.refunded_cents + v_cents);
end $$;
revoke all on function public.restaurant_refund_unavailable_item(uuid, text) from public, anon;
grant execute on function public.restaurant_refund_unavailable_item(uuid, text) to authenticated;

create or replace function public.restaurant_recall_pickup(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_order public.orders; v_location text;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then raise exception 'Pedido não encontrado' using errcode = 'P0002'; end if;
  perform private.require_restaurant_role(v_order.restaurant_id);
  if v_order.service_model <> 'quick_service' or v_order.fulfillment_status <> 'ready' then
    raise exception 'Pedido não está aguardando retirada' using errcode = '23514';
  end if;
  select pickup_location into v_location from public.restaurant_model_policies
    where restaurant_id = v_order.restaurant_id and service_model = 'quick_service';
  update public.orders set pickup_recalled_at = now(), pickup_recall_count = pickup_recall_count + 1,
    updated_at = now() where id = v_order.id;
  insert into public.notifications(user_id, title, message, notification_type, related_id, related_type, metadata)
  values (v_order.customer_id, 'Seu pedido está esperando',
    coalesce(v_order.call_name, 'Seu pedido') || ', retire seu pedido' || coalesce(' em ' || v_location, '') || '.',
    'order_ready', v_order.id, 'order',
    jsonb_build_object('orderId', v_order.id, 'fulfillmentStatus', 'ready', 'recall', true));
  return jsonb_build_object('orderId', v_order.id, 'recallCount', v_order.pickup_recall_count + 1);
end $$;
revoke all on function public.restaurant_recall_pickup(uuid) from public, anon;
grant execute on function public.restaurant_recall_pickup(uuid) to authenticated;

-- Retirada por código digitado: acha o pedido pronto do dia e aplica a mesma
-- validação de restaurant_confirm_pickup (o código nunca vem do pedido).
create or replace function public.restaurant_confirm_pickup_by_code(p_restaurant_id uuid, p_pickup_code text)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_order_id uuid;
begin
  perform private.require_restaurant_role(p_restaurant_id);
  perform private.quick_service_sweep(p_restaurant_id);
  select id into v_order_id from public.orders
    where restaurant_id = p_restaurant_id and service_model = 'quick_service'
      and fulfillment_status = 'ready'
      and pickup_code_day = (now() at time zone 'America/Sao_Paulo')::date
      and pickup_code = upper(btrim(coalesce(p_pickup_code, '')));
  if v_order_id is null then
    raise exception 'Código inválido, expirado ou pedido não está pronto' using errcode = '23514';
  end if;
  return public.restaurant_confirm_pickup(v_order_id, p_pickup_code);
end $$;
revoke all on function public.restaurant_confirm_pickup_by_code(uuid, text) from public, anon;
grant execute on function public.restaurant_confirm_pickup_by_code(uuid, text) to authenticated;

create or replace function public.restaurant_set_quick_orders_paused(p_restaurant_id uuid, p_paused boolean)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
begin
  perform private.require_restaurant_role(p_restaurant_id);
  update public.restaurant_model_policies set orders_paused = coalesce(p_paused, false), updated_at = now()
    where restaurant_id = p_restaurant_id and service_model = 'quick_service';
  if not found then raise exception 'Quick Service não está ativo neste restaurante' using errcode = '22023'; end if;
  return jsonb_build_object('restaurantId', p_restaurant_id, 'ordersPaused', coalesce(p_paused, false));
end $$;
revoke all on function public.restaurant_set_quick_orders_paused(uuid, boolean) from public, anon;
grant execute on function public.restaurant_set_quick_orders_paused(uuid, boolean) to authenticated;

create or replace function public.restaurant_update_quick_service_policy(p_restaurant_id uuid, p_patch jsonb)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_before public.restaurant_model_policies; v_after public.restaurant_model_policies;
begin
  perform private.require_restaurant_role(p_restaurant_id, array['owner','manager']::public.user_roles_role_enum[]);
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'Alterações inválidas' using errcode = '22023';
  end if;
  select * into v_before from public.restaurant_model_policies
    where restaurant_id = p_restaurant_id and service_model = 'quick_service' for update;
  if v_before.restaurant_id is null then
    raise exception 'Quick Service não está ativo neste restaurante' using errcode = '22023';
  end if;

  -- Tolerância e capacidade vivem também em restaurant_model_configs, que alimenta
  -- as policies por trigger: grava lá primeiro.
  if jsonb_exists(p_patch, 'pickupExpiryMin') then
    update public.restaurant_model_configs set pickup_expiry_min = (p_patch->>'pickupExpiryMin')::integer
      where restaurant_id = p_restaurant_id;
  end if;
  if jsonb_exists(p_patch, 'pickupCapacityPerSlot') then
    update public.restaurant_model_configs
      set pickup_capacity_per_slot = nullif(p_patch->>'pickupCapacityPerSlot', '')::integer
      where restaurant_id = p_restaurant_id;
  end if;

  update public.restaurant_model_policies set
    pickup_expiry_min = coalesce((p_patch->>'pickupExpiryMin')::integer, pickup_expiry_min),
    pickup_capacity_per_slot = case when jsonb_exists(p_patch, 'pickupCapacityPerSlot')
      then nullif(p_patch->>'pickupCapacityPerSlot', '')::integer else pickup_capacity_per_slot end,
    no_pickup_policy = coalesce(p_patch->>'noPickupPolicy', no_pickup_policy),
    accept_mode = coalesce(p_patch->>'acceptMode', accept_mode),
    accept_timeout_min = coalesce((p_patch->>'acceptTimeoutMin')::integer, accept_timeout_min),
    default_prep_min = coalesce((p_patch->>'defaultPrepMin')::integer, default_prep_min),
    close_orders_before_min = coalesce((p_patch->>'closeOrdersBeforeMin')::integer, close_orders_before_min),
    pix_expiry_min = coalesce((p_patch->>'pixExpiryMin')::integer, pix_expiry_min),
    distance_warning_km = coalesce((p_patch->>'distanceWarningKm')::numeric, distance_warning_km),
    pickup_location = case when jsonb_exists(p_patch, 'pickupLocation')
      then nullif(btrim(p_patch->>'pickupLocation'), '') else pickup_location end,
    updated_at = now()
  where restaurant_id = p_restaurant_id and service_model = 'quick_service'
  returning * into v_after;

  perform private.log_audit(p_restaurant_id, 'quick_service.policy_update', 'restaurant', p_restaurant_id,
    'Configuração do Quick Service atualizada', to_jsonb(v_before), to_jsonb(v_after));
  return jsonb_build_object('restaurantId', p_restaurant_id, 'updated', true);
end $$;
revoke all on function public.restaurant_update_quick_service_policy(uuid, jsonb) from public, anon;
grant execute on function public.restaurant_update_quick_service_policy(uuid, jsonb) to authenticated;

-- Painel: abas Novos, Em preparo, Aguardando retirada, Retirados, Não retirados e
-- Agendados.  O código de retirada NÃO vai para o painel: é o segredo que a equipe
-- confere com o cliente.
create or replace function public.restaurant_get_quick_panel(p_restaurant_id uuid)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_policy public.restaurant_model_policies; v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_rows jsonb;
begin
  perform private.require_restaurant_role(p_restaurant_id);
  select * into v_policy from public.restaurant_model_policies
    where restaurant_id = p_restaurant_id and service_model = 'quick_service';
  if v_policy.restaurant_id is null then raise exception 'Quick Service não está ativo neste restaurante' using errcode = '22023'; end if;
  perform private.quick_service_sweep(p_restaurant_id);

  select coalesce(jsonb_agg(row_json order by sort_at), '[]'::jsonb) into v_rows from (
    select o.created_at as sort_at, jsonb_build_object(
      'id', o.id, 'shortRef', upper(right(replace(o.id::text, '-', ''), 4)),
      'callName', o.call_name, 'consumptionMode', o.consumption_mode,
      'paymentStatus', o.payment_status, 'fulfillmentStatus', o.fulfillment_status,
      'totalCents', o.total_cents, 'refundedCents', o.refunded_cents,
      'createdAt', o.created_at, 'paidAt', o.paid_at, 'acceptedAt', o.accepted_at,
      'pickupSlotStart', o.pickup_slot_start, 'pickupExpiresAt', o.pickup_expires_at,
      'pickedUpAt', o.picked_up_at, 'recallCount', o.pickup_recall_count,
      'acceptDeadline', case when v_policy.accept_mode = 'manual' and o.accepted_at is null
        then o.paid_at + make_interval(mins => v_policy.accept_timeout_min) end,
      'tab', case
        when o.fulfillment_status in ('received', 'accepted') and o.pickup_slot_start is not null
          and o.pickup_slot_start - make_interval(mins => v_policy.default_prep_min) > now() then 'scheduled'
        when o.fulfillment_status in ('received', 'accepted') then 'new'
        when o.fulfillment_status in ('preparing', 'checking') then 'preparing'
        when o.fulfillment_status = 'ready' then 'awaiting_pickup'
        when o.fulfillment_status = 'picked_up' then 'picked_up'
        when o.fulfillment_status = 'not_picked_up' then 'not_picked_up' end,
      'items', private.order_items_json(o.id)
    ) as row_json
    from public.orders o
    where o.restaurant_id = p_restaurant_id and o.service_model = 'quick_service'
      and o.payment_status = 'confirmed'
      and (
        o.fulfillment_status in ('received', 'accepted', 'preparing', 'checking', 'ready')
        or (o.fulfillment_status in ('picked_up', 'not_picked_up')
          and (coalesce(o.picked_up_at, o.updated_at) at time zone 'America/Sao_Paulo')::date = v_today)
      )
  ) q;

  return jsonb_build_object(
    'restaurantId', p_restaurant_id,
    'orders', v_rows,
    'settings', jsonb_build_object(
      'ordersPaused', v_policy.orders_paused, 'acceptMode', v_policy.accept_mode,
      'acceptTimeoutMin', v_policy.accept_timeout_min, 'pickupExpiryMin', v_policy.pickup_expiry_min,
      'noPickupPolicy', v_policy.no_pickup_policy, 'defaultPrepMin', v_policy.default_prep_min,
      'closeOrdersBeforeMin', v_policy.close_orders_before_min, 'pixExpiryMin', v_policy.pix_expiry_min,
      'distanceWarningKm', v_policy.distance_warning_km, 'pickupCapacityPerSlot', v_policy.pickup_capacity_per_slot,
      'pickupLocation', v_policy.pickup_location),
    'estimatedPrepMinutes', private.quick_estimated_prep_minutes(p_restaurant_id)
  );
end $$;
revoke all on function public.restaurant_get_quick_panel(uuid) from public, anon;
grant execute on function public.restaurant_get_quick_panel(uuid) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter table public.order_status_events replica identity full;
    if not exists (select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'order_status_events') then
      alter publication supabase_realtime add table public.order_status_events;
    end if;
  end if;
end $$;
