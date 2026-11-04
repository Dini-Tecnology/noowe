-- Os avisos de estorno usam o tipo de notificação que já existe para revisão de estorno.

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
    'staff_bill_refund_review', r.id, null, jsonb_build_object('kind', 'staff_refund_failed', 'refund_id', r.id, 'payment_id', r.gateway_transaction_id));
  return jsonb_build_object('status', r.status);
end $$;

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
      'Revisar nota fiscal', 'Parte da venda foi estornada, e a nota continua valendo pelo total.', 'staff_bill_refund_review', d.id, null,
      jsonb_build_object('kind', 'staff_fiscal_review', 'document_id', d.id));
    return;
  end if;
  update public.fiscal_documents set cancel_status = 'requested', cancel_reason = private.fiscal_cancel_justification(p_reason),
      cancel_next_attempt_at = now(), updated_at = now() where id = d.id;
  perform private.log_system_audit(d.restaurant_id, 'fiscal.cancel_requested', 'fiscal_document', d.id, p_reason, null, jsonb_build_object('paymentId', p_tx));
  perform private.fiscal_post_cancel(d.id);
end $$;

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
      'Nota fiscal não cancelada', coalesce(p_error, 'A SEFAZ não aceitou o cancelamento.') || ' Fale com o contador.', 'staff_bill_refund_review', d.id, null,
      jsonb_build_object('kind', 'staff_fiscal_cancel_failed', 'document_id', d.id));
  end if;
  return jsonb_build_object('cancelStatus', d.cancel_status);
end $$;
