-- Revisão de N4, M2 e M3. Pedido pago duas vezes volta ao cliente; estorno não se repete às cegas nem é dado como feito por aviso de
-- outro estorno; a nota só é cancelada depois de o dinheiro voltar, em todos os caminhos; "mesmo dia" vem do pedido de estorno, e não
-- da hora do aviso; e o extrato desconta a conveniência.

alter table public.payment_refunds add column order_item_id uuid references public.order_items(id) on delete set null,
  add column stuck_alerted_at timestamptz;
alter table private.noowe_pay_transaction_fees add column convenience_cents bigint not null default 0 check (convenience_cents >= 0);

create or replace function private.refund_stuck_after() returns interval language sql immutable as $$ select interval '3 days' $$;
revoke all on function private.refund_stuck_after() from public, anon, authenticated;

-- Um aviso de estorno parcial conclui o estorno mais antigo em andamento, e só ele: nunca há dois (service_refund_claim).
create or replace function private.refund_settle(p_tx uuid, p_total boolean)
returns void language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_reason text;
begin
  if p_total then
    update public.payment_refunds set status = 'done', done_at = now(), error_message = null, updated_at = now()
      where gateway_transaction_id = p_tx and status in ('pending', 'processing', 'sent');
  else
    update public.payment_refunds set status = 'done', done_at = now(), error_message = null, updated_at = now()
      where id = (select r.id from public.payment_refunds r where r.gateway_transaction_id = p_tx and r.status in ('processing', 'sent') order by r.sent_at nulls last, r.created_at limit 1);
  end if;
  update public.gateway_transactions g set updated_at = now(),
      refunded_amount_cents = case when p_total then g.amount_cents else least(g.amount_cents, coalesce((select sum(r.amount_cents)
        from public.payment_refunds r where r.gateway_transaction_id = g.id and r.status = 'done'), 0)) end
    where g.id = p_tx;
  select r.reason into v_reason from public.payment_refunds r where r.gateway_transaction_id = p_tx and r.status = 'done' order by r.done_at desc limit 1;
  -- A nota só acompanha depois de o dinheiro voltar: recusado, a venda segue valendo com a nota dela.
  perform private.fiscal_after_refund(p_tx, coalesce(v_reason, 'Estorno'));
end $$;
revoke all on function private.refund_settle(uuid, boolean) from public, anon, authenticated;

-- O provedor aceitou e depois negou.
create or replace function public.service_refund_denied(p_payment_id uuid)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_id uuid;
begin
  select r.id into v_id from public.payment_refunds r where r.gateway_transaction_id = p_payment_id and r.status = 'sent' order by r.sent_at desc limit 1 for update;
  if v_id is null then return jsonb_build_object('ignored', true); end if;
  update public.payment_refunds set status = 'processing' where id = v_id;
  return public.service_refund_record(v_id, 'failed', 'O provedor negou o estorno');
end $$;
revoke all on function public.service_refund_denied(uuid) from public, anon, authenticated;
grant execute on function public.service_refund_denied(uuid) to service_role;

