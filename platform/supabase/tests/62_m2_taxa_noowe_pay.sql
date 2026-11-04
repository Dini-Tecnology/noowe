-- M2: um teste por critério. Taxa única por meio, split pela tarifa real, razão de compensação e extrato.
begin;
select plan(15);

create function pg_temp.act(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true) $$;
create function pg_temp.state_of(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ok'; exception when sqlstate 'P0004' then return 'P0004'; when others then return sqlstate; end $$;
create temp table _ctx(k text primary key, v uuid);
create function pg_temp.ctx(p text) returns uuid language sql as $$ select v from _ctx where k = p $$;

-- Parcela em comanda: uma pessoa, consumo em centavos.
create function pg_temp.share(p_cents bigint, p_method text default 'credit_card') returns public.gateway_transactions language plpgsql as $$
declare r uuid := pg_temp.ctx('r'); c uuid := gen_random_uuid(); tbl jsonb; sid uuid; o uuid; menu uuid; sh public.bill_shares;
begin
  insert into auth.users(id, email) values (c, c || '@m2.test');
  insert into public.profiles(id) values (c) on conflict do nothing;
  perform pg_temp.act(pg_temp.ctx('dono'));
  tbl := public.restaurant_create_table(r, 'm2-' || c, 4);
  select id into menu from public.menu_items where restaurant_id = r limit 1;
  perform pg_temp.act(c);
  sid := (public.customer_open_table_session(tbl->>'qr_code')->>'tableSessionId')::uuid;
  insert into public.orders(restaurant_id, customer_id, table_session_id) values (r, c, sid) returning id into o;
  insert into public.order_items(order_id, menu_item_id, quantity, unit_price, total_price, total_price_cents) values (o, menu, 1, p_cents::numeric / 100, p_cents::numeric / 100, p_cents);
  perform public.customer_bill_split_commit(sid, 'equal', '{}', null, gen_random_uuid());
  select * into sh from public.bill_shares where table_session_id = sid and status = 'open';
  return private.reserve_share_payment(c, sh.id, p_method, 0, gen_random_uuid(), 'asaas');
end $$;
create function pg_temp.fee(p_tx uuid) returns private.noowe_pay_transaction_fees language sql as $$
  select * from private.noowe_pay_transaction_fees where gateway_transaction_id = p_tx $$;

do $$
declare r uuid := 'c1000000-0000-4000-8000-000000000002'; g uuid := gen_random_uuid();
begin
  insert into _ctx values ('r', r), ('dono', 'c1000000-0000-4000-8000-000000000001'), ('gerente', g);
  insert into public.restaurant_payment_accounts(restaurant_id, provider, status) values (r, 'asaas', 'active') on conflict do nothing;
  update public.restaurant_payment_accounts set status = 'active' where restaurant_id = r;
  -- Sem taxa de serviço nestes cenários: o valor da parcela é o consumo.
  update public.restaurant_model_policies set fee_or_tip_mode = 'tip', split_modes = '{by_owner,equal,by_item,fixed_amount}' where restaurant_id = r and not prepaid_required;
  perform set_config('noowe.param_author', 'teste M2', true);
  delete from private.noowe_pay_rates where restaurant_id = r;
  update private.noowe_pay_rates set rate_bps = 349 where payment_method = 'credit_card' and restaurant_id is null;
  update private.noowe_pay_rates set rate_bps = 99 where payment_method = 'pix' and restaurant_id is null;
  insert into auth.users(id, email) values (g, g || '@m2.test');
  insert into public.profiles(id) values (g) on conflict do nothing;
  insert into public.user_roles(user_id, restaurant_id, role, is_active) values (g, r, 'manager', true);
end $$;

-- Critérios 1, 2 e 9
do $$
declare t public.gateway_transactions := pg_temp.share(11000); f private.noowe_pay_transaction_fees; j jsonb;
begin
  f := pg_temp.fee(t.id);
  assert f.rate_bps = 349 and f.fee_cents = 384, 'taxa de 3,49% sobre R$ 110: R$ 3,84';
  j := public.service_payment_set_split(t.id, 10622);
  assert (j->>'splitCents')::bigint = 6, 'tarifa de 3,78: split de R$ 0,06';
  f := pg_temp.fee(t.id);
  assert f.tariff_cents = 378 and f.split_cents = 6, 'guarda a tarifa e o split';
  assert t.amount_cents - f.fee_cents = 10616, 'líquido do restaurante: R$ 106,16';
  j := public.service_payment_set_split(t.id, 10622);
  assert (j->>'splitCents')::bigint = 6, 'repetir dá o mesmo split';
  insert into _ctx values ('card', t.id);
end $$;
select pass('critérios 1 e 9: R$ 110 no crédito dá R$ 3,84, R$ 0,06 e R$ 106,16, com a taxa e a tarifa guardadas');

do $$
declare r uuid := pg_temp.ctx('r'); t public.gateway_transactions;
begin
  -- Gorjeta entra na base.
  t := pg_temp.share(10000);
  assert (pg_temp.fee(t.id)).fee_cents = 349, 'sobre o valor pago';
  -- Mudar a tabela não reescreve o que já foi cobrado.
  perform set_config('noowe.param_author', 'teste M2', true);
  update private.noowe_pay_rates set rate_bps = 500 where payment_method = 'credit_card' and restaurant_id is null;
  assert (pg_temp.fee(t.id)).rate_bps = 349, 'o valor aplicado fica congelado';
  update private.noowe_pay_rates set rate_bps = 349 where payment_method = 'credit_card' and restaurant_id is null;
  -- Taxa específica do restaurante prevalece.
  insert into private.noowe_pay_rates(payment_method, restaurant_id, rate_bps) values ('credit_card', r, 200);
  t := pg_temp.share(10000);
  assert (pg_temp.fee(t.id)).rate_bps = 200, 'restaurante com taxa própria';
  delete from private.noowe_pay_rates where restaurant_id = r;
end $$;
select pass('critério 2 e 9: a taxa incide sobre o valor pago e fica congelada; o valor do restaurante prevalece');

-- Valor com gorjeta entra na base da taxa.
do $$
declare t public.gateway_transactions; sh public.bill_shares; c uuid;
begin
  update public.restaurant_model_policies set fee_or_tip_mode = 'tip' where restaurant_id = pg_temp.ctx('r') and not prepaid_required;
  t := pg_temp.share(10000);
  select * into sh from public.bill_shares where id = t.bill_share_id;
  c := t.customer_id;
  perform private.apply_payment_event(t.id, 'asaas', 'x-' || t.id, 'FAILED', 'failed');
  t := private.reserve_share_payment(c, sh.id, 'credit_card', 1000, gen_random_uuid(), 'asaas');
  assert t.amount_cents = 11000 and (pg_temp.fee(t.id)).amount_cents = 11000 and (pg_temp.fee(t.id)).fee_cents = 384, 'consumo mais gorjeta';
  insert into _ctx values ('with_tip', t.id);
end $$;
select pass('critério 2: a taxa incide sobre consumo mais gorjeta');

-- Meio sem taxa definida é recusado, nunca zero.
do $$
begin
  perform set_config('noowe.param_author', 'teste M2', true);
  delete from private.noowe_pay_rates where payment_method = 'pix';
  assert pg_temp.state_of($q$select pg_temp.share(5000, 'pix')$q$) = 'P0007', 'sem taxa, recusa';
  insert into private.noowe_pay_rates(payment_method, rate_bps) values ('pix', 99);
end $$;
select pass('critério 9: meio sem taxa definida é recusado');

-- Mínimo do provedor.
do $$
begin
  assert pg_temp.state_of($q$select pg_temp.share(499)$q$) = 'P0013', 'abaixo de R$ 5 não chega ao provedor';
  assert (pg_temp.share(500)).amount_cents = 500, 'R$ 5 passa';
end $$;
select pass('valor abaixo do mínimo do provedor é recusado antes da cobrança');

-- Critério 3
do $$
declare t public.gateway_transactions := pg_temp.share(5000, 'pix'); f private.noowe_pay_transaction_fees;
begin
  assert (public.service_payment_set_split(t.id, 4901)->>'splitCents')::bigint = 0, 'Pix de R$ 50: tarifa de 0,99 e taxa de 0,50: split zero';
  assert not exists (select 1 from private.noowe_pay_compensations where gateway_transaction_id = t.id), 'sem pagamento, nada a compensar';
  perform private.apply_payment_event(t.id, 'asaas', 'ok-' || t.id, 'RECEIVED', 'confirmed', t.amount_cents);
  assert (select amount_cents from private.noowe_pay_compensations where gateway_transaction_id = t.id and kind = 'tariff_over_fee') = 49, 'a diferença entra no razão';
  perform private.apply_payment_event(t.id, 'asaas', 'ok2-' || t.id, 'RECEIVED', 'confirmed', t.amount_cents);
  assert (select count(*) from private.noowe_pay_compensations where gateway_transaction_id = t.id) = 1, 'repetir não lança de novo';
  assert exists (select 1 from private.noowe_report_compensations where restaurant_id = t.restaurant_id and kind = 'tariff_over_fee' and status = 'open'), 'consulta interna';
  insert into _ctx values ('pix', t.id);
end $$;
select pass('critério 3 e 11: tarifa acima da taxa: split zero e lançamento no razão');

-- Critério 7
do $$
declare r uuid := pg_temp.ctx('r'); c uuid := gen_random_uuid(); tbl jsonb; sid uuid; o uuid; menu uuid; res jsonb;
begin
  insert into auth.users(id, email) values (c, c || '@m2.test');
  insert into public.profiles(id) values (c) on conflict do nothing;
  perform pg_temp.act(pg_temp.ctx('dono'));
  tbl := public.restaurant_create_table(r, 'm2-' || c, 4);
  select id into menu from public.menu_items where restaurant_id = r limit 1;
  perform pg_temp.act(c);
  sid := (public.customer_open_table_session(tbl->>'qr_code')->>'tableSessionId')::uuid;
  insert into public.orders(restaurant_id, customer_id, table_session_id) values (r, c, sid) returning id into o;
  insert into public.order_items(order_id, menu_item_id, quantity, unit_price, total_price, total_price_cents) values (o, menu, 1, 30, 30, 3000);
  perform pg_temp.act(pg_temp.ctx('dono'));
  res := public.restaurant_record_bill_payment(sid, 'cash', gen_random_uuid(), 1000);
  assert not exists (select 1 from private.noowe_pay_transaction_fees where gateway_transaction_id = (res->>'transactionId')::uuid), 'dinheiro sem taxa';
  res := public.restaurant_record_bill_payment(sid, 'credit_card', gen_random_uuid());
  assert not exists (select 1 from private.noowe_pay_transaction_fees where gateway_transaction_id = (res->>'transactionId')::uuid), 'maquininha da casa sem taxa';
end $$;
select pass('critério 7: dinheiro e maquininha da casa não geram taxa');

-- Critério 8
do $$
declare t public.gateway_transactions; r uuid := pg_temp.ctx('r'); rid uuid;
begin
  -- Total, no mesmo dia: a taxa volta, e a NOOWE assume a tarifa.
  t := pg_temp.share(5000, 'pix');
  perform public.service_payment_set_split(t.id, 4901);
  perform private.apply_payment_event(t.id, 'asaas', 'ok-' || t.id, 'RECEIVED', 'confirmed', t.amount_cents);
  perform private.apply_payment_event(t.id, 'asaas', 're-' || t.id, 'PAYMENT_REFUNDED', 'refunded', null, '{}', 'refunded');
  assert (pg_temp.fee(t.id)).fee_returned, 'mesmo dia: a taxa volta';
  assert (select status from private.noowe_pay_compensations where gateway_transaction_id = t.id) = 'voided', 'e a diferença não fica com o restaurante';
  -- Total, depois do dia: a taxa não volta. O Asaas cancela o split, então o valor vai para o razão.
  t := pg_temp.share(11000);
  perform public.service_payment_set_split(t.id, 10622);
  perform private.apply_payment_event(t.id, 'asaas', 'ok-' || t.id, 'RECEIVED', 'confirmed', t.amount_cents);
  update public.gateway_transactions set confirmed_at = now() - interval '5 days' where id = t.id;
  perform private.operational_day_current(r);
  update public.operational_days set started_at = now() - interval '1 hour' where restaurant_id = r and status = 'open';
  perform private.apply_payment_event(t.id, 'asaas', 're-' || t.id, 'PAYMENT_REFUNDED', 'refunded', null, '{}', 'refunded');
  assert not (pg_temp.fee(t.id)).fee_returned, 'depois do dia: não volta';
  assert (select amount_cents from private.noowe_pay_compensations where gateway_transaction_id = t.id and kind = 'fee_kept_on_refund') = 6, 'o split cancelado vai para o razão';
  -- Parcial: não volta.
  t := pg_temp.share(11000);
  perform public.service_payment_set_split(t.id, 10622);
  perform private.apply_payment_event(t.id, 'asaas', 'ok-' || t.id, 'RECEIVED', 'confirmed', t.amount_cents);
  perform pg_temp.act(pg_temp.ctx('dono'));
  perform public.restaurant_request_refund(t.id, 'Parte', 1000);
  select id into rid from public.payment_refunds where gateway_transaction_id = t.id;
  perform public.service_refund_claim(rid);
  perform public.service_refund_record(rid, 'sent');
  perform private.apply_payment_event(t.id, 'asaas', 'pr-' || t.id, 'PAYMENT_PARTIALLY_REFUNDED', 'refunded', null, '{}', 'partially_refunded');
  assert (pg_temp.fee(t.id)).fee_returned is null, 'parcial: nada muda na taxa';
  assert not exists (select 1 from private.noowe_pay_compensations where gateway_transaction_id = t.id and kind = 'fee_kept_on_refund'), 'o split segue';
  -- Contestação: não volta.
  t := pg_temp.share(11000);
  perform public.service_payment_mark_chargeback(t.id);
  assert not (pg_temp.fee(t.id)).fee_returned and (pg_temp.fee(t.id)).chargeback_at is not null, 'contestação não devolve a taxa';
  -- Estorno parcial no mesmo dia, de cartão: espera o dia seguinte, sem gastar tentativa nem virar falha.
  t := pg_temp.share(11000);
  perform public.service_payment_set_split(t.id, 10622);
  perform private.apply_payment_event(t.id, 'asaas', 'ok-' || t.id, 'RECEIVED', 'confirmed', t.amount_cents);
  perform pg_temp.act(pg_temp.ctx('dono'));
  perform public.restaurant_request_refund(t.id, 'Parte', 1000);
  select id into rid from public.payment_refunds where gateway_transaction_id = t.id;
  perform public.service_refund_claim(rid);
  perform public.service_refund_record(rid, 'deferred', 'amanhã');
  assert (select status from public.payment_refunds where id = rid) = 'pending' and (select attempts from public.payment_refunds where id = rid) = 0, 'não é falha';
  assert (select next_attempt_at from public.payment_refunds where id = rid) > now() + interval '1 hour', 'volta amanhã';
end $$;
select pass('critério 8: estorno total no mesmo dia devolve a taxa; depois do dia, parcial ou contestação, não');

-- Critérios 4 e 5
do $$
declare r uuid := pg_temp.ctx('r'); st jsonb; p jsonb; tx uuid := pg_temp.ctx('card');
begin
  perform private.apply_payment_event(tx, 'asaas', 'ok-' || tx, 'RECEIVED', 'confirmed', 11000);
  perform pg_temp.act(pg_temp.ctx('dono'));
  st := public.restaurant_get_payment_statement(r);
  select x into p from jsonb_array_elements(st->'payments') x where (x->>'paymentId')::uuid = tx;
  assert (p->>'paidCents')::bigint = 11000 and (p->>'feeCents')::bigint = 384 and (p->>'netCents')::bigint = 10616, 'valor pago, taxa e líquido';
  assert not (p ? 'tariffCents') and not (p ? 'splitCents') and st::text !~* 'tariff|split|margin', 'tarifa e margem não saem daqui';
  perform pg_temp.act(pg_temp.ctx('gerente'));
  assert pg_temp.state_of(format($q$select public.restaurant_get_payment_statement(%L)$q$, r)) = '42501', 'gerente não vê a taxa por pagamento';
end $$;
select pass('critérios 4 e 5: extrato do Dono com valor, taxa e líquido; gerente não vê; tarifa e margem não saem');

select ok(not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'gateway_transactions'
  and column_name in ('tariff_cents', 'fee_cents', 'split_cents', 'rate_bps')), 'critério 5: cliente e equipe não leem taxa nem tarifa na transação');
