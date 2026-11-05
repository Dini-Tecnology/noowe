-- Estorno feito direto no painel do Asaas: o valor chega ao app, sem duplicar o que o app já pediu.
begin;
select plan(6);
create function pg_temp.tx(p_cents bigint default 10000) returns uuid language sql as $$
  insert into public.gateway_transactions(restaurant_id, provider, payment_method, amount_cents, status, idempotency_key, purpose, confirmed_at, created_at, updated_at)
  values ('c1000000-0000-4000-8000-000000000002', 'asaas', 'pix', p_cents, 'completed', 'ext-' || gen_random_uuid(), 'order', now(), now(), now()) returning id $$;

do $$
declare t uuid := pg_temp.tx(); g public.gateway_transactions; j jsonb;
begin
  j := public.service_refund_external(t, 1500);
  assert (j->>'externalCents')::bigint = 1500, 'registra a diferença: ' || j;
  perform private.apply_payment_event(t, 'asaas', 'ext-a-' || t, 'PAYMENT_PARTIALLY_REFUNDED', 'refunded', null, '{}', 'partially_refunded');
  select * into g from public.gateway_transactions where id = t;
  assert g.refunded_amount_cents = 1500 and g.status = 'completed', 'parcial: a venda segue e o valor muda: ' || g.refunded_amount_cents || ' ' || g.status;
  assert (select status from public.payment_refunds where gateway_transaction_id = t) = 'done', 'o estorno fica concluído';
  assert exists (select 1 from public.audit_logs a where a.action = 'payment.refund_external' and a.entity_id = t), 'deixa rastro';
end $$;
select pass('estorno parcial do painel muda o valor estornado, mantém a venda e deixa rastro');

do $$
declare t uuid := pg_temp.tx();
begin
  perform public.service_refund_external(t, 1500);
  perform private.apply_payment_event(t, 'asaas', 'ext-b-' || t, 'PAYMENT_PARTIALLY_REFUNDED', 'refunded', null, '{}', 'partially_refunded');
  assert (public.service_refund_external(t, 1500)->>'externalCents')::bigint = 0, 'repetir não registra de novo';
  assert (public.service_refund_external(t, 2000)->>'externalCents')::bigint = 500, 'um segundo estorno entra só pela diferença';
  assert (select count(*) from public.payment_refunds where gateway_transaction_id = t) = 2, 'dois registros';
end $$;
select pass('repetir o aviso não duplica, e um segundo estorno entra pela diferença');

do $$
declare t uuid := pg_temp.tx(); r uuid;
begin
  r := private.enqueue_refund(t, 'pelo app', 1000);
  perform public.service_refund_claim(r); perform public.service_refund_record(r, 'sent');
  assert (public.service_refund_external(t, 1000)->>'externalCents')::bigint = 0, 'o estorno do próprio app não vira externo';
end $$;
select pass('estorno pedido pelo app não é contado de novo como externo');

do $$
declare t uuid := pg_temp.tx(); g public.gateway_transactions;
begin
  perform public.service_refund_external(t, 1500);
  perform private.apply_payment_event(t, 'asaas', 'ext-c-' || t, 'PAYMENT_REFUND_IN_PROGRESS', 'refund_pending', null, '{}', 'refund_pending');
  select * into g from public.gateway_transactions where id = t;
  assert g.status = 'completed', 'parcial em andamento não vira estorno total: ' || g.status;
end $$;
select pass('estorno parcial em andamento não marca a venda inteira como estornada');

do $$
declare t uuid := pg_temp.tx(); g public.gateway_transactions;
begin
  perform public.service_refund_external(t, 10000);
  perform private.apply_payment_event(t, 'asaas', 'ext-d-' || t, 'PAYMENT_PARTIALLY_REFUNDED', 'refunded', null, '{}', 'partially_refunded');
  select * into g from public.gateway_transactions where id = t;
  assert g.status = 'refunded' and g.refunded_amount_cents = 10000, 'zerou: ' || g.status;
end $$;
select pass('estorno do painel que zera a venda fecha como estorno total');

do $$
declare t uuid := pg_temp.tx(); ok boolean := false;
begin
  set local role authenticated;
  begin perform public.service_refund_external(t, 100); exception when insufficient_privilege then ok := true; end;
  reset role;
  assert ok, 'só o servidor chama';
end $$;
select pass('só o servidor registra estorno externo');
select * from finish();
rollback;
