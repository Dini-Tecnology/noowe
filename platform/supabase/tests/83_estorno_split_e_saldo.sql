-- Respostas 63 e 64 (05/11/2026): split devolvido no estorno total do mesmo dia, "Aguardando saldo" no Pix, aviso do cartão e a nota fiscal.
begin;
select plan(10);
create function pg_temp.tx(p_cents bigint, p_method text default 'pix', p_customer uuid default null) returns uuid language sql as $$
  insert into public.gateway_transactions(restaurant_id, provider, payment_method, amount_cents, status, idempotency_key, purpose, confirmed_at, created_at, updated_at, customer_id)
  values ('c1000000-0000-4000-8000-000000000002', 'asaas', p_method, p_cents, 'completed', 'r83-' || gen_random_uuid(), 'order', now(), now(), now(), p_customer) returning id $$;
create function pg_temp.fees(p_tx uuid, p_fee bigint, p_tariff bigint, p_split bigint) returns void language sql as $$
  insert into private.noowe_pay_transaction_fees(gateway_transaction_id, restaurant_id, payment_method, rate_bps, amount_cents, fee_cents, tariff_cents, split_cents)
  select p_tx, restaurant_id, payment_method, 349, amount_cents, p_fee, p_tariff, p_split from public.gateway_transactions where id = p_tx $$;
create function pg_temp.refund(p_tx uuid, p_cents bigint) returns uuid language sql as $$
  update public.gateway_transactions set refund_requested_at = now() where id = p_tx;
  insert into public.payment_refunds(restaurant_id, gateway_transaction_id, amount_cents, reason, status)
  values ('c1000000-0000-4000-8000-000000000002', p_tx, p_cents, 'Teste', 'pending') returning id $$;
create function pg_temp.comp(p_tx uuid, p_kind text) returns bigint language sql as $$
  select amount_cents from private.noowe_pay_compensations where gateway_transaction_id = p_tx and kind = p_kind and status = 'open' $$;

do $$
declare t uuid := pg_temp.tx(10000); rid uuid; j jsonb;
begin
  perform pg_temp.fees(t, 349, 99, 250);
  rid := pg_temp.refund(t, 10000);
  j := public.service_refund_claim(rid);
  assert (j->>'returnSplitCents')::bigint = 250, 'total no mesmo dia devolve o split: ' || j;
  update public.payment_refunds set status = 'pending', next_attempt_at = now() where id = rid;
  update public.payment_refunds set amount_cents = 4000 where id = rid;
  j := public.service_refund_claim(rid);
  assert (j->>'returnSplitCents')::bigint = 0, 'parcial não devolve';
end $$;
select pass('o pedido ao Asaas leva o split da NOOWE só no estorno total do mesmo dia');

do $$
declare t uuid := pg_temp.tx(10000);
begin
  perform pg_temp.fees(t, 349, 99, 250);
  perform public.service_refund_split_returned(t, 200);
  perform private.refund_fee_policy(t);
  assert pg_temp.comp(t, 'tariff_on_refund') = 99 + 50, 'tarifa e o split que não voltou: ' || pg_temp.comp(t, 'tariff_on_refund');
  perform set_config('noowe.param_author', 'teste', true);
  update private.noowe_billing_settings set refund_tariff_returned_bps = 10000;
  t := pg_temp.tx(10000);
  perform pg_temp.fees(t, 349, 99, 250);
  perform public.service_refund_split_returned(t, 250);
  perform private.refund_fee_policy(t);
  assert pg_temp.comp(t, 'tariff_on_refund') is null, 'se o Asaas devolver a tarifa, nada a creditar';
  update private.noowe_billing_settings set refund_tariff_returned_bps = 0;
end $$;
select pass('mesmo dia: Ajuste de estorno com a tarifa (menos o que o Asaas devolver) e o split que não voltou');

do $$
declare t uuid := pg_temp.tx(10000); r uuid := 'c1000000-0000-4000-8000-000000000002';
begin
  perform pg_temp.fees(t, 349, 99, 250);
  update public.gateway_transactions set confirmed_at = now() - interval '5 days' where id = t;
  perform private.operational_day_current(r);
  update public.operational_days set started_at = now() - interval '1 hour' where restaurant_id = r and status = 'open';
  update public.gateway_transactions set refund_requested_at = now() where id = t;
  perform public.service_refund_split_returned(t, 0);
  perform private.refund_fee_policy(t);
  assert pg_temp.comp(t, 'fee_kept_on_refund') is null and pg_temp.comp(t, 'tariff_on_refund') is null, 'split ficou com a NOOWE: nada na fatura';
  assert not (select fee_returned from private.noowe_pay_transaction_fees where gateway_transaction_id = t), 'a taxa não volta';
