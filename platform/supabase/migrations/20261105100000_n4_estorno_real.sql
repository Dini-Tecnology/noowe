-- N4: o estorno passa a chegar ao provedor. Antes, refund_pending ficava só no banco e cancelar pedido marcava "estornado" sem devolver nada.
-- Aprovado, o estorno entra numa fila; um worker envia ao Asaas, e quem confirma é o webhook. Falhou de vez, gerente e Dono são avisados.

create table public.payment_refunds (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  gateway_transaction_id uuid not null references public.gateway_transactions(id) on delete cascade,
  amount_cents bigint not null check (amount_cents > 0),
  reason text not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'done', 'failed')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at timestamptz,
  done_at timestamptz,
  error_message text,
  requested_by uuid references public.profiles(id) on delete set null,
  approval_id uuid references public.approvals(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index payment_refunds_due_idx on public.payment_refunds(next_attempt_at) where status in ('pending', 'processing', 'sent');
create index payment_refunds_tx_idx on public.payment_refunds(gateway_transaction_id);
alter table public.payment_refunds enable row level security;
create policy payment_refunds_read on public.payment_refunds for select to authenticated
  using (private.has_restaurant_role(restaurant_id, array['owner','manager']::public.user_roles_role_enum[]));

alter table public.approvals add column gateway_transaction_id uuid references public.gateway_transactions(id) on delete set null;
alter table public.fiscal_documents
  add column cancel_status text check (cancel_status in ('requested', 'processing', 'cancelled', 'failed')),
  add column cancel_reason text,
  add column cancel_attempts integer not null default 0,
  add column cancel_next_attempt_at timestamptz,
  add column cancel_claimed_at timestamptz,
  add column cancelled_at timestamptz,
  add column cancel_error text;

-- Tentativas e espera do envio. Técnica, não regra de negócio.
create or replace function private.refund_retry_policy(out max_attempts integer, out base_delay interval, out max_delay interval, out stale_after interval, out verify_after interval)
language sql immutable as $$
  select 6, interval '1 minute', interval '1 hour', interval '5 minutes', interval '30 minutes'
$$;
revoke all on function private.refund_retry_policy() from public, anon, authenticated;

-- Quanto ainda pode voltar ao cliente nesta transação.
create or replace function private.refund_available_cents(p_tx uuid)
returns bigint language sql stable security definer set search_path = public, pg_temp as $$
  select g.amount_cents - g.refunded_amount_cents - coalesce((select sum(r.amount_cents) from public.payment_refunds r
    where r.gateway_transaction_id = g.id and r.status in ('pending', 'processing', 'sent')), 0)
  from public.gateway_transactions g where g.id = p_tx
$$;
revoke all on function private.refund_available_cents(uuid) from public, anon, authenticated;

-- O que está na fila devolve a transação inteira?
create or replace function private.refund_is_total(p_tx uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select not exists (select 1 from public.payment_refunds r where r.gateway_transaction_id = p_tx and r.status in ('pending', 'processing', 'sent'))
    or private.refund_available_cents(p_tx) = 0
$$;
revoke all on function private.refund_is_total(uuid) from public, anon, authenticated;

-- O provedor confirmou. Estorno feito direto no painel do Asaas também passa por aqui.
create or replace function private.refund_settle(p_tx uuid, p_total boolean)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.payment_refunds set status = 'done', done_at = now(), error_message = null, updated_at = now()
    where gateway_transaction_id = p_tx and status in ('pending', 'processing', 'sent')
      and (p_total or status in ('processing', 'sent'));
  update public.gateway_transactions g set updated_at = now(),
      refunded_amount_cents = case when p_total then g.amount_cents else least(g.amount_cents, coalesce((select sum(r.amount_cents)
        from public.payment_refunds r where r.gateway_transaction_id = g.id and r.status = 'done'), 0)) end
    where g.id = p_tx;
end $$;
revoke all on function private.refund_settle(uuid, boolean) from public, anon, authenticated;

drop function private.enqueue_refund(uuid, text);
create function private.enqueue_refund(
  p_transaction_id uuid, p_reason text, p_amount_cents bigint default null, p_requested_by uuid default null, p_approval_id uuid default null
) returns uuid language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_tx public.gateway_transactions; v_available bigint; v_cents bigint; v_total boolean; v_id uuid; v_direct boolean;
begin
  select * into v_tx from public.gateway_transactions where id = p_transaction_id for update;
  if v_tx.id is null then raise exception 'Payment transaction not found' using errcode = 'P0002'; end if;
  v_available := private.refund_available_cents(v_tx.id);
  v_cents := coalesce(p_amount_cents, v_available);
  -- Repetir um estorno inteiro (pagamento tardio reprocessado) não faz nada.
  if p_amount_cents is null and v_cents <= 0 then return null; end if;
  if v_cents <= 0 or v_cents > v_available then
    raise exception 'Valor acima do que ainda pode ser estornado' using errcode = '23514'; end if;
  v_total := v_cents = v_available;
  -- Sem provedor no caminho (simulado ou presencial), não há o que esperar. Devolver o dinheiro da gaveta é a O8.
  v_direct := v_tx.provider in ('simulated', 'manual');

  insert into public.payment_refunds(restaurant_id, gateway_transaction_id, amount_cents, reason, status, sent_at, done_at, requested_by, approval_id)
    values (v_tx.restaurant_id, v_tx.id, v_cents, coalesce(nullif(btrim(p_reason), ''), 'Estorno'),
      case when v_direct then 'done' else 'pending' end, case when v_direct then now() end, case when v_direct then now() end,
      p_requested_by, p_approval_id)
    returning id into v_id;
  if v_direct then
    update public.gateway_transactions set refunded_amount_cents = refunded_amount_cents + v_cents,
        status = case when v_total then 'refunded' else status end,
        refund_requested_at = coalesce(refund_requested_at, now()), updated_at = now(),
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('refund_reason', p_reason)
      where id = v_tx.id;
    if v_total then
      update public.bill_shares set status = 'refunded', updated_at = now() where payment_id = v_tx.id and status = 'paid';
    end if;
  else
    update public.gateway_transactions set status = case when v_total then 'refund_pending' else status end,
        refund_requested_at = coalesce(refund_requested_at, now()), updated_at = now(),
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('refund_reason', p_reason)
      where id = v_tx.id;
  end if;
  perform private.log_system_audit(v_tx.restaurant_id, 'payment.refund_enqueued', 'payment', v_tx.id,
    p_reason, jsonb_build_object('status', v_tx.status), jsonb_build_object('refundId', v_id, 'amountCents', v_cents, 'total', v_total));
  return v_id;
end $$;
revoke all on function private.enqueue_refund(uuid, text, bigint, uuid, uuid) from public, anon, authenticated;

-- A requisição do pg_net só sai depois do commit: rollback não manda estorno.
create or replace function private.refund_post(p_refund_id uuid)
returns boolean language plpgsql security definer set search_path = public, private, vault, net, pg_temp as $$
declare v_url text; v_key text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url' limit 1;
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'service_role_key' limit 1;
  if v_url is null or v_key is null then return false; end if;
  perform net.http_post(url := rtrim(v_url, '/') || '/functions/v1/payments-refund',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
    body := jsonb_build_object('refundId', p_refund_id));
  return true;
exception when others then
  raise warning 'Disparo de estorno falhou para %: %', p_refund_id, sqlerrm;
  return false;
end $$;
revoke all on function private.refund_post(uuid) from public, anon, authenticated;

create or replace function private.refund_dispatch_on_insert()
returns trigger language plpgsql security definer set search_path = public, private, pg_temp as $$
begin
  perform private.refund_post(new.id);
  return new;
end $$;
revoke all on function private.refund_dispatch_on_insert() from public, anon, authenticated;
create trigger payment_refunds_dispatch after insert on public.payment_refunds
  for each row when (new.status = 'pending') execute function private.refund_dispatch_on_insert();

-- No tick: reenvia o que venceu, retoma o que travou e confere o que o webhook não confirmou. Também o cancelamento fiscal.
create or replace function private.refund_sweep()
returns integer language plpgsql security definer set search_path = public, private, pg_temp as $$
declare p record; v_id uuid; v_n integer := 0;
begin
  select * into p from private.refund_retry_policy();
  for v_id in
    select id from public.payment_refunds
    where (status = 'pending' and next_attempt_at <= now())
       or (status = 'processing' and claimed_at < now() - p.stale_after)
       or (status = 'sent' and next_attempt_at <= now())
    order by next_attempt_at limit 50
  loop
    if private.refund_post(v_id) then v_n := v_n + 1; end if;
  end loop;
  for v_id in
    select id from public.fiscal_documents where (cancel_status = 'requested' and cancel_next_attempt_at <= now())
       or (cancel_status = 'processing' and cancel_claimed_at < now() - p.stale_after) limit 50
  loop
    perform private.fiscal_post_cancel(v_id);
  end loop;
  return v_n;
end $$;
revoke all on function private.refund_sweep() from public, anon, authenticated;

create or replace function private.engine_tick()
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_id uuid; v_result jsonb := '{}'::jsonb; v_n integer;
begin
  if not pg_try_advisory_xact_lock(hashtextextended('noowe.engine_tick', 0)) then
    return jsonb_build_object('skipped', true);
  end if;
  begin
    v_result := v_result || jsonb_build_object('reservations', private.reservation_expire_sweep(null, null));
  exception when others then raise warning 'engine_tick reservas: %', sqlerrm; end;
  begin
    v_result := v_result || jsonb_build_object('queue', private.queue_expire_sweep(null, null));
  exception when others then raise warning 'engine_tick fila: %', sqlerrm; end;
  v_n := 0;
  for v_id in select distinct restaurant_id from public.restaurant_model_policies where service_model = 'quick_service' loop
    begin
      v_n := v_n + private.quick_service_sweep(v_id);
    exception when others then raise warning 'engine_tick quick %: %', v_id, sqlerrm; end;
  end loop;
  v_result := v_result || jsonb_build_object('quick', v_n);
  v_n := 0;
  for v_id in select distinct restaurant_id from public.table_sessions where status = 'active' loop
    begin
      v_n := v_n + private.session_idle_sweep(v_id);
    exception when others then raise warning 'engine_tick comanda parada %: %', v_id, sqlerrm; end;
  end loop;
  v_result := v_result || jsonb_build_object('idle', v_n);
  begin
    v_result := v_result || jsonb_build_object('refunds', private.refund_sweep());
  exception when others then raise warning 'engine_tick estornos: %', sqlerrm; end;
  begin
    v_result := v_result || jsonb_build_object('billHolds', private.bill_hold_sweep());
  exception when others then raise warning 'engine_tick reservas de conta: %', sqlerrm; end;
  begin
    v_result := v_result || jsonb_build_object('timeRules', private.engine_time_rules());
  exception when others then raise warning 'engine_tick regras: %', sqlerrm; end;
  begin
    v_result := v_result || jsonb_build_object('pushRetries', private.retry_undelivered_pushes());
  exception when others then raise warning 'engine_tick push: %', sqlerrm; end;
  return v_result;
end $$;

-- Reserva o estorno para o worker. `verify` confere no provedor um envio que o webhook não confirmou.
create or replace function public.service_refund_claim(p_refund_id uuid)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare r public.payment_refunds; g public.gateway_transactions; p record; v_action text; v_total boolean;
begin
  select * into p from private.refund_retry_policy();
  select * into r from public.payment_refunds where id = p_refund_id for update;
  if r.id is null then return jsonb_build_object('claimed', false); end if;
  if r.status = 'sent' and r.next_attempt_at <= now() then v_action := 'verify';
  elsif (r.status = 'pending' and r.next_attempt_at <= now()) or (r.status = 'processing' and r.claimed_at < now() - p.stale_after) then v_action := 'send';
  else return jsonb_build_object('claimed', false); end if;
  select * into g from public.gateway_transactions where id = r.gateway_transaction_id;
  v_total := r.amount_cents >= g.amount_cents - g.refunded_amount_cents;
  if v_action = 'send' then
    update public.payment_refunds set status = 'processing', claimed_at = now(), attempts = attempts + 1, updated_at = now()
      where id = r.id returning * into r;
  else
    update public.payment_refunds set next_attempt_at = now() + p.verify_after, updated_at = now() where id = r.id;
  end if;
  return jsonb_build_object('claimed', true, 'refundId', r.id, 'action', v_action, 'attempt', r.attempts, 'total', v_total,
    'paymentId', g.id, 'paymentAccountId', g.payment_account_id, 'providerRef', g.provider_ref,
    'amountCents', r.amount_cents, 'reason', r.reason);
end $$;
revoke all on function public.service_refund_claim(uuid) from public, anon, authenticated;
grant execute on function public.service_refund_claim(uuid) to service_role;

-- sent: o provedor aceitou, e o webhook confirma. transient: tenta de novo. failed: precisa de gente, e o dinheiro não saiu.
create or replace function public.service_refund_record(p_refund_id uuid, p_outcome text, p_error text default null)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare r public.payment_refunds; g public.gateway_transactions; p record; v_failed boolean;
begin
  if p_outcome not in ('sent', 'transient', 'failed') then
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
    'staff_refund_failed', r.id, null, jsonb_build_object('kind', 'staff_refund_failed', 'refund_id', r.id, 'payment_id', r.gateway_transaction_id));
  return jsonb_build_object('status', r.status);
end $$;
revoke all on function public.service_refund_record(uuid, text, text) from public, anon, authenticated;
grant execute on function public.service_refund_record(uuid, text, text) to service_role;

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
  if p_outcome = 'refunded' then perform private.refund_settle(v_tx.id, true); end if;
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

-- Cancelar pedido pago devolve pelo provedor. Antes marcava "estornado" sem devolver nada.
create or replace function private.release_quick_resources_on_cancel()
returns trigger language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_tx record; v_waiting boolean := false; v_any boolean := false;
begin
  if new.status::text = 'cancelled' and old.status::text <> 'cancelled' then
    new.fulfillment_status := 'cancelled';
    update public.pickup_slot_reservations set status = 'released' where order_id = new.id and status = 'reserved';
    if new.payment_status = 'confirmed' then
      for v_tx in select id, provider from public.gateway_transactions where order_id = new.id and status = 'completed' loop
        v_any := true;
        perform private.enqueue_refund(v_tx.id, coalesce(new.cancellation_reason, 'Pedido cancelado'));
        if v_tx.provider not in ('simulated', 'manual') then v_waiting := true; end if;
      end loop;
      new.payment_status := case when v_waiting then 'refund_pending' else 'refunded' end;
    end if;
  end if;
  return new;
end $$;

create or replace function public.restaurant_refund_unavailable_item(p_order_item_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_item public.order_items; v_order public.orders; v_cents bigint; v_remaining bigint; v_tx_id uuid;
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
  -- O valor do item volta pelo provedor. Simulado e pagamento presencial já saem resolvidos.
  select id into v_tx_id from public.gateway_transactions where order_id = v_order.id and status = 'completed' order by created_at desc limit 1;
  if v_tx_id is not null then perform private.enqueue_refund(v_tx_id, btrim(p_reason), v_cents, auth.uid()); end if;
  perform private.log_audit(v_order.restaurant_id, 'quick_order.partial_refund', 'order_item', v_item.id,
    btrim(p_reason),
    jsonb_build_object('refundedCents', v_order.refunded_cents),
    jsonb_build_object('refundedCents', v_order.refunded_cents + v_cents, 'itemRefundCents', v_cents,
      'orderId', v_order.id));
  perform public.restaurant_update_order_item_status(v_item.id, 'cancelled');
  return jsonb_build_object('orderId', v_order.id, 'itemId', v_item.id, 'refundedCents', v_cents,
    'totalRefundedCents', v_order.refunded_cents + v_cents);
end $$;

-- Pedido de estorno: passa por aprovação, e ninguém aprova o próprio. O Dono aplica direto (resposta 32).
create or replace function public.restaurant_request_refund(p_transaction_id uuid, p_reason text, p_amount_cents bigint default null)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare g public.gateway_transactions; v_cents bigint; v_owner boolean; a public.approvals; v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  select * into g from public.gateway_transactions where id = p_transaction_id;
  if g.id is null then raise exception 'Pagamento não encontrado' using errcode = 'P0002'; end if;
  perform private.require_restaurant_role(g.restaurant_id, array['owner','manager','waiter','maitre','cashier']::public.user_roles_role_enum[]);
  if v_reason is null then raise exception 'Motivo obrigatório' using errcode = '22023'; end if;
  if g.status <> 'completed' then raise exception 'Este pagamento não pode ser estornado agora' using errcode = 'P0001'; end if;
  v_cents := coalesce(p_amount_cents, private.refund_available_cents(g.id));
  if v_cents <= 0 or v_cents > private.refund_available_cents(g.id) then
    raise exception 'Valor acima do que ainda pode ser estornado' using errcode = '23514'; end if;
  if exists (select 1 from public.approvals x where x.gateway_transaction_id = g.id and x.status = 'pending') then
    raise exception 'Já há um pedido de estorno aguardando aprovação' using errcode = '23505'; end if;
  v_owner := private.has_restaurant_role(g.restaurant_id, array['owner']::public.user_roles_role_enum[]);
  insert into public.approvals(restaurant_id, type, item_name, requester_id, reason, amount, status, order_id, gateway_transaction_id,
      resolver_id, resolution_note, resolved_at, created_at, updated_at)
    values (g.restaurant_id, 'refund', 'Estorno de pagamento', auth.uid(), v_reason, v_cents::numeric / 100,
      case when v_owner then 'approved' else 'pending' end, g.order_id, g.id,
      case when v_owner then auth.uid() end, case when v_owner then 'Aplicado direto pelo Dono' end, case when v_owner then now() end, now(), now())
    returning * into a;
  if v_owner then
    perform private.apply_approval_effect(a);
    perform private.log_audit(g.restaurant_id, 'approval.approved', 'approval', a.id, v_reason,
      jsonb_build_object('type', 'refund', 'amountCents', v_cents), jsonb_build_object('status', 'approved', 'paymentId', g.id, 'direct', true));
  end if;
  return to_jsonb(a);
end $$;
revoke all on function public.restaurant_request_refund(uuid, text, bigint) from public, anon;
grant execute on function public.restaurant_request_refund(uuid, text, bigint) to authenticated;

create or replace function private.apply_approval_effect(p_approval public.approvals)
returns void language plpgsql security definer set search_path = public, private, pg_temp as $$
begin
  -- Estorno aprovado: entra na fila do provedor; nada volta ao cliente sem esta aprovação (ADR-004).
  if p_approval.type = 'refund' and p_approval.gateway_transaction_id is not null then
    perform private.enqueue_refund(p_approval.gateway_transaction_id, p_approval.reason, p_approval.amount_cents,
      p_approval.requester_id, p_approval.id);
    perform private.fiscal_after_refund(p_approval.gateway_transaction_id, p_approval.reason);
    return;
  end if;
  if p_approval.order_id is null then return; end if;
  if p_approval.type in ('cancellation', 'order_cancellation') then
    update public.orders
    set cancellation_reason = coalesce(nullif(btrim(coalesce(p_approval.reason, '')), ''), 'Cancelamento aprovado'),
        updated_at = now()
    where id = p_approval.order_id and restaurant_id = p_approval.restaurant_id;
    -- Aprovado, sai tudo: também o que já foi entregue, ou o pedido não ficaria cancelado.
    update public.order_items oi set status = 'cancelled', updated_at = now()
    from public.orders o
    where o.id = oi.order_id and o.id = p_approval.order_id
      and o.restaurant_id = p_approval.restaurant_id and oi.status::text <> 'cancelled';
  elsif p_approval.type = 'discount' then
    -- discount_cents é o que a conta usa: sem ele, o desconto aprovado não chegava ao que o cliente paga.
    update public.orders
    set discount_cents = greatest(coalesce(discount_cents, 0), p_approval.amount_cents),
        total_cents = greatest(total_cents - greatest(p_approval.amount_cents - coalesce(discount_cents, 0), 0), 0),
        discount_amount = greatest(coalesce(discount_amount, 0), p_approval.amount),
        total_amount = greatest(
          coalesce(subtotal, total_amount, 0) + coalesce(tax_amount, 0) + coalesce(tip_amount, 0)
            - greatest(coalesce(discount_amount, 0), p_approval.amount), 0),
        updated_at = now()
    where id = p_approval.order_id and restaurant_id = p_approval.restaurant_id;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Cancelamento fiscal
-- ---------------------------------------------------------------------------
create or replace function private.fiscal_post_cancel(p_document_id uuid)
returns boolean language plpgsql security definer set search_path = public, private, vault, net, pg_temp as $$
declare v_url text; v_key text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url' limit 1;
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'service_role_key' limit 1;
  if v_url is null or v_key is null then return false; end if;
  perform net.http_post(url := rtrim(v_url, '/') || '/functions/v1/fiscal-emit',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
    body := jsonb_build_object('documentId', p_document_id, 'action', 'cancel'));
  return true;
exception when others then
  raise warning 'Disparo de cancelamento fiscal falhou para %: %', p_document_id, sqlerrm;
  return false;
end $$;
revoke all on function private.fiscal_post_cancel(uuid) from public, anon, authenticated;

-- Justificativa da SEFAZ: de 15 a 255 caracteres.
create or replace function private.fiscal_cancel_justification(p_reason text)
returns text language sql immutable as $$
  select left('Estorno ao cliente: ' || coalesce(nullif(btrim(p_reason), ''), 'pagamento devolvido'), 255)
$$;
revoke all on function private.fiscal_cancel_justification(text) from public, anon, authenticated;

-- Estorno de toda a venda cancela a nota. Estorno de parte dela não: a nota continua valendo, e gerente e Dono revisam.
create or replace function private.fiscal_after_refund(p_tx uuid, p_reason text)
returns void language plpgsql security definer set search_path = public, private, pg_temp as $$
declare g public.gateway_transactions; d public.fiscal_documents; v_left boolean;
begin
  select * into g from public.gateway_transactions where id = p_tx;
  select * into d from public.fiscal_documents f
    where f.status = 'authorized' and f.cancel_status is null
      and ((g.order_id is not null and f.order_id = g.order_id) or (g.table_session_id is not null and f.table_session_id = g.table_session_id))
    limit 1;
  if d.id is null then return; end if;
  select exists (select 1 from public.gateway_transactions x
      where ((g.order_id is not null and x.order_id = g.order_id) or (g.table_session_id is not null and x.table_session_id = g.table_session_id))
        and x.status = 'completed' and private.refund_available_cents(x.id) > 0) into v_left;
  if v_left then
    perform private.log_system_audit(d.restaurant_id, 'fiscal.refund_review', 'fiscal_document', d.id, p_reason, null, jsonb_build_object('paymentId', p_tx));
    perform private.notify_restaurant_staff(d.restaurant_id, array['owner','manager']::public.user_roles_role_enum[],
      'Revisar nota fiscal', 'Parte da venda foi estornada, e a nota continua valendo pelo total.', 'staff_fiscal_review', d.id, null,
      jsonb_build_object('kind', 'staff_fiscal_review', 'document_id', d.id));
    return;
  end if;
  update public.fiscal_documents set cancel_status = 'requested', cancel_reason = private.fiscal_cancel_justification(p_reason),
      cancel_next_attempt_at = now(), updated_at = now() where id = d.id;
  perform private.log_system_audit(d.restaurant_id, 'fiscal.cancel_requested', 'fiscal_document', d.id, p_reason, null, jsonb_build_object('paymentId', p_tx));
  perform private.fiscal_post_cancel(d.id);
end $$;
revoke all on function private.fiscal_after_refund(uuid, text) from public, anon, authenticated;

create or replace function public.service_fiscal_cancel_claim(p_document_id uuid)
returns jsonb language plpgsql security definer set search_path = public, private, vault, pg_temp as $$
declare d public.fiscal_documents; c public.fiscal_configs; v_token text; p record;
begin
  select * into p from private.refund_retry_policy();
  update public.fiscal_documents set cancel_status = 'processing', cancel_claimed_at = now(), cancel_attempts = cancel_attempts + 1, updated_at = now()
    where id = p_document_id and ((cancel_status = 'requested' and cancel_next_attempt_at <= now())
      or (cancel_status = 'processing' and cancel_claimed_at < now() - p.stale_after))
    returning * into d;
  if d.id is null then return jsonb_build_object('claimed', false); end if;
  select * into c from public.fiscal_configs where restaurant_id = d.restaurant_id and is_active;
  if c.id is not null then select decrypted_secret into v_token from vault.decrypted_secrets where id = c.focus_token_secret_id; end if;
  if v_token is null then
    perform public.service_fiscal_cancel_record(d.id, 'failed', 'Restaurante sem configuração fiscal ativa');
    return jsonb_build_object('claimed', false, 'blocked', 'fiscal_config_missing');
  end if;
  return jsonb_build_object('claimed', true, 'documentId', d.id, 'ref', d.external_ref, 'environment', c.environment, 'token', v_token, 'justification', d.cancel_reason);
end $$;
revoke all on function public.service_fiscal_cancel_claim(uuid) from public, anon, authenticated;
grant execute on function public.service_fiscal_cancel_claim(uuid) to service_role;

create or replace function public.service_fiscal_cancel_record(p_document_id uuid, p_outcome text, p_error text default null)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare d public.fiscal_documents; p record;
begin
  if p_outcome not in ('cancelled', 'transient', 'failed') then
    raise exception 'Resultado inválido: %', p_outcome using errcode = '22023'; end if;
  select * into p from private.refund_retry_policy();
  select * into d from public.fiscal_documents where id = p_document_id for update;
  if d.id is null then raise exception 'Documento fiscal não encontrado' using errcode = 'P0002'; end if;
  if d.cancel_status <> 'processing' then return jsonb_build_object('cancelStatus', d.cancel_status, 'ignored', true); end if;
  if p_outcome = 'cancelled' then
    update public.fiscal_documents set cancel_status = 'cancelled', cancelled_at = now(), cancel_error = null, updated_at = now() where id = d.id returning * into d;
    perform private.log_system_audit(d.restaurant_id, 'fiscal.cancelled', 'fiscal_document', d.id, d.cancel_reason, null, null);
  elsif p_outcome = 'transient' and d.cancel_attempts < p.max_attempts then
    update public.fiscal_documents set cancel_status = 'requested', cancel_error = p_error, updated_at = now(),
        cancel_next_attempt_at = now() + least(p.base_delay * power(2, greatest(d.cancel_attempts - 1, 0)), p.max_delay)
      where id = d.id returning * into d;
  else
    -- A SEFAZ tem prazo para cancelar: passou dele, é com o contador.
    update public.fiscal_documents set cancel_status = 'failed', cancel_error = p_error, updated_at = now() where id = d.id returning * into d;
    perform private.log_system_audit(d.restaurant_id, 'fiscal.cancel_failed', 'fiscal_document', d.id, p_error, null, null);
    perform private.notify_restaurant_staff(d.restaurant_id, array['owner','manager']::public.user_roles_role_enum[],
      'Nota fiscal não cancelada', coalesce(p_error, 'A SEFAZ não aceitou o cancelamento.') || ' Fale com o contador.', 'staff_fiscal_review', d.id, null,
      jsonb_build_object('kind', 'staff_fiscal_cancel_failed', 'document_id', d.id));
  end if;
  return jsonb_build_object('cancelStatus', d.cancel_status);
end $$;
revoke all on function public.service_fiscal_cancel_record(uuid, text, text) from public, anon, authenticated;
grant execute on function public.service_fiscal_cancel_record(uuid, text, text) to service_role;
