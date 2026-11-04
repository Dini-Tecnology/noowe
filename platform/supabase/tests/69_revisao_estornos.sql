-- Revisão de N4, M2 e M3: dinheiro e nota nos caminhos que os testes das fatias não cobriam.
begin;
select plan(8);

create function pg_temp.act(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true) $$;
create function pg_temp.state_of(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ok'; exception when sqlstate 'P0004' then return 'P0004'; when others then return sqlstate; end $$;

create temp table _ctx(k text primary key, v uuid);
create function pg_temp.ctx(p text) returns uuid language sql as $$ select v from _ctx where k = p $$;

-- Pagamento real concluído, ligado a uma comanda de duas pessoas já paga por inteiro.
create function pg_temp.new_paid(p_label text) returns uuid language plpgsql as $$
declare
  r uuid := 'c1000000-0000-4000-8000-000000000002'; owner_id uuid := 'c1000000-0000-4000-8000-000000000001';
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); tbl jsonb; sid uuid; menu uuid; o uuid; sh public.bill_shares; tx public.gateway_transactions; pid uuid; u uuid;
begin
  insert into auth.users(id, email) values (a, a || '@refund.test'), (b, b || '@refund.test');
  insert into public.profiles(id) values (a), (b) on conflict do nothing;
  perform pg_temp.act(owner_id);
  tbl := public.restaurant_create_table(r, 'test-refund-' || a, 4);
  select id into menu from public.menu_items where restaurant_id = r limit 1;
  perform pg_temp.act(a); sid := (public.customer_open_table_session(tbl->>'qr_code')->>'tableSessionId')::uuid;
  perform pg_temp.act(b); perform public.customer_open_table_session(tbl->>'qr_code');
  insert into public.orders(restaurant_id, customer_id, table_session_id) values (r, a, sid) returning id into o;
  insert into public.order_items(order_id, menu_item_id, quantity, unit_price, total_price) values (o, menu, 3, 20, 60);
  perform pg_temp.act(a);
  perform public.customer_bill_split_commit(sid, 'equal', '{}', null, gen_random_uuid());
  foreach u in array array[a, b] loop
    select id into pid from public.table_session_participants where table_session_id = sid and user_id = u;
    select * into sh from public.bill_shares where table_session_id = sid and participant_id = pid and status = 'open';
    tx := private.reserve_share_payment(u, sh.id, 'pix', 0, gen_random_uuid(), 'asaas');
    update public.gateway_transactions set provider_ref = 'pay_' || tx.id where id = tx.id;
    perform private.apply_payment_event(tx.id, 'asaas', 'evt-' || tx.id, 'PAYMENT_RECEIVED', 'confirmed', tx.amount_cents);
    insert into _ctx values (p_label || ':tx:' || (case when u = a then 'a' else 'b' end), tx.id), (p_label || ':' || (case when u = a then 'a' else 'b' end), u);
  end loop;
  insert into _ctx values (p_label || ':sid', sid);
  return sid;
end $$;

do $$
declare r uuid := 'c1000000-0000-4000-8000-000000000002'; m uuid := gen_random_uuid();
begin
  insert into public.restaurant_payment_accounts(restaurant_id, provider, status) values (r, 'asaas', 'active') on conflict do nothing;
  update public.restaurant_payment_accounts set status = 'active' where restaurant_id = r;
  update public.restaurant_model_policies set fee_or_tip_mode = 'service_fee', service_fee_bps = 1000, split_modes = '{by_owner,equal,by_item,fixed_amount}'
    where restaurant_id = r and not prepaid_required;
  insert into auth.users(id, email) values (m, m || '@refund.test');
  insert into public.profiles(id) values (m) on conflict do nothing;
  insert into public.user_roles(user_id, restaurant_id, role, is_active) values (m, r, 'manager', true);
  insert into _ctx values ('manager', m), ('owner', 'c1000000-0000-4000-8000-000000000001');
  perform pg_temp.new_paid('main');
end $$;


-- Pedido pago e pronto para a próxima etapa, com taxa congelada.
create function pg_temp.new_order(p_total bigint, p_discount bigint default 0) returns public.orders language plpgsql as $$
declare r uuid := 'c1000000-0000-4000-8000-000000000002'; c uuid := gen_random_uuid(); o public.orders;
begin
  insert into auth.users(id, email) values (c, c || '@refund.test');
  insert into public.profiles(id) values (c) on conflict do nothing;
  insert into public.orders(restaurant_id, customer_id, service_model, total_cents, total_amount, discount_cents, payment_status)
    values (r, c, 'quick_service', p_total, p_total::numeric / 100, p_discount, 'pending') returning * into o;
  return o;