end $$;
select pass('depois do dia, sem splitRefunds: o split fica com a NOOWE, sem crédito e sem cobrança na fatura');

do $$
declare t uuid := pg_temp.tx(10000); rid uuid; j jsonb; n integer;
begin
  rid := pg_temp.refund(t, 10000);
  update public.payment_refunds set status = 'processing', attempts = 1, claimed_at = now() where id = rid;
  j := public.service_refund_record(rid, 'no_balance', 'Saldo insuficiente');
  assert (select status from public.payment_refunds where id = rid) = 'awaiting_balance', 'aguardando saldo';
  assert (select attempts from public.payment_refunds where id = rid) = 0, 'não gasta tentativa';
  assert (select next_attempt_at from public.payment_refunds where id = rid) > now() + interval '59 minutes', 'tenta de novo no prazo do parâmetro';
  select count(*) into n from public.audit_logs where action = 'payment.refund_awaiting_balance' and entity_id = t;
  update public.payment_refunds set next_attempt_at = now() - interval '1 second' where id = rid;
  j := public.service_refund_claim(rid);
  assert j->>'action' = 'send', 'a fila tenta de novo: ' || j;
  perform public.service_refund_record(rid, 'no_balance', 'Saldo insuficiente');
  assert (select count(*) from public.audit_logs where action = 'payment.refund_awaiting_balance' and entity_id = t) = n and n = 1, 'avisa uma vez';
  perform private.refund_settle(t, true);
  assert (select status from public.payment_refunds where id = rid) = 'done', 'quando o dinheiro sai, conclui';
end $$;
select pass('Pix sem saldo: "Aguardando saldo", Gerente e Dono avisados uma vez, e nova tentativa automática');

do $$
declare c uuid := 'c1000000-0000-4000-8000-000000000001'; t uuid := pg_temp.tx(5000, 'credit_card', c); rid uuid;
begin
  rid := pg_temp.refund(t, 5000);
  update public.payment_refunds set status = 'sent' where id = rid;
  perform private.refund_settle(t, true);
  assert exists (select 1 from public.notifications n where n.user_id = c and n.metadata->>'kind' = 'payment_refund_card' and n.message like '%até 10 dias úteis%'), 'avisa o cliente';
end $$;
select pass('estorno no cartão avisa o cliente do prazo de até 10 dias úteis na fatura');

do $$
declare t uuid := pg_temp.tx(6000); d uuid := gen_random_uuid(); o uuid; r uuid := 'c1000000-0000-4000-8000-000000000002';
begin
  insert into public.orders(restaurant_id, customer_id, order_number, status, total_cents) values (r, 'c1000000-0000-4000-8000-000000000001', 'R83-' || substr(gen_random_uuid()::text, 1, 6), 'delivered', 6000) returning id into o;
  update public.gateway_transactions set order_id = o where id = t;
  insert into public.fiscal_documents(id, restaurant_id, order_id, external_ref, total_cents, status, authorized_at) values (d, r, o, 'o-' || o, 6000, 'authorized', now() - interval '2 hours');
  perform pg_temp.refund(t, 6000);
  perform private.refund_settle(t, true);
  assert (select cancel_status from public.fiscal_documents where id = d) is null, 'fora do prazo, não cancela';
  assert (select refund_review_at is not null and refund_review_cents = 6000 and refund_review_reason like 'Estorno fora do prazo%' from public.fiscal_documents where id = d), 'vai ao relatório fiscal';
end $$;
select pass('estorno total fora do prazo da SEFAZ: a nota continua e entra no relatório fiscal do restaurante');

select ok((select nfce_cancel_window_minutes = 30 and card_refund_notice_business_days = 10 and refund_balance_retry_minutes > 0 from private.noowe_billing_settings), 'prazos em parâmetro');