select ok(not (private.payment_json((select g from public.gateway_transactions g where g.id = pg_temp.ctx('card'))) ? 'platformFeeCents'), 'nem na resposta da cobrança');

-- Critério 6
do $$
declare r uuid := pg_temp.ctx('r'); tx uuid := pg_temp.ctx('with_tip'); v bigint;
begin
  perform private.apply_payment_event(tx, 'asaas', 'ok-' || tx, 'RECEIVED', 'confirmed', 11000);
  v := private.noowe_pay_fee_on_tips(r, now() - interval '1 hour', now() + interval '1 hour');
  assert v >= 35, 'R$ 3,84 de taxa sobre R$ 110, com R$ 10 de gorjeta: R$ 0,35: ' || v;
end $$;
select pass('critério 6: o relatório separa a parte da taxa referente à gorjeta');

-- Critério 10
select ok(not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'restaurant_payment_accounts' and column_name = 'platform_fee_bps')
  and to_regclass('private.payment_platform_config') is null and to_regprocedure('private.platform_fee_bps()') is null, 'critério 10: a comissão única saiu');

-- Critério 11
select ok(exists (select 1 from information_schema.columns where table_schema = 'private' and table_name = 'noowe_report_payment_margin' and column_name = 'tariff_cents')
  and exists (select 1 from information_schema.columns where table_schema = 'private' and table_name = 'noowe_report_payment_margin' and column_name = 'fee_cents'), 'critério 11: a consulta de margem traz taxa e tarifa');
select ok(not has_table_privilege('authenticated', 'private.noowe_pay_transaction_fees', 'SELECT') and not has_table_privilege('authenticated', 'private.noowe_pay_compensations', 'SELECT'), 'as tabelas de margem não abrem para o app');

select * from finish();
rollback;
