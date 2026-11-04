-- V1 e T1: vale na maquininha da casa e Tap pronto para ativar.
begin;
select plan(13);
create function pg_temp.act(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true) $$;
create function pg_temp.state_of(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ok'; exception when sqlstate 'P0004' then return 'P0004'; when others then return sqlstate; end $$;
create temp table _ctx(k text primary key, v uuid);
create function pg_temp.ctx(p text) returns uuid language sql as $$ select v from _ctx where k = p $$;
create function pg_temp.session(p_cents bigint) returns uuid language plpgsql as $$
declare r uuid := pg_temp.ctx('r'); c uuid := gen_random_uuid(); tbl jsonb; sid uuid; o uuid; menu uuid;
begin
  insert into auth.users(id, email) values (c, c || '@v1.test');
  insert into public.profiles(id) values (c) on conflict do nothing;
  perform pg_temp.act(pg_temp.ctx('dono'));
  tbl := public.restaurant_create_table(r, 'v1-' || c, 4);
  select id into menu from public.menu_items where restaurant_id = r limit 1;
  perform pg_temp.act(c);
  sid := (public.customer_open_table_session(tbl->>'qr_code')->>'tableSessionId')::uuid;
  insert into public.orders(restaurant_id, customer_id, table_session_id) values (r, c, sid) returning id into o;
  insert into public.order_items(order_id, menu_item_id, quantity, unit_price, total_price, total_price_cents) values (o, menu, 1, p_cents::numeric / 100, p_cents::numeric / 100, p_cents);
  perform pg_temp.act(pg_temp.ctx('dono'));
  return sid;
end $$;

do $$
declare r uuid := 'c1000000-0000-4000-8000-000000000002'; g uuid := gen_random_uuid();
begin
  insert into _ctx values ('r', r), ('dono', 'c1000000-0000-4000-8000-000000000001'), ('gerente', g);
  update public.restaurant_model_policies set fee_or_tip_mode = 'tip', split_modes = '{by_owner,equal,by_item,fixed_amount}' where restaurant_id = r and not prepaid_required;
  perform pg_temp.act(pg_temp.ctx('dono'));
  insert into auth.users(id, email) values (g, g || '@v1.test');
  insert into public.profiles(id) values (g) on conflict do nothing;
  insert into public.user_roles(user_id, restaurant_id, role, is_active) values (g, r, 'manager', true);
end $$;

-- V1, critério 2
do $$
declare r uuid := pg_temp.ctx('r');
begin
  assert (select accepted_vouchers from public.restaurants where id = r) = '{refeicao}', 'padrão: vale-refeição';
  perform pg_temp.act(pg_temp.ctx('gerente'));
  assert pg_temp.state_of(format($q$select public.restaurant_set_accepted_vouchers(%L, '{alimentacao}')$q$, r)) = '42501', 'só o Dono escolhe';
  perform pg_temp.act(pg_temp.ctx('dono'));
  assert pg_temp.state_of(format($q$select public.restaurant_set_accepted_vouchers(%L, '{cheque}')$q$, r)) = '22023', 'vale conhecido';
  perform public.restaurant_set_accepted_vouchers(r, '{refeicao}');
  assert exists (select 1 from public.audit_logs where action = 'restaurant.vouchers_changed' and entity_id = r), 'registrado';
end $$;
select pass('V1, critério 2: o Dono escolhe quais vales aceita');

-- V1, critérios 1 e 4
do $$
declare sid uuid := pg_temp.session(5000); res jsonb; g public.gateway_transactions;
begin
  assert pg_temp.state_of(format($q$select public.restaurant_record_bill_payment(%L, 'voucher', %L, 1000)$q$, sid, gen_random_uuid())) = '22023', 'sem dizer o vale, não registra';
  assert pg_temp.state_of(format($q$select public.restaurant_record_bill_payment(%L, 'voucher', %L, 1000, false, 0, null, 'alimentacao')$q$, sid, gen_random_uuid())) = '22023', 'vale não aceito';
  -- Misto: cartão só na gorjeta; vale no consumo.
  res := public.restaurant_record_bill_payment(sid, 'credit_card', gen_random_uuid(), 0, false, 500);
  assert (res->>'amountCents')::bigint = 500 and private.session_consumption_balance(sid) = 5000, 'gorjeta não abate consumo';
  res := public.restaurant_record_bill_payment(sid, 'voucher', gen_random_uuid(), 5000, false, 0, null, 'refeicao');
  select * into g from public.gateway_transactions where id = (res->>'transactionId')::uuid;
  assert g.payment_method = 'voucher' and g.provider = 'manual' and (g.metadata->>'voucher_kind') = 'refeicao' and (g.metadata->>'external')::boolean, 'maquininha – vale';
  assert not exists (select 1 from private.noowe_pay_transaction_fees where gateway_transaction_id = g.id), 'sem taxa NOOWE';
  assert (select status from public.table_sessions where id = sid) = 'ended', 'abate o saldo e fecha';
end $$;
select pass('V1, critérios 1 e 4: vale na maquininha abate o saldo, sem taxa; misto com cartão na gorjeta');

-- T1, critério 1: sem fornecedor, nada abre.
do $$
declare sid uuid := pg_temp.session(5000); u uuid := pg_temp.ctx('gerente');
begin
  assert not private.tap_provider_active(), 'hoje sem fornecedor';
  assert pg_temp.state_of(format($q$select public.service_tap_begin(%L, %L, %L)$q$, u, sid, gen_random_uuid())) = 'P0007', 'servidor recusa';
  assert public.service_tap_provider() is null, 'nenhum fornecedor';
  assert not (public.restaurant_get_payment_options(pg_temp.ctx('r'))->>'tapActive')::boolean, 'a tela não mostra';
  update public.table_sessions set status = 'active' where id = sid;
end $$;
select pass('T1, critério 1: sem fornecedor ativo, o Tap não abre');

-- Liga o fornecedor por parâmetro: critérios 2, 4, 6 e 7.
do $$
declare r uuid := pg_temp.ctx('r');
begin
  perform set_config('noowe.param_author', 'teste T1', true);
  update private.noowe_tap_settings set provider = 'fake', active = true;
  if not exists (select 1 from private.noowe_pay_rates where payment_method = 'tap_card' and restaurant_id is null) then
    insert into private.noowe_pay_rates(payment_method, rate_bps) values ('tap_card', 299);
  end if;
  assert (public.restaurant_get_payment_options(r)->>'tapActive')::boolean, 'ligar não exige nova versão';
end $$;
select pass('T1, critérios 2 e 6: o fornecedor fica em parâmetro, e ligar aparece sem nova versão');

do $$
declare sid uuid := pg_temp.session(5000); u uuid := pg_temp.ctx('gerente'); j jsonb; p uuid; key uuid := gen_random_uuid(); c uuid := gen_random_uuid();
begin
  assert pg_temp.state_of(format($q$select public.service_tap_begin(%L, %L, %L)$q$, c, sid, gen_random_uuid())) = '42501', 'só a equipe';
  j := public.service_tap_begin(u, sid, key, 2000);
  p := (j->>'paymentId')::uuid;
  assert (j->>'amountCents')::bigint = 2000 and j->>'provider' = 'tap', 'valor do servidor';
  assert private.session_consumption_balance(sid) = 3000, 'reservado durante a cobrança';
  -- Critério 7: repetir não cobra de novo.
  assert (public.service_tap_begin(u, sid, key, 2000)->>'paymentId')::uuid = p, 'reenvio devolve a mesma cobrança';
  assert (select count(*) from public.bill_shares where table_session_id = sid) = 1, 'sem segunda reserva';
  -- Recusado não abate nada.
  perform public.service_tap_result(p, 'e1', false);
  assert private.session_consumption_balance(sid) = 5000, 'recusado devolve o saldo';
  -- Aprovado abate, e a taxa e a tarifa ficam no extrato.
  j := public.service_tap_begin(u, sid, gen_random_uuid());
  p := (j->>'paymentId')::uuid;
  perform public.service_tap_result(p, 'e2', true, 5000, 100);
  perform public.service_tap_result(p, 'e2', true, 5000, 100);
  assert (select status from public.table_sessions where id = sid) = 'ended', 'aprovado abate e fecha';
  assert (select sum(base_cents) from public.bill_shares where table_session_id = sid and status = 'paid') = 5000, 'consumo exato, sem repetir';
  assert (select tariff_cents from private.noowe_pay_transaction_fees where gateway_transaction_id = p) = 100, 'tarifa do fornecedor';
  perform pg_temp.act(pg_temp.ctx('dono'));
  assert exists (select 1 from jsonb_array_elements(public.restaurant_get_payment_statement(pg_temp.ctx('r'))->'payments') x where (x->>'paymentId')::uuid = p), 'no extrato do Dono';
end $$;
select pass('T1, critérios 4 e 7: cobrar, aprovar ou recusar; recusado não abate; reenviar não cobra de novo');

-- Valor que o fornecedor diz diferente do cobrado não fecha nada.
do $$
declare sid uuid := pg_temp.session(5000); j jsonb;
begin
  j := public.service_tap_begin(pg_temp.ctx('gerente'), sid, gen_random_uuid());
  perform public.service_tap_result((j->>'paymentId')::uuid, 'e9', true, 1);
  assert (select status from public.table_sessions where id = sid) = 'active', 'valor divergente não confirma';
end $$;
select pass('valor divergente do fornecedor não confirma');

-- Critério 5: até a ativação, é maquininha da casa: sem taxa NOOWE e fora do índice.
do $$
declare sid uuid := pg_temp.session(5000); j jsonb; t uuid;
begin
  perform pg_temp.act(pg_temp.ctx('gerente'));
  j := public.restaurant_record_bill_payment(sid, 'credit_card', gen_random_uuid());
  t := (j->>'transactionId')::uuid;
  assert (select provider from public.gateway_transactions where id = t) = 'manual', 'externo';
  assert not exists (select 1 from private.noowe_pay_transaction_fees where gateway_transaction_id = t), 'sem taxa NOOWE';
end $$;
select pass('T1, critério 5: até a ativação, o garçom registra como maquininha da casa, sem taxa NOOWE');
select ok(not has_function_privilege('authenticated', 'public.service_tap_begin(uuid,uuid,uuid,bigint,boolean,bigint,text,text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.service_tap_result(uuid,text,boolean,bigint,bigint)', 'EXECUTE'), 'as portas do Tap não abrem para o app');
select ok(not has_table_privilege('authenticated', 'private.noowe_tap_settings', 'SELECT'), 'nem o parâmetro');
select is(jsonb_typeof(public.restaurant_get_payment_options('c1000000-0000-4000-8000-000000000002')->'acceptedVouchers'), 'array', 'vales aceitos na tela');

-- Revisão: ligar respeita plano e taxa, retirar a taxa fica registrado, e repetir devolve os dados guardados.
do $$
declare sid uuid; r uuid := pg_temp.ctx('r'); u uuid := pg_temp.ctx('gerente'); j jsonb; p uuid; key uuid := gen_random_uuid(); v_bps int;
begin
  update public.restaurant_model_policies set fee_or_tip_mode = 'service_fee', service_fee_bps = 1000 where restaurant_id = r;
  sid := pg_temp.session(5000);
  -- Sem a taxa cadastrada, nem o botão aparece.
  select rate_bps into v_bps from private.noowe_pay_rates where payment_method = 'tap_card' and restaurant_id is null;
  perform set_config('noowe.param_author', 'teste T1', true);
  delete from private.noowe_pay_rates where payment_method = 'tap_card';
  assert not (public.restaurant_get_payment_options(r)->>'tapActive')::boolean, 'sem taxa, sem botão';
  assert pg_temp.state_of(format($q$select public.service_tap_begin(%L, %L, %L)$q$, u, sid, gen_random_uuid())) = 'P0007', 'sem taxa, sem cobrança';
  insert into private.noowe_pay_rates(payment_method, rate_bps) values ('tap_card', v_bps);
  -- Plano que não inclui.
  perform pg_temp.act(pg_temp.ctx('dono'));
  insert into public.restaurant_subscriptions(restaurant_id, plan_code, status, billing_cycle, current_period_end)
    values (r, 'essencial', 'active', 'monthly', now() + interval '30 days')
    on conflict (restaurant_id) do update set plan_code = excluded.plan_code, status = 'active';
  assert not (public.restaurant_get_payment_options(r)->>'tapActive')::boolean, 'plano sem Tap não mostra';
  assert pg_temp.state_of(format($q$select public.service_tap_begin(%L, %L, %L)$q$, u, sid, gen_random_uuid())) = 'P0007', 'plano sem Tap não cobra';
  delete from public.restaurant_subscriptions where restaurant_id = r;
  -- Retirar a taxa deixa rastro, com o motivo.
  j := public.service_tap_begin(u, sid, key, 2000, true, 0, 'Cliente reclamou');
  p := (j->>'paymentId')::uuid;
  assert (select fee_waived_reason from public.bill_shares where payment_id = p) = 'Cliente reclamou', 'motivo';
  assert exists (select 1 from public.audit_logs a where a.action = 'bill.fee_waived' and a.user_id = u and a.reason = 'Cliente reclamou'), 'rastro';
  -- Repetir devolve o que o fornecedor deu.
  perform public.service_tap_started(p, 'ref-1', '{"token":"sdk"}');
  j := public.service_tap_begin(u, sid, key, 2000, true, 0, 'Cliente reclamou');
  assert j->>'providerRef' = 'ref-1' and j->'sdkPayload'->>'token' = 'sdk', 'dados guardados: ' || j;
  -- Aprovação sem valor não confirma.
  assert pg_temp.state_of(format($q$select public.service_tap_result(%L, 'e-sem', true)$q$, p)) = '22023', 'sem valor não confirma';
end $$;
select pass('ligar o Tap respeita plano e taxa; retirar a taxa fica registrado; repetir devolve os dados guardados');

-- A nota diz o vale certo; parcela só de gorjeta não vira forma de pagamento; estorno de Tap acha a referência.
do $$
declare r uuid := pg_temp.ctx('r'); sid uuid := pg_temp.session(5000); d public.fiscal_documents; v_id uuid;
begin
  perform pg_temp.act(pg_temp.ctx('dono'));
  perform public.restaurant_set_accepted_vouchers(r, '{alimentacao,refeicao}');
  update public.restaurant_model_policies set fee_or_tip_mode = 'tip', service_fee_bps = 0 where restaurant_id = r and service_model = (select service_model from public.table_sessions where id = sid);
  perform pg_temp.act(pg_temp.ctx('gerente'));
  assert pg_temp.state_of(format($q$select public.restaurant_record_bill_payment(%L, 'credit_card', %L, 0, false, 500001)$q$, sid, gen_random_uuid())) = '22023', 'gorjeta sem consumo tem teto';
  perform public.restaurant_record_bill_payment(sid, 'credit_card', gen_random_uuid(), 0, false, 500);
  perform public.restaurant_record_bill_payment(sid, 'voucher', gen_random_uuid(), null, false, 0, null, 'alimentacao');
  v_id := private.fiscal_enqueue_session(sid);
  select * into d from public.fiscal_documents where table_session_id = sid;
  assert d.snapshot->'payments' = '[{"method":"voucher_alimentacao","weightCents":5000}]'::jsonb, 'só o vale, com o tipo: ' || (d.snapshot->'payments')::text;
end $$;
select pass('a nota declara o tipo do vale, e gorjeta só no cartão não vira forma de pagamento');

-- O Gerente não muda parâmetro comercial direto na tabela, e valor desconhecido nem grava.
do $$
declare r uuid := pg_temp.ctx('r'); v_state text;
begin
  perform pg_temp.act(pg_temp.ctx('gerente'));
  set local role authenticated;
  begin
    update public.restaurants set accepted_vouchers = '{refeicao}' where id = r;
    v_state := 'ok';
  exception when others then v_state := sqlstate;
  end;
  reset role;
  assert v_state = '42501', 'vales: ' || v_state;
  set local role authenticated;
  begin
    update public.restaurants set noowe_category = 'Parceiro Fundador' where id = r;
    v_state := 'ok';
  exception when others then v_state := sqlstate;
  end;
  reset role;
  assert v_state = '42501', 'categoria: ' || v_state;
  assert pg_temp.state_of(format($q$update public.restaurants set accepted_vouchers = '{cheque}' where id = %L$q$, r)) = '23514', 'valor desconhecido';
end $$;
select pass('parâmetros comerciais do restaurante só mudam pelas funções');

select * from finish();
rollback;
