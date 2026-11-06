-- Estorno (respostas 63 e 64 de 05/11/2026).
--  64: estorno total no mesmo dia operacional devolve o split da NOOWE (splitRefunds) e lança "Ajuste de estorno" com a tarifa do
--      Asaas. Parcial ou depois do dia: sem splitRefunds e sem crédito, e a taxa fica com a NOOWE. Só vale estorno DONE e split com
--      done = true; o que o Asaas não devolveu do split também volta como ajuste, para o restaurante recuperar a taxa inteira.
--      Pix sem saldo: "Aguardando saldo", Gerente e Dono avisados, e nova tentativa automática.
--      Cartão: o cliente é avisado de que pode levar alguns dias úteis para aparecer na fatura.
--  63: estorno total dentro do prazo de cancelamento da SEFAZ cancela a NFC-e. Parcial ou fora do prazo: a nota continua,
--      Gerente e Dono são avisados, e o estorno entra no relatório fiscal do restaurante.

-- 1. Parâmetros.
alter table private.noowe_billing_settings
  add column refund_tariff_returned_bps integer not null default 0 check (refund_tariff_returned_bps between 0 and 10000),
  add column refund_balance_retry_minutes integer not null default 60 check (refund_balance_retry_minutes > 0),
  add column card_refund_notice_business_days integer not null default 10 check (card_refund_notice_business_days > 0),
  add column nfce_cancel_window_minutes integer not null default 30 check (nfce_cancel_window_minutes > 0);

-- 2. Estado novo do estorno e o quanto do split o Asaas confirmou.
alter table public.payment_refunds drop constraint payment_refunds_status_check;
alter table public.payment_refunds add constraint payment_refunds_status_check
  check (status in ('pending', 'processing', 'sent', 'awaiting_balance', 'done', 'failed'));
alter table public.payment_refunds add column balance_alerted_at timestamptz;
alter table private.noowe_pay_transaction_fees add column split_returned_cents bigint check (split_returned_cents >= 0);

-- Nota que segue valendo depois de um estorno: vai para o relatório fiscal do restaurante.
alter table public.fiscal_documents
  add column refund_review_at timestamptz,
  add column refund_review_cents bigint not null default 0 check (refund_review_cents >= 0),
  add column refund_review_reason text;

-- 3. O estorno total do mesmo dia devolve o split; o pedido ao provedor leva o valor.
create or replace function private.refund_split_to_return(p_tx uuid, p_total boolean)
returns bigint language plpgsql stable security definer set search_path = public, private, pg_temp as $$
declare g public.gateway_transactions; f private.noowe_pay_transaction_fees;
begin
  if not p_total then return 0; end if;
  select * into g from public.gateway_transactions where id = p_tx;
  select * into f from private.noowe_pay_transaction_fees where gateway_transaction_id = p_tx;
  if f.gateway_transaction_id is null or coalesce(f.split_cents, 0) <= 0 then return 0; end if;
  if not private.same_operational_day(g.restaurant_id, coalesce(g.confirmed_at, g.created_at), coalesce(g.refund_requested_at, now())) then return 0; end if;
  return f.split_cents;
end $$;
revoke all on function private.refund_split_to_return(uuid, boolean) from public, anon, authenticated, service_role;

create or replace function public.service_refund_claim(p_refund_id uuid)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare r public.payment_refunds; g public.gateway_transactions; p record; v_action text; v_total boolean;
begin
  select * into p from private.refund_retry_policy();
  select * into r from public.payment_refunds where id = p_refund_id for update;
  if r.id is null then return jsonb_build_object('claimed', false); end if;
  if r.status = 'sent' and r.next_attempt_at <= now() then v_action := 'verify';
  elsif (r.status in ('pending', 'awaiting_balance') and r.next_attempt_at <= now()) or (r.status = 'processing' and r.claimed_at < now() - p.stale_after) then v_action := 'send';
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
    'amountCents', r.amount_cents, 'reason', r.reason, 'provider', g.provider,
    'returnSplitCents', private.refund_split_to_return(g.id, v_total),
    'settledCents', coalesce((select sum(o.amount_cents) from public.payment_refunds o where o.gateway_transaction_id = r.gateway_transaction_id and o.status = 'done'), 0));