-- A nota acompanha o estorno. Antes de emitida, não há o que cancelar: a venda que voltou inteira nem sai.
create or replace function private.fiscal_after_refund(p_tx uuid, p_reason text)
returns void language plpgsql security definer set search_path = public, private, pg_temp as $$
declare g public.gateway_transactions; d public.fiscal_documents; v_left boolean;
begin
  select * into g from public.gateway_transactions where id = p_tx;
  select * into d from public.fiscal_documents f
    where f.cancel_status is null and f.status in ('authorized', 'pending', 'processing', 'blocked')
      and ((g.order_id is not null and f.order_id = g.order_id) or (g.table_session_id is not null and f.table_session_id = g.table_session_id))
    limit 1;
  if d.id is null then return; end if;
  select exists (select 1 from public.gateway_transactions x
      where ((g.order_id is not null and x.order_id = g.order_id) or (g.table_session_id is not null and x.table_session_id = g.table_session_id))
        and x.status = 'completed' and private.refund_available_cents(x.id) > 0) into v_left;
  if v_left then
    perform private.log_system_audit(d.restaurant_id, 'fiscal.refund_review', 'fiscal_document', d.id, p_reason, null, jsonb_build_object('paymentId', p_tx));
    perform private.notify_restaurant_staff(d.restaurant_id, array['owner','manager']::public.user_roles_role_enum[],
      'Revisar nota fiscal', 'Parte da venda foi estornada, e a nota continua valendo pelo total.', 'staff_bill_refund_review', d.id, null,
      jsonb_build_object('kind', 'staff_fiscal_review', 'document_id', d.id));
    return;
  end if;
  if d.status in ('pending', 'blocked') then
    update public.fiscal_documents set status = 'failed', error_message = 'Venda estornada antes da emissão', updated_at = now() where id = d.id;
    perform private.log_system_audit(d.restaurant_id, 'fiscal.discarded_after_refund', 'fiscal_document', d.id, p_reason, null, jsonb_build_object('paymentId', p_tx));
    return;
  end if;
  update public.fiscal_documents set cancel_status = 'requested', cancel_reason = private.fiscal_cancel_justification(p_reason),
      cancel_next_attempt_at = now(), updated_at = now() where id = d.id;
  perform private.log_system_audit(d.restaurant_id, 'fiscal.cancel_requested', 'fiscal_document', d.id, p_reason, null, jsonb_build_object('paymentId', p_tx));
  -- Em emissão, o cancelamento espera a autorização: a fila confere de novo.
  if d.status = 'authorized' then perform private.fiscal_post_cancel(d.id); end if;
end $$;
revoke all on function private.fiscal_after_refund(uuid, text) from public, anon, authenticated;

-- "Mesmo dia" é o dia operacional do pagamento, e o que conta é quando o estorno foi pedido. Caixa esquecido aberto não estende o dia.
create or replace function private.same_operational_day(p_restaurant uuid, p_paid timestamptz, p_requested timestamptz)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select p_requested >= d.started_at and p_requested < coalesce(d.closed_at, d.started_at + interval '24 hours')
      from public.operational_days d where d.restaurant_id = p_restaurant and d.started_at <= p_paid order by d.started_at desc limit 1),
    (p_paid at time zone 'America/Sao_Paulo')::date = (p_requested at time zone 'America/Sao_Paulo')::date) $$;
revoke all on function private.same_operational_day(uuid, timestamptz, timestamptz) from public, anon, authenticated;

create or replace function private.noowe_pay_freeze_fee(p_tx public.gateway_transactions)
returns void language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_bps integer := private.noowe_pay_rate_bps(p_tx.restaurant_id, p_tx.payment_method);
begin
  if v_bps is null then raise exception 'Sem taxa NOOWE Pay definida para %', p_tx.payment_method using errcode = 'P0007'; end if;
  insert into private.noowe_pay_transaction_fees(gateway_transaction_id, restaurant_id, payment_method, rate_bps, amount_cents, fee_cents, convenience_cents)
    values (p_tx.id, p_tx.restaurant_id, p_tx.payment_method, v_bps, p_tx.amount_cents,
      -- A conveniência fica fora da base da taxa.
      private.noowe_fee_cents(p_tx.amount_cents - p_tx.convenience_cents, v_bps),
      -- Congelada aqui: assumida pelo Dono ou paga pelo cliente, vai inteira para a NOOWE.
      coalesce((select o.convenience_fee_cents from public.orders o where o.id = p_tx.order_id), 0))
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
  v_split := private.noowe_pay_split_cents(f.fee_cents, v_tariff) + f.convenience_cents;
  update private.noowe_pay_transaction_fees set tariff_cents = v_tariff, split_cents = v_split, updated_at = now() where gateway_transaction_id = p_payment_id;
  return jsonb_build_object('splitCents', v_split);
end $$;

