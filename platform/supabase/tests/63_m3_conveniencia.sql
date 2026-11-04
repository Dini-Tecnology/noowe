-- M3: taxa de conveniência. Pronta e desligada; aqui ela é ligada só dentro da transação do teste.
begin;
select plan(8);
create function pg_temp.act(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true) $$;
create function pg_temp.state_of(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ok'; exception when sqlstate 'P0004' then return 'P0004'; when others then return sqlstate; end $$;
create temp table _ctx(k text primary key, v uuid);
create function pg_temp.ctx(p text) returns uuid language sql as $$ select v from _ctx where k = p $$;
create function pg_temp.new_order(p_cents bigint, p_scheduled boolean default false) returns uuid language plpgsql as $$
declare r uuid := pg_temp.ctx('r'); c uuid := gen_random_uuid(); o uuid;
begin
  insert into auth.users(id, email) values (c, c || '@m3.test');
  insert into public.profiles(id) values (c) on conflict do nothing;
  insert into public.orders(restaurant_id, customer_id, service_model, order_type, total_cents, payment_status, pickup_slot_start)
    values (r, c, 'quick_service', 'pickup', p_cents, 'pending', case when p_scheduled then now() + interval '1 day' end) returning id into o;
  insert into _ctx values ('customer:' || o, c);
  return o;
end $$;

do $$
declare r uuid := 'c1000000-0000-4000-8000-000000000002';
begin
  insert into _ctx values ('r', r), ('dono', 'c1000000-0000-4000-8000-000000000001');
  update public.restaurant_model_configs set service_models = array['casual_dining','quick_service']::public.noowe_service_model[] where restaurant_id = r;
  update public.restaurant_model_policies set fee_or_tip_mode = 'tip' where restaurant_id = r;
  insert into public.restaurant_payment_accounts(restaurant_id, provider, status) values (r, 'asaas', 'active') on conflict do nothing;
  update public.restaurant_payment_accounts set status = 'active' where restaurant_id = r;
  update public.restaurants set convenience_absorbed = false where id = r;
  perform set_config('noowe.param_author', 'teste M3', true);
  update private.noowe_pay_rates set rate_bps = 349 where payment_method = 'credit_card' and restaurant_id is null;
end $$;

-- Critério 6: desligada, nada muda.
do $$
declare o uuid := pg_temp.new_order(3000); j jsonb; c uuid; v jsonb;
begin
  c := pg_temp.ctx('customer:' || o);
  j := public.service_payment_reserve_order(c, o, 'credit_card', gen_random_uuid());
  assert (j->>'amountCents')::bigint = 3000, 'desligada: só o pedido';
  assert (public.service_payment_set_split((j->>'paymentId')::uuid, 2900)->>'splitCents')::bigint = 5, 'split só da taxa';
  perform pg_temp.act(c);
  v := public.customer_checkout_quote(pg_temp.ctx('r'), 3000);
  assert (v->>'convenienceCents')::bigint = 0 and (v->>'totalCents')::bigint = 3000, 'a tela não mostra a linha';
end $$;
select pass('critério 6: com a taxa em zero ou desligada, a linha não aparece e o split não muda');

do $$
begin
  perform set_config('noowe.param_author', 'teste M3', true);
  update private.noowe_convenience_fees set fee_cents = 99, enabled = true where restaurant_id is null;
end $$;

-- Critérios 2, 3 e 5
do $$
declare o uuid := pg_temp.new_order(3000); c uuid; j jsonb; p uuid; d uuid; f private.noowe_pay_transaction_fees;
begin
  c := pg_temp.ctx('customer:' || o);
  j := public.service_payment_reserve_order(c, o, 'credit_card', gen_random_uuid());
  p := (j->>'paymentId')::uuid;
  assert (j->>'amountCents')::bigint = 3099, 'o total conferido no servidor inclui a taxa';
  assert (select convenience_fee_cents from public.orders where id = o) = 99, 'copiada para o pedido';
  assert (select total_cents from public.orders where id = o) = 3000, 'fora do total do restaurante';
  select * into f from private.noowe_pay_transaction_fees where gateway_transaction_id = p;
  assert f.fee_cents = div(3000 * 349 + 5000, 10000), 'fora da base da taxa NOOWE Pay';
  assert (public.service_payment_set_split(p, 2999)->>'splitCents')::bigint = 99 + greatest(0, f.fee_cents - 100), 'vai 100% no split, somada à taxa';
  -- Fora da nota.
  perform private.apply_payment_event(p, 'asaas', 'ok-' || p, 'RECEIVED', 'confirmed', 3099);
  delete from public.fiscal_documents where order_id = o;
  insert into public.order_items(order_id, menu_item_id, quantity, unit_price, total_price, total_price_cents)
    select o, id, 1, 30, 30, 3000 from public.menu_items where restaurant_id = pg_temp.ctx('r') limit 1;
  d := private.fiscal_enqueue_order(o);
  assert (select sum((x->>'weightCents')::bigint) from public.fiscal_documents f2, jsonb_array_elements(f2.snapshot->'payments') x where f2.id = d) = 3000, 'fora da nota do restaurante';
  assert private.fiscal_paid_cents('order', o) = 3000, 'venda para o fisco, sem a taxa';
  assert exists (select 1 from private.noowe_report_convenience where restaurant_id = pg_temp.ctx('r') and fee_cents >= 99), 'consulta interna';
end $$;
select pass('critérios 2, 3 e 5: fora da base e da nota, 100% no split, e o total do servidor inclui a taxa');

-- Fluxo: agendado e valor do cliente.
do $$
declare o uuid := pg_temp.new_order(3000, true); c uuid;
begin
  c := pg_temp.ctx('customer:' || o);
  perform set_config('noowe.param_author', 'teste M3', true);
  update private.noowe_convenience_fees set fee_cents = 150 where flow = 'scheduled' and restaurant_id is null;
  assert (public.service_payment_reserve_order(c, o, 'credit_card', gen_random_uuid())->>'amountCents')::bigint = 3150, 'agendado tem o próprio valor';
  perform pg_temp.act(c);
  assert (public.customer_checkout_quote(pg_temp.ctx('r'), 3000, true)->>'convenienceCents')::bigint = 150, 'a tela mostra o mesmo';
end $$;
select pass('o agendado usa o valor do próprio fluxo');

-- Critério 1: nunca em comanda.
do $$
declare r uuid := pg_temp.ctx('r'); c uuid := gen_random_uuid(); tbl jsonb; sid uuid; o uuid; menu uuid; sh public.bill_shares; t public.gateway_transactions;
begin
  insert into auth.users(id, email) values (c, c || '@m3.test');
  insert into public.profiles(id) values (c) on conflict do nothing;
  perform pg_temp.act(pg_temp.ctx('dono'));
  tbl := public.restaurant_create_table(r, 'm3-' || c, 4);
  select id into menu from public.menu_items where restaurant_id = r limit 1;
  perform pg_temp.act(c);
  sid := (public.customer_open_table_session(tbl->>'qr_code')->>'tableSessionId')::uuid;
  insert into public.orders(restaurant_id, customer_id, table_session_id) values (r, c, sid) returning id into o;
  insert into public.order_items(order_id, menu_item_id, quantity, unit_price, total_price, total_price_cents) values (o, menu, 1, 30, 30, 3000);
  perform public.customer_bill_split_commit(sid, 'equal', '{}', null, gen_random_uuid());
  select * into sh from public.bill_shares where table_session_id = sid and status = 'open';
  t := private.reserve_share_payment(c, sh.id, 'credit_card', 0, gen_random_uuid(), 'asaas');
  assert t.convenience_cents = 0 and t.amount_cents = sh.amount_cents, 'conta de salão sem conveniência';
  assert (select private.order_convenience_flow(x) from public.orders x where x.id = o) is null, 'fluxo da comanda não cobra';
end $$;
select pass('critério 1: nunca em comanda de Fine ou Casual');

-- Critério 4
do $$
declare r uuid := pg_temp.ctx('r'); o uuid := pg_temp.new_order(3000); c uuid; j jsonb; g uuid := gen_random_uuid(); s jsonb;
begin
  c := pg_temp.ctx('customer:' || o);
  insert into auth.users(id, email) values (g, g || '@m3.test');
  insert into public.profiles(id) values (g) on conflict do nothing;
  perform pg_temp.act(pg_temp.ctx('dono'));
  insert into public.user_roles(user_id, restaurant_id, role, is_active) values (g, r, 'manager', true);
  perform pg_temp.act(g);
  assert pg_temp.state_of(format($q$select public.restaurant_set_convenience_absorbed(%L, true)$q$, r)) = '42501', 'só o Dono';
  perform pg_temp.act(pg_temp.ctx('dono'));
  perform public.restaurant_set_convenience_absorbed(r, true);
  assert exists (select 1 from public.audit_logs where action = 'restaurant.convenience_absorbed' and entity_id = r), 'registrado';
  j := public.service_payment_reserve_order(c, o, 'credit_card', gen_random_uuid());
  assert (j->>'amountCents')::bigint = 3000, 'o cliente não paga';
  perform pg_temp.act(c);
  assert (public.customer_checkout_quote(r, 3000)->>'convenienceCents')::bigint = 0, 'nem vê';
  s := public.service_payment_set_split((j->>'paymentId')::uuid, 2900);
  assert (s->>'splitCents')::bigint = 99 + 5, 'o valor sai do restaurante, direto no split';
end $$;
select pass('critério 4: com o Dono assumindo, o cliente não vê, e o valor sai do restaurante');

-- Critério 7: estorno devolve a conveniência ao cliente e não vira dívida do restaurante.
do $$
declare r uuid := pg_temp.ctx('r'); o uuid; c uuid; j jsonb; p uuid;
begin
  update public.restaurants set convenience_absorbed = false where id = r;
  o := pg_temp.new_order(3000);
  c := pg_temp.ctx('customer:' || o);
  j := public.service_payment_reserve_order(c, o, 'credit_card', gen_random_uuid());
  p := (j->>'paymentId')::uuid;
  perform public.service_payment_set_split(p, 2999);
  perform private.apply_payment_event(p, 'asaas', 'ok-' || p, 'RECEIVED', 'confirmed', (j->>'amountCents')::bigint);
  update public.gateway_transactions set confirmed_at = now() - interval '5 days' where id = p;
  perform private.operational_day_current(r);
  update public.operational_days set started_at = now() - interval '1 hour' where restaurant_id = r and status = 'open';
  perform private.apply_payment_event(p, 'asaas', 're-' || p, 'PAYMENT_REFUNDED', 'refunded', null, '{}', 'refunded');
  assert (select amount_cents from private.noowe_pay_compensations where gateway_transaction_id = p and kind = 'fee_kept_on_refund')
    = (select greatest(0, fee_cents - tariff_cents) from private.noowe_pay_transaction_fees where gateway_transaction_id = p), 'só a parte da taxa fica no razão';
end $$;
select pass('estorno: a conveniência volta ao cliente, sem virar dívida do restaurante');

select ok(not has_function_privilege('authenticated', 'private.order_convenience_set(public.orders)', 'EXECUTE'), 'copiar o valor não abre para o app');
select ok(not has_table_privilege('authenticated', 'private.noowe_convenience_fees', 'SELECT'), 'nem o parâmetro');

select * from finish();
rollback;
