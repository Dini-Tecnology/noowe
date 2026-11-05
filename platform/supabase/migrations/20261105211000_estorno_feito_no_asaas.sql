-- Estorno feito direto no painel do Asaas, sem passar pelo app. Sem pedido local, o aviso parcial não achava o que concluir:
-- o valor não mudava, e o aviso "em andamento" marcava a venda inteira como estorno total.
-- O webhook reconsulta a cobrança e registra aqui a diferença, como um estorno enviado. A partir daí segue o caminho normal.
create or replace function public.service_refund_external(p_payment_id uuid, p_provider_refunded_cents bigint)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare g public.gateway_transactions; v_known bigint; v_cents bigint; v_id uuid;
begin
  select * into g from public.gateway_transactions where id = p_payment_id for update;
  if g.id is null then raise exception 'Payment transaction not found' using errcode = 'P0002'; end if;
  -- O que o provedor já tem e o app conhece: concluído ou enviado. O que está só na fila ainda não chegou lá.
  select coalesce(sum(r.amount_cents), 0) into v_known from public.payment_refunds r
    where r.gateway_transaction_id = g.id and r.status in ('processing', 'sent', 'done');
  v_cents := least(coalesce(p_provider_refunded_cents, 0) - v_known, g.amount_cents - v_known);
  if v_cents <= 0 then return jsonb_build_object('externalCents', 0); end if;
  insert into public.payment_refunds(restaurant_id, gateway_transaction_id, amount_cents, reason, status, sent_at)
    values (g.restaurant_id, g.id, v_cents, 'Estorno feito no painel do Asaas', 'sent', now())
    returning id into v_id;
  update public.gateway_transactions set refund_requested_at = coalesce(refund_requested_at, now()), updated_at = now() where id = g.id;
  perform private.log_system_audit(g.restaurant_id, 'payment.refund_external', 'payment', g.id,
    'Estorno feito no painel do Asaas, fora do app', null, jsonb_build_object('refundId', v_id, 'amountCents', v_cents));
  perform private.emit_event_safe(g.restaurant_id, 'payment.refund_external', 'payment.refund_external:' || v_id, 'payment', g.id,
    jsonb_build_object('title', 'Estorno feito fora do app', 'detail', 'Um estorno foi feito direto no painel do Asaas. Confira o extrato.'));
  return jsonb_build_object('externalCents', v_cents, 'refundId', v_id);
end $$;
revoke all on function public.service_refund_external(uuid, bigint) from public, anon, authenticated;
grant execute on function public.service_refund_external(uuid, bigint) to service_role;

insert into private.event_catalog(event_type, task_type, primary_roles, manager_joins, push_policy, priority) values
  ('payment.refund_external', 'notice', '{manager,owner}', false, 'always', 2)
on conflict do nothing;