end $$;
create function pg_temp.reserve(o public.orders, p_method text) returns uuid language plpgsql as $$
begin
  return (public.service_payment_reserve_order(o.customer_id, o.id, p_method, gen_random_uuid())->>'paymentId')::uuid;
end $$;

-- Pedido pago duas vezes: a segunda cobrança volta ao cliente.
do $$
declare o public.orders := pg_temp.new_order(10000); a uuid; b uuid; j jsonb;
begin
  a := pg_temp.reserve(o, 'credit_card');
  b := pg_temp.reserve(o, 'pix');
  assert a <> b, 'duas cobranças';
  perform private.apply_payment_event(b, 'asaas', 'evt-b-' || b, 'PAYMENT_RECEIVED', 'confirmed', null);
  assert (select payment_status from public.orders where id = o.id) = 'confirmed', 'pago';
  j := private.apply_payment_event(a, 'asaas', 'evt-a-' || a, 'PAYMENT_CONFIRMED', 'confirmed', null);
  assert (j->>'latePayment')::boolean, 'tratada como tardia: ' || j;
  assert exists (select 1 from public.payment_refunds r where r.gateway_transaction_id = a and r.status = 'pending'), 'estorno na fila';
  assert (select status from public.gateway_transactions where id = a) = 'refund_pending', 'a segunda sai do caixa';
  assert (select status from public.gateway_transactions where id = b) = 'completed', 'a primeira segue valendo';
  assert (select payment_status from public.orders where id = o.id) = 'confirmed', 'o pedido segue pago';
end $$;
select pass('pedido pago duas vezes: a segunda cobrança volta ao cliente');

-- Um aviso parcial conclui um estorno só, e nunca há dois em andamento.
do $$
declare tx uuid := pg_temp.ctx('main:tx:a'); r1 uuid; r2 uuid; j jsonb; g public.gateway_transactions;
begin
  select * into g from public.gateway_transactions where id = tx;
  r1 := private.enqueue_refund(tx, 'um', 100);
  r2 := private.enqueue_refund(tx, 'dois', 200);
  j := public.service_refund_claim(r1);
  assert (j->>'claimed')::boolean and (j->>'settledCents')::bigint = 0, 'pega o primeiro: ' || j;
  j := public.service_refund_claim(r2);
  assert not (j->>'claimed')::boolean and (j->>'waiting')::boolean, 'o segundo espera: ' || j;
  perform public.service_refund_record(r1, 'sent');
  perform private.apply_payment_event(tx, 'asaas', 'evt-p1-' || tx, 'PAYMENT_PARTIALLY_REFUNDED', 'refunded', null, '{}', 'partially_refunded');
  assert (select status from public.payment_refunds where id = r1) = 'done', 'o primeiro concluiu';
  assert (select status from public.payment_refunds where id = r2) = 'pending', 'o segundo não foi dado como feito';
  assert (select refunded_amount_cents from public.gateway_transactions where id = tx) = 100, 'só o valor dele';
  update public.payment_refunds set next_attempt_at = now() where id = r2;
  j := public.service_refund_claim(r2);
  assert (j->>'claimed')::boolean and (j->>'settledCents')::bigint = 100, 'agora vai, sabendo o que já foi: ' || j;
  perform public.service_refund_record(r2, 'failed', 'recusado');
  assert (select refunded_amount_cents from public.gateway_transactions where id = tx) = 100, 'recusado não conta';
end $$;
select pass('aviso parcial conclui um estorno só; a fila anda um por vez');

-- O último parcial que zera a venda fecha como estorno total.
do $$
declare tx uuid := pg_temp.ctx('main:tx:b'); r1 uuid; v bigint;
begin
  select private.refund_available_cents(tx) into v;
  r1 := private.enqueue_refund(tx, 'tudo em parcial', v - 1);
  perform public.service_refund_claim(r1); perform public.service_refund_record(r1, 'sent');
  perform private.apply_payment_event(tx, 'asaas', 'evt-p2-' || tx, 'PAYMENT_PARTIALLY_REFUNDED', 'refunded', null, '{}', 'partially_refunded');
  assert (select status from public.gateway_transactions where id = tx) = 'completed', 'ainda sobra';
  r1 := private.enqueue_refund(tx, 'o resto', 1);
  perform public.service_refund_claim(r1); perform public.service_refund_record(r1, 'sent');
  perform private.apply_payment_event(tx, 'asaas', 'evt-p3-' || tx, 'PAYMENT_PARTIALLY_REFUNDED', 'refunded', null, '{}', 'partially_refunded');
  assert (select status from public.gateway_transactions where id = tx) = 'refunded', 'zerou';
end $$;
select pass('o último parcial que zera a venda fecha como estorno total');