end $$;

-- 4. Resultado: "no_balance" é o Pix sem saldo do restaurante. Não é falha: espera e tenta de novo, sem gastar tentativa.
create or replace function public.service_refund_record(p_refund_id uuid, p_outcome text, p_error text default null)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare r public.payment_refunds; g public.gateway_transactions; p record; v_failed boolean; v_wait integer;
begin
  if p_outcome not in ('sent', 'transient', 'failed', 'deferred', 'no_balance') then
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
  if p_outcome = 'no_balance' then
    select refund_balance_retry_minutes into v_wait from private.noowe_billing_settings;
    update public.payment_refunds set status = 'awaiting_balance', attempts = greatest(attempts - 1, 0), error_message = p_error,
        next_attempt_at = now() + make_interval(mins => v_wait), updated_at = now()
      where id = r.id returning * into r;
    if r.balance_alerted_at is null then
      update public.payment_refunds set balance_alerted_at = now() where id = r.id;
      perform private.log_system_audit(r.restaurant_id, 'payment.refund_awaiting_balance', 'payment', r.gateway_transaction_id, coalesce(p_error, 'Saldo insuficiente'),
        null, jsonb_build_object('refundId', r.id, 'amountCents', r.amount_cents));
      perform private.notify_restaurant_staff(r.restaurant_id, array['owner','manager']::public.user_roles_role_enum[],
        'Estorno aguardando saldo', 'Não há saldo na conta para devolver ' || to_char(r.amount_cents::numeric / 100, 'FM999G990D00') || ' por Pix. O app tenta de novo sozinho.',
        'staff_bill_refund_review', r.id, null, jsonb_build_object('kind', 'staff_refund_awaiting_balance', 'refund_id', r.id, 'payment_id', r.gateway_transaction_id));
    end if;
    return jsonb_build_object('status', r.status, 'awaitingBalance', true);
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

-- O provedor informou quanto do split voltou à carteira da NOOWE (só split com done = true).
create or replace function public.service_refund_split_returned(p_payment_id uuid, p_cents bigint)
returns void language sql security definer set search_path = private, pg_temp as $$
  update private.noowe_pay_transaction_fees set split_returned_cents = greatest(coalesce(p_cents, 0), 0), updated_at = now()
  where gateway_transaction_id = p_payment_id
$$;
revoke all on function public.service_refund_split_returned(uuid, bigint) from public, anon, authenticated;
grant execute on function public.service_refund_split_returned(uuid, bigint) to service_role;

-- 5. Taxa no estorno total. O split que saiu da carteira da NOOWE (devolvido com done = true, ou cancelado pelo Asaas porque
-- ainda aguardava crédito, como no spike de cartão) é o que a NOOWE perdeu. Sem a informação do provedor, vale o spike: voltou todo.
--   Mesmo dia: crédito da tarifa (menos o que o Asaas devolver, se um dia negociarmos) e do split que NÃO voltou, para o restaurante
--              recuperar a taxa inteira.
--   Depois do dia: a taxa não é devolvida. Se o split saiu da NOOWE, a parte da taxa volta na fatura; se ficou, nada.
create or replace function private.refund_fee_policy(p_tx uuid)
returns void language plpgsql security definer set search_path = public, private, pg_temp as $$
declare f private.noowe_pay_transaction_fees; g public.gateway_transactions; v_same_day boolean; v_bps integer; v_credit bigint; v_back bigint; v_fee_part bigint;
begin
  select * into f from private.noowe_pay_transaction_fees where gateway_transaction_id = p_tx;
  if f.gateway_transaction_id is null or f.fee_returned is not null then return; end if;
  select * into g from public.gateway_transactions where id = p_tx;
  v_same_day := private.same_operational_day(g.restaurant_id, coalesce(g.confirmed_at, g.created_at), coalesce(g.refund_requested_at, now()));
  v_back := least(coalesce(f.split_returned_cents, f.split_cents, 0), coalesce(f.split_cents, 0));
  if v_same_day then
    select refund_tariff_returned_bps into v_bps from private.noowe_billing_settings;
    update private.noowe_pay_compensations set status = 'voided' where gateway_transaction_id = p_tx and status = 'open';
    v_credit := coalesce(f.tariff_cents, 0) - div(coalesce(f.tariff_cents, 0) * v_bps, 10000)::bigint + greatest(coalesce(f.split_cents, 0) - v_back, 0);
    if v_credit > 0 then
      insert into private.noowe_pay_compensations(restaurant_id, gateway_transaction_id, kind, amount_cents)
        values (f.restaurant_id, p_tx, 'tariff_on_refund', v_credit)
        on conflict (gateway_transaction_id, kind) do nothing;
    end if;
  else
    -- Só a parte da taxa: a conveniência foi devolvida ao cliente.
    v_fee_part := least(private.noowe_pay_split_cents(f.fee_cents, coalesce(f.tariff_cents, f.fee_cents)), v_back);
    if v_fee_part > 0 then
      insert into private.noowe_pay_compensations(restaurant_id, gateway_transaction_id, kind, amount_cents)
        values (f.restaurant_id, p_tx, 'fee_kept_on_refund', v_fee_part)
        on conflict (gateway_transaction_id, kind) do nothing;
    end if;
  end if;
  update private.noowe_pay_transaction_fees set fee_returned = v_same_day, updated_at = now() where gateway_transaction_id = p_tx;