-- Validação das notas de 06/11: o que os blocos acima não conferiam.
do $$
declare t uuid; r uuid := 'c1000000-0000-4000-8000-000000000002';
begin
  -- Depois do dia, a taxa fica com a NOOWE só até o que o Asaas devolveu do split.
  t := pg_temp.tx(10000);
  perform pg_temp.fees(t, 349, 99, 250);
  update public.gateway_transactions set confirmed_at = now() - interval '5 days', refund_requested_at = now() where id = t;
  perform public.service_refund_split_returned(t, 100);
  perform private.refund_fee_policy(t);
  assert pg_temp.comp(t, 'fee_kept_on_refund') = 100, 'só o que voltou: ' || coalesce(pg_temp.comp(t, 'fee_kept_on_refund')::text, 'nada');
  t := pg_temp.tx(10000);
  perform pg_temp.fees(t, 349, 99, 250);
  update public.gateway_transactions set confirmed_at = now() - interval '5 days', refund_requested_at = now() where id = t;
  perform public.service_refund_split_returned(t, 900);
  perform private.refund_fee_policy(t);
  assert pg_temp.comp(t, 'fee_kept_on_refund') = 250, 'nunca mais que a taxa: ' || coalesce(pg_temp.comp(t, 'fee_kept_on_refund')::text, 'nada');
end $$;
select pass('depois do dia: a taxa mantida pela NOOWE vai só até o que o Asaas devolveu do split');

do $$
declare t uuid := pg_temp.tx(8000); rid uuid; dono uuid := 'c1000000-0000-4000-8000-000000000001';
begin
  rid := pg_temp.refund(t, 8000);
  update public.payment_refunds set status = 'processing', attempts = 1, claimed_at = now() where id = rid;
  perform public.service_refund_record(rid, 'no_balance', 'Saldo insuficiente');
  assert exists (select 1 from public.notifications n where n.user_id = dono and n.metadata->>'kind' = 'staff_refund_awaiting_balance' and n.metadata->>'refund_id' = rid::text),
    'o Dono é avisado do estorno esperando saldo';
  -- Passou do prazo de espera (parâmetro): vira falha, a venda volta a valer e o Dono é avisado.
  update public.payment_refunds set status = 'processing', claimed_at = now(),
    created_at = now() - make_interval(hours => (select refund_balance_max_hours from private.noowe_billing_settings) + 1) where id = rid;
  perform public.service_refund_record(rid, 'no_balance', 'Saldo insuficiente');
  assert (select status from public.payment_refunds where id = rid) = 'failed', 'depois do prazo, falha: ' || (select status from public.payment_refunds where id = rid);
  assert (select error_message from public.payment_refunds where id = rid) like '%prazo de espera esgotado%', 'com o motivo';
  assert exists (select 1 from public.notifications n where n.user_id = dono and n.metadata->>'kind' = 'staff_refund_failed' and n.metadata->>'refund_id' = rid::text), 'e o Dono é avisado da falha';
  assert (select refund_balance_max_hours from private.noowe_billing_settings) = 72, 'prazo de 72 horas no parâmetro';
end $$;
select pass('Pix sem saldo: o Dono é avisado; passado o prazo (72 h, parâmetro), vira falha e o Dono é avisado de novo');

do $$
declare t uuid; d uuid; o uuid; r uuid := 'c1000000-0000-4000-8000-000000000002'; dono uuid := 'c1000000-0000-4000-8000-000000000001';
begin
  -- Fora da janela: aviso de revisão (o bloco acima já conferiu que a nota continua).
  select id into d from public.fiscal_documents where restaurant_id = r and refund_review_reason like 'Estorno fora do prazo%' order by refund_review_at desc limit 1;
  assert exists (select 1 from public.notifications n where n.user_id = dono and n.metadata->>'kind' = 'staff_fiscal_review' and n.metadata->>'document_id' = d::text), 'fora do prazo avisa o Dono';
  -- Parcial, mesmo dentro da janela: a nota continua e vai ao relatório, com aviso.
  t := pg_temp.tx(6000); d := gen_random_uuid();
  insert into public.orders(restaurant_id, customer_id, order_number, status, total_cents) values (r, dono, 'R83P-' || substr(gen_random_uuid()::text, 1, 6), 'delivered', 6000) returning id into o;
  update public.gateway_transactions set order_id = o where id = t;
  insert into public.fiscal_documents(id, restaurant_id, order_id, external_ref, total_cents, status, authorized_at) values (d, r, o, 'o-' || o, 6000, 'authorized', now());
  perform pg_temp.refund(t, 2000);
  perform private.refund_settle(t, false);
  assert (select cancel_status from public.fiscal_documents where id = d) is null, 'parcial não cancela a nota';
  assert (select refund_review_reason from public.fiscal_documents where id = d) = 'Estorno parcial', 'vai ao relatório como parcial';
  assert exists (select 1 from public.notifications n where n.user_id = dono and n.metadata->>'kind' = 'staff_fiscal_review' and n.metadata->>'document_id' = d::text), 'parcial avisa o Dono';
end $$;
select pass('estorno parcial ou fora do prazo: a nota continua, vai ao relatório do contador e o Dono é avisado');
select * from finish();
rollback;