-- A margem de pagamento não mistura a conveniência, que tem consulta própria.
create or replace view private.noowe_report_payment_margin with (security_invoker = true) as
  select g.id as payment_id, g.restaurant_id, coalesce(g.confirmed_at, g.created_at) as paid_at,
    g.payment_method, g.amount_cents, g.tip_cents, f.rate_bps, f.fee_cents, f.tariff_cents,
    coalesce(f.split_cents, g.platform_fee_cents, 0) - coalesce(f.convenience_cents, 0) as noowe_split_cents, f.fee_returned
  from public.gateway_transactions g
  left join private.noowe_pay_transaction_fees f on f.gateway_transaction_id = g.id
  where g.status in ('completed', 'refund_pending', 'refunded') and g.provider <> 'simulated';
revoke all on private.noowe_report_payment_margin from public, anon, authenticated, service_role;

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
  -- Um estorno de cada vez por pagamento: é o que permite saber a qual deles um aviso do provedor se refere.
  if v_action = 'send' and exists (select 1 from public.payment_refunds o where o.gateway_transaction_id = r.gateway_transaction_id and o.id <> r.id and o.status in ('processing', 'sent')) then
    return jsonb_build_object('claimed', false, 'waiting', true);
  end if;
  -- Aceito pelo provedor e sem confirmação há tempo demais: alguém precisa olhar.
  if v_action = 'verify' and r.stuck_alerted_at is null and r.sent_at < now() - private.refund_stuck_after() then
    update public.payment_refunds set stuck_alerted_at = now() where id = r.id;
    perform private.log_system_audit(r.restaurant_id, 'payment.refund_stuck', 'payment', r.gateway_transaction_id, 'Estorno sem confirmação do provedor', null, jsonb_build_object('refundId', r.id));
    perform private.notify_restaurant_staff(r.restaurant_id, array['owner','manager']::public.user_roles_role_enum[],
      'Estorno sem confirmação', 'O provedor aceitou um estorno de ' || to_char(r.amount_cents::numeric / 100, 'FM999G990D00') || ' e ainda não confirmou. Confira com o provedor.',
      'staff_bill_refund_review', r.id, null, jsonb_build_object('kind', 'staff_refund_stuck', 'refund_id', r.id, 'payment_id', r.gateway_transaction_id));
  end if;
  v_total := r.amount_cents >= g.amount_cents - g.refunded_amount_cents;
  if v_action = 'send' then
    update public.payment_refunds set status = 'processing', claimed_at = now(), attempts = attempts + 1, updated_at = now()
      where id = r.id returning * into r;
  else
    update public.payment_refunds set next_attempt_at = now() + p.verify_after, updated_at = now() where id = r.id;
  end if;
  return jsonb_build_object('claimed', true, 'refundId', r.id, 'action', v_action, 'attempt', r.attempts, 'total', v_total,
    'paymentId', g.id, 'paymentAccountId', g.payment_account_id, 'providerRef', g.provider_ref,
    'amountCents', r.amount_cents, 'reason', r.reason,
    'settledCents', coalesce((select sum(o.amount_cents) from public.payment_refunds o where o.gateway_transaction_id = r.gateway_transaction_id and o.status = 'done'), 0));
end $$;

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
  -- O item segue fora do pedido, mas o dinheiro não saiu: o valor volta a poder ser devolvido.
  if r.order_item_id is not null then
    update public.orders o set refunded_cents = greatest(o.refunded_cents - r.amount_cents, 0), updated_at = now()
      from public.gateway_transactions x where x.id = r.gateway_transaction_id and o.id = x.order_id;
  end if;
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