-- Negado depois de aceito: a venda volta a valer, e alguém fica sabendo. Sem confirmação há dias: também.
do $$
declare sid uuid := pg_temp.new_paid('neg'); tx uuid := pg_temp.ctx('neg:tx:a'); r1 uuid; j jsonb;
begin
  r1 := private.enqueue_refund(tx, 'total');
  perform public.service_refund_claim(r1); perform public.service_refund_record(r1, 'sent');
  assert (select status from public.gateway_transactions where id = tx) = 'refund_pending', 'a caminho';
  j := public.service_refund_denied(tx);
  assert (select status from public.payment_refunds where id = r1) = 'failed', 'falhou';
  assert (select status from public.gateway_transactions where id = tx) = 'completed', 'a venda volta';
  assert exists (select 1 from public.audit_logs a where a.entity_id = tx and a.action = 'payment.refund_failed'), 'registrado';
  r1 := private.enqueue_refund(tx, 'de novo');
  perform public.service_refund_claim(r1); perform public.service_refund_record(r1, 'sent');
  update public.payment_refunds set sent_at = now() - interval '4 days', next_attempt_at = now() where id = r1;
  perform public.service_refund_claim(r1);
  assert (select stuck_alerted_at from public.payment_refunds where id = r1) is not null, 'avisa';
  assert exists (select 1 from public.audit_logs a where a.entity_id = tx and a.action = 'payment.refund_stuck'), 'estorno preso fica registrado';
end $$;
select pass('negado volta a valer; preso há dias vai para uma pessoa');

-- A nota acompanha o dinheiro: nada antes de ele voltar, e em todos os caminhos.
do $$
declare sid uuid := pg_temp.new_paid('nf'); a uuid := pg_temp.ctx('nf:tx:a'); b uuid := pg_temp.ctx('nf:tx:b'); d uuid := gen_random_uuid(); r uuid := 'c1000000-0000-4000-8000-000000000002'; x uuid;
  o public.orders := pg_temp.new_order(5000); t uuid; d2 uuid := gen_random_uuid();
begin
  delete from public.fiscal_documents where table_session_id = sid;
  insert into public.fiscal_documents(id, restaurant_id, table_session_id, external_ref, total_cents, status) values (d, r, sid, 'r-' || sid, 6000, 'authorized');
  -- Recusado: a nota segue.
  x := private.enqueue_refund(a, 'cliente desistiu');
  assert (select cancel_status from public.fiscal_documents where id = d) is null, 'não cancela ao pedir';
  perform public.service_refund_claim(x); perform public.service_refund_record(x, 'failed', 'recusado');
  assert (select cancel_status from public.fiscal_documents where id = d) is null, 'recusado não cancela';
  -- Tudo devolvido: cancela.
  x := private.enqueue_refund(a, 'cliente desistiu');
  perform private.apply_payment_event(a, 'asaas', 'evt-na-' || a, 'PAYMENT_REFUNDED', 'refunded', null);
  assert (select cancel_status from public.fiscal_documents where id = d) is null, 'ainda há outro pagamento';
  x := private.enqueue_refund(b, 'cliente desistiu');
  perform private.apply_payment_event(b, 'asaas', 'evt-nb-' || b, 'PAYMENT_REFUNDED', 'refunded', null);
  assert (select cancel_status from public.fiscal_documents where id = d) = 'requested', 'tudo devolvido cancela a nota';
  -- Venda de balcão devolvida antes de a nota sair: a nota nem sai.
  t := pg_temp.reserve(o, 'pix');
  perform private.apply_payment_event(t, 'asaas', 'evt-o-' || t, 'PAYMENT_RECEIVED', 'confirmed', null);
  delete from public.fiscal_documents where order_id = o.id;
  insert into public.fiscal_documents(id, restaurant_id, order_id, external_ref, total_cents, status) values (d2, r, o.id, 'o-' || o.id, 5000, 'pending');
  x := private.enqueue_refund(t, 'pedido cancelado');
  perform private.apply_payment_event(t, 'asaas', 'evt-ro-' || t, 'PAYMENT_REFUNDED', 'refunded', null);
  assert (select status from public.fiscal_documents where id = d2) = 'failed', 'não emite venda devolvida';
  assert (select error_message from public.fiscal_documents where id = d2) like 'Venda estornada%', 'diz o motivo';
end $$;
select pass('a nota só é cancelada depois de o dinheiro voltar, em todos os caminhos');