end $$;

-- 6. Dinheiro devolvido: inclui o que esperava saldo, e no cartão o cliente sabe que a fatura demora.
create or replace function private.refund_settle(p_tx uuid, p_total boolean)
returns void language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_reason text; v_tx public.gateway_transactions; v_days integer; v_cents bigint;
begin
  if p_total then
    update public.payment_refunds set status = 'done', done_at = now(), error_message = null, updated_at = now()
      where gateway_transaction_id = p_tx and status in ('pending', 'processing', 'sent', 'awaiting_balance');
  else
    update public.payment_refunds set status = 'done', done_at = now(), error_message = null, updated_at = now()
      where id = (select r.id from public.payment_refunds r where r.gateway_transaction_id = p_tx and r.status in ('processing', 'sent') order by r.sent_at nulls last, r.created_at limit 1);
  end if;
  update public.gateway_transactions g set updated_at = now(),
      refunded_amount_cents = case when p_total then g.amount_cents else least(g.amount_cents, coalesce((select sum(r.amount_cents)
        from public.payment_refunds r where r.gateway_transaction_id = g.id and r.status = 'done'), 0)) end
    where g.id = p_tx returning g.* into v_tx;
  select r.reason, r.amount_cents into v_reason, v_cents from public.payment_refunds r where r.gateway_transaction_id = p_tx and r.status = 'done' order by r.done_at desc limit 1;
  if v_tx.customer_id is not null and v_tx.payment_method in ('credit_card', 'debit_card') and v_tx.provider <> 'simulated' then
    select card_refund_notice_business_days into v_days from private.noowe_billing_settings;
    perform private.create_notification(v_tx.customer_id, 'Estorno feito',
      'Devolvemos ' || to_char(coalesce(v_cents, v_tx.refunded_amount_cents)::numeric / 100, 'FM999G990D00') || ' no seu cartão. Pode levar até ' || v_days || ' dias úteis para aparecer na fatura.',
      'system', p_tx, null, jsonb_build_object('kind', 'payment_refund_card', 'payment_id', p_tx));
  end if;
  -- A nota só acompanha depois de o dinheiro voltar: recusado, a venda segue valendo com a nota dela.
  perform private.fiscal_after_refund(p_tx, coalesce(v_reason, 'Estorno'));
end $$;