create or replace function private.enqueue_refund(
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
    -- Devolver dinheiro sai da gaveta.
    if v_tx.provider = 'manual' and v_tx.payment_method = 'cash' then
      perform private.cash_record(v_tx.restaurant_id, 'refund', v_cents, 'Estorno: ' || coalesce(p_reason, ''), v_tx.id, v_tx.order_id);
    end if;
    if v_total then
      update public.bill_shares set status = 'refunded', updated_at = now() where payment_id = v_tx.id and status = 'paid';
    end if;
    -- Sem provedor no caminho, o dinheiro já voltou: a nota acompanha agora.
    perform private.fiscal_after_refund(v_tx.id, coalesce(p_reason, 'Estorno'));
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

create or replace function private.apply_approval_effect(p_approval public.approvals)
returns void language plpgsql security definer set search_path = public, private, pg_temp as $$
begin
  -- Estorno aprovado: entra na fila do provedor; nada volta ao cliente sem esta aprovação (ADR-004).
  if p_approval.type = 'refund' and p_approval.gateway_transaction_id is not null then
    perform private.enqueue_refund(p_approval.gateway_transaction_id, p_approval.reason, p_approval.amount_cents,
      p_approval.requester_id, p_approval.id);
    return;
  end if;
  if p_approval.type = 'bill_reopen' and p_approval.table_session_id is not null then
    perform private.reopen_paid_session(p_approval.table_session_id, p_approval.reason);
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

create or replace function public.restaurant_refund_unavailable_item(p_order_item_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_item public.order_items; v_order public.orders; v_cents bigint; v_remaining bigint; v_tx_id uuid; v_refund uuid;
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
  -- Devolve o que foi pago pelo item: o desconto do pedido se distribui entre os itens.
  if coalesce(v_order.discount_cents, 0) > 0 then
    v_cents := div(v_cents * v_order.total_cents, v_order.total_cents + v_order.discount_cents)::bigint;
  end if;
  v_remaining := coalesce(v_order.total_cents, 0) - v_order.refunded_cents;
  v_cents := least(v_cents, v_remaining);
  if v_cents <= 0 then raise exception 'Nada a estornar neste item' using errcode = '23514'; end if;

  select id into v_tx_id from public.gateway_transactions where order_id = v_order.id and status = 'completed' order by created_at desc limit 1;
  if v_tx_id is null then raise exception 'Este pedido não tem pagamento a estornar' using errcode = '23514'; end if;
  update public.orders set refunded_cents = refunded_cents + v_cents, updated_at = now() where id = v_order.id;
  -- O valor do item volta pelo provedor. Simulado e pagamento presencial já saem resolvidos.
  v_refund := private.enqueue_refund(v_tx_id, btrim(p_reason), v_cents, auth.uid());
  update public.payment_refunds set order_item_id = v_item.id where id = v_refund;
  perform private.log_audit(v_order.restaurant_id, 'quick_order.partial_refund', 'order_item', v_item.id,
    btrim(p_reason),
    jsonb_build_object('refundedCents', v_order.refunded_cents),
    jsonb_build_object('refundedCents', v_order.refunded_cents + v_cents, 'itemRefundCents', v_cents,
      'orderId', v_order.id));
  perform public.restaurant_update_order_item_status(v_item.id, 'cancelled');
  return jsonb_build_object('orderId', v_order.id, 'itemId', v_item.id, 'refundedCents', v_cents,
    'totalRefundedCents', v_order.refunded_cents + v_cents);
end $$;

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
    select id from public.fiscal_documents where status = 'authorized' and (cancel_status = 'requested' and cancel_next_attempt_at <= now())
       or (cancel_status = 'processing' and cancel_claimed_at < now() - p.stale_after) limit 50
  loop
    perform private.fiscal_post_cancel(v_id);
  end loop;
  return v_n;
end $$;

create or replace function public.service_fiscal_cancel_claim(p_document_id uuid)
returns jsonb language plpgsql security definer set search_path = public, private, vault, pg_temp as $$
declare d public.fiscal_documents; c public.fiscal_configs; v_token text; p record;
begin
  select * into p from private.refund_retry_policy();
  update public.fiscal_documents set cancel_status = 'processing', cancel_claimed_at = now(), cancel_attempts = cancel_attempts + 1, updated_at = now()
    where id = p_document_id and status = 'authorized' and ((cancel_status = 'requested' and cancel_next_attempt_at <= now())
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

create or replace function public.restaurant_get_payment_statement(p_restaurant_id uuid, p_from timestamptz default null, p_to timestamptz default null, p_limit integer default 100)
returns jsonb language plpgsql stable security definer set search_path = public, private, pg_temp as $$
declare v_from timestamptz := coalesce(p_from, now() - interval '30 days'); v_to timestamptz := coalesce(p_to, now() + interval '1 minute');
begin
  perform private.require_restaurant_role(p_restaurant_id, array['owner']::public.user_roles_role_enum[]);
  return (with rows_ as (
      select g.id, coalesce(g.confirmed_at, g.created_at) as at, g.payment_method, g.provider, g.amount_cents, g.refunded_amount_cents, g.status,
        coalesce(f.fee_cents, 0) as fee_cents, coalesce(f.convenience_cents, 0) as convenience_cents, f.fee_returned, f.chargeback_at
      from public.gateway_transactions g
      left join private.noowe_pay_transaction_fees f on f.gateway_transaction_id = g.id
      where g.restaurant_id = p_restaurant_id and g.provider <> 'simulated' and g.status in ('completed', 'refund_pending', 'refunded')
        and coalesce(g.confirmed_at, g.created_at) >= v_from and coalesce(g.confirmed_at, g.created_at) < v_to),
    limited as (select * from rows_ order by at desc limit greatest(p_limit, 1))
    select jsonb_build_object(
      'paidCents', coalesce((select sum(amount_cents) from rows_), 0),
      'feeCents', coalesce((select sum(case when fee_returned then 0 else fee_cents end) from rows_), 0),
      'refundedCents', coalesce((select sum(refunded_amount_cents) from rows_), 0),
      'netCents', coalesce((select sum(amount_cents - refunded_amount_cents - convenience_cents - case when fee_returned then 0 else fee_cents end) from rows_), 0),
      'payments', coalesce((select jsonb_agg(jsonb_build_object('paymentId', id, 'paidAt', at, 'method', payment_method, 'external', provider = 'manual',
          'paidCents', amount_cents, 'feeCents', case when fee_returned then 0 else fee_cents end,
          'netCents', amount_cents - refunded_amount_cents - convenience_cents - case when fee_returned then 0 else fee_cents end,
          'refundedCents', refunded_amount_cents, 'status', status,
          'feeDestination', case when status = 'refunded' or refunded_amount_cents > 0 or chargeback_at is not null
            then case when fee_returned then 'returned' else 'kept' end end) order by at desc) from limited), '[]'::jsonb)));
end $$;

create or replace function private.refund_fee_policy(p_tx uuid)
returns void language plpgsql security definer set search_path = public, private, pg_temp as $$
declare f private.noowe_pay_transaction_fees; g public.gateway_transactions; v_same_day boolean;
begin
  select * into f from private.noowe_pay_transaction_fees where gateway_transaction_id = p_tx;
  if f.gateway_transaction_id is null or f.fee_returned is not null then return; end if;
  select * into g from public.gateway_transactions where id = p_tx;
  v_same_day := private.same_operational_day(g.restaurant_id, coalesce(g.confirmed_at, g.created_at), coalesce(g.refund_requested_at, now()));
  if v_same_day then
    -- A NOOWE assume a tarifa: o que valia para a diferença é trocado pelo crédito da tarifa inteira.
    update private.noowe_pay_compensations set status = 'voided' where gateway_transaction_id = p_tx and status = 'open';
    if coalesce(f.tariff_cents, 0) > 0 then
      insert into private.noowe_pay_compensations(restaurant_id, gateway_transaction_id, kind, amount_cents)
        values (f.restaurant_id, p_tx, 'tariff_on_refund', f.tariff_cents)
        on conflict (gateway_transaction_id, kind) do nothing;
    end if;
  elsif private.noowe_pay_split_cents(f.fee_cents, coalesce(f.tariff_cents, f.fee_cents)) > 0 then
    -- Só a parte da taxa: a conveniência foi devolvida ao cliente.
    insert into private.noowe_pay_compensations(restaurant_id, gateway_transaction_id, kind, amount_cents)
      values (f.restaurant_id, p_tx, 'fee_kept_on_refund', private.noowe_pay_split_cents(f.fee_cents, coalesce(f.tariff_cents, f.fee_cents)))
      on conflict (gateway_transaction_id, kind) do nothing;
  end if;
  update private.noowe_pay_transaction_fees set fee_returned = v_same_day, updated_at = now() where gateway_transaction_id = p_tx;
end $$;