-- Item indisponível devolve o que foi pago por ele, e recusa devolve o limite.
do $$
declare o public.orders := pg_temp.new_order(8000, 2000); t uuid; i1 uuid; i2 uuid; m uuid; j jsonb; rid uuid;
begin
  select id into m from public.menu_items where restaurant_id = o.restaurant_id limit 1;
  insert into public.order_items(order_id, menu_item_id, quantity, unit_price, total_price, total_price_cents) values (o.id, m, 1, 50, 50, 5000) returning id into i1;
  insert into public.order_items(order_id, menu_item_id, quantity, unit_price, total_price, total_price_cents) values (o.id, m, 1, 50, 50, 5000) returning id into i2;
  t := pg_temp.reserve(o, 'pix');
  perform private.apply_payment_event(t, 'asaas', 'evt-i-' || t, 'PAYMENT_RECEIVED', 'confirmed', null);
  update public.orders set fulfillment_status = 'accepted' where id = o.id;
  perform pg_temp.act(pg_temp.ctx('owner'));
  j := public.restaurant_refund_unavailable_item(i1, 'acabou');
  assert (j->>'refundedCents')::bigint = 4000, 'R$ 50 com desconto proporcional dão R$ 40: ' || j;
  select id into rid from public.payment_refunds where gateway_transaction_id = t;
  assert (select order_item_id from public.payment_refunds where id = rid) = i1, 'ligado ao item';
  perform public.service_refund_claim(rid); perform public.service_refund_record(rid, 'failed', 'recusado');
  assert (select refunded_cents from public.orders where id = o.id) = 0, 'recusado devolve o limite';
end $$;
select pass('item indisponível devolve o que foi pago por ele; recusa devolve o limite');

-- "Mesmo dia" é o do pagamento, medido na hora do pedido de estorno.
do $$
declare r uuid := 'c1000000-0000-4000-8000-000000000002'; d0 timestamptz := now() - interval '10 days';
begin
  insert into public.operational_days(restaurant_id, business_date, started_at, closed_at, status) values (r, (d0 at time zone 'America/Sao_Paulo')::date, d0, d0 + interval '12 hours', 'closed');
  assert private.same_operational_day(r, d0 + interval '1 hour', d0 + interval '2 hours'), 'mesmo dia';
  assert not private.same_operational_day(r, d0 + interval '1 hour', d0 + interval '13 hours'), 'depois de fechar';
  -- Caixa esquecido aberto não estende o dia.
  update public.operational_days set closed_at = null, status = 'closed' where restaurant_id = r and started_at = d0;
  assert private.same_operational_day(r, d0 + interval '1 hour', d0 + interval '20 hours'), 'dentro de 24h';
  assert not private.same_operational_day(r, d0 + interval '1 hour', d0 + interval '3 days'), 'dias depois não é mesmo dia';
end $$;
select pass('"mesmo dia" vem do pagamento e do pedido de estorno');

-- Extrato: a conveniência sai do líquido, e não entra na margem de pagamento.
do $$
declare o public.orders := pg_temp.new_order(10000); t uuid; j jsonb; x jsonb; v_fee bigint; v_split bigint;
begin
  update public.orders set convenience_fee_cents = 200 where id = o.id;
  t := pg_temp.reserve(o, 'pix');
  update private.noowe_pay_transaction_fees set convenience_cents = 200 where gateway_transaction_id = t;
  j := public.service_payment_set_split(t, (select amount_cents - 100 from public.gateway_transactions where id = t));
  select fee_cents into v_fee from private.noowe_pay_transaction_fees where gateway_transaction_id = t;
  assert (j->>'splitCents')::bigint = private.noowe_pay_split_cents(v_fee, 100) + 200, 'a conveniência vai no split: ' || j;
  -- A conveniência congelada é a que vale, mesmo que o pedido mude.
  update public.orders set convenience_fee_cents = 999 where id = o.id;
  assert (public.service_payment_set_split(t, (select amount_cents - 100 from public.gateway_transactions where id = t))->>'splitCents')::bigint = private.noowe_pay_split_cents(v_fee, 100) + 200, 'congelada';
  perform private.apply_payment_event(t, 'asaas', 'evt-c-' || t, 'PAYMENT_RECEIVED', 'confirmed', null);
  perform pg_temp.act(pg_temp.ctx('owner'));
  j := public.restaurant_get_payment_statement(o.restaurant_id);
  select e into x from jsonb_array_elements(j->'payments') e where e->>'paymentId' = t::text;
  assert (x->>'netCents')::bigint = (x->>'paidCents')::bigint - v_fee - 200, 'líquido sem a conveniência: ' || x;
  select noowe_split_cents into v_split from private.noowe_report_payment_margin where payment_id = t;
  assert v_split = private.noowe_pay_split_cents(v_fee, 100), 'margem sem conveniência';
end $$;
select pass('extrato e margem separam a conveniência, congelada na cobrança');

select * from finish();
rollback;