-- 7. Nota depois do estorno (63).
create or replace function private.fiscal_after_refund(p_tx uuid, p_reason text)
returns void language plpgsql security definer set search_path = public, private, pg_temp as $$
declare g public.gateway_transactions; d public.fiscal_documents; v_left boolean; v_window integer; v_why text;
begin
  select * into g from public.gateway_transactions where id = p_tx;
  select * into d from public.fiscal_documents f
    where f.cancel_status is null and f.status in ('authorized', 'pending', 'processing', 'blocked')
      and ((g.order_id is not null and f.order_id = g.order_id) or (g.table_session_id is not null and f.table_session_id = g.table_session_id))
    order by f.created_at desc limit 1;
  if d.id is null then return; end if;
  select exists (select 1 from public.gateway_transactions x
      where ((g.order_id is not null and x.order_id = g.order_id) or (g.table_session_id is not null and x.table_session_id = g.table_session_id))
        and x.status = 'completed' and private.refund_available_cents(x.id) > 0) into v_left;
  if not v_left and d.status in ('pending', 'blocked') then
    update public.fiscal_documents set status = 'failed', error_message = 'Venda estornada antes da emissão', updated_at = now() where id = d.id;
    perform private.log_system_audit(d.restaurant_id, 'fiscal.discarded_after_refund', 'fiscal_document', d.id, p_reason, null, jsonb_build_object('paymentId', p_tx));
    return;
  end if;
  select nfce_cancel_window_minutes into v_window from private.noowe_billing_settings;
  -- Total, dentro do prazo da SEFAZ: cancela. Em emissão, o cancelamento espera a autorização e a fila confere de novo.
  if not v_left and (d.status = 'processing' or (d.status = 'authorized' and d.authorized_at >= now() - make_interval(mins => v_window))) then
    update public.fiscal_documents set cancel_status = 'requested', cancel_reason = private.fiscal_cancel_justification(p_reason),
        cancel_next_attempt_at = now(), updated_at = now() where id = d.id;
    perform private.log_system_audit(d.restaurant_id, 'fiscal.cancel_requested', 'fiscal_document', d.id, p_reason, null, jsonb_build_object('paymentId', p_tx));
    if d.status = 'authorized' then perform private.fiscal_post_cancel(d.id); end if;
    return;
  end if;
  -- Parcial, ou total fora do prazo: a nota continua, e o estorno vai para o relatório fiscal do contador do restaurante.
  v_why := case when v_left then 'Estorno parcial' else 'Estorno fora do prazo de cancelamento da nota' end;
  update public.fiscal_documents set refund_review_at = now(), refund_review_reason = v_why,
      refund_review_cents = refund_review_cents + coalesce((select r.amount_cents from public.payment_refunds r where r.gateway_transaction_id = p_tx and r.status = 'done' order by r.done_at desc limit 1), 0),
      updated_at = now()
    where id = d.id;
  perform private.log_system_audit(d.restaurant_id, 'fiscal.refund_review', 'fiscal_document', d.id, p_reason, null, jsonb_build_object('paymentId', p_tx, 'why', v_why));
  perform private.notify_restaurant_staff(d.restaurant_id, array['owner','manager']::public.user_roles_role_enum[],
    'Revisar nota fiscal', v_why || ': a nota continua valendo e o estorno está no relatório fiscal, para o contador.', 'staff_bill_refund_review', d.id, null,
    jsonb_build_object('kind', 'staff_fiscal_review', 'document_id', d.id));
end $$;

-- 8. A varredura também tenta de novo quem espera saldo. Corrige a precedência no filtro do cancelamento da nota.
create or replace function private.refund_sweep()
returns integer language plpgsql security definer set search_path = public, private, pg_temp as $$
declare p record; v_id uuid; v_n integer := 0;
begin
  select * into p from private.refund_retry_policy();
  for v_id in
    select id from public.payment_refunds
    where (status in ('pending', 'awaiting_balance') and next_attempt_at <= now())
       or (status = 'processing' and claimed_at < now() - p.stale_after)
       or (status = 'sent' and next_attempt_at <= now())
    order by next_attempt_at limit 50
  loop
    if private.refund_post(v_id) then v_n := v_n + 1; end if;
  end loop;
  for v_id in
    select id from public.fiscal_documents where status = 'authorized' and ((cancel_status = 'requested' and cancel_next_attempt_at <= now())
       or (cancel_status = 'processing' and cancel_claimed_at < now() - p.stale_after)) limit 50
  loop
    perform private.fiscal_post_cancel(v_id);
  end loop;
  return v_n;
end $$;
