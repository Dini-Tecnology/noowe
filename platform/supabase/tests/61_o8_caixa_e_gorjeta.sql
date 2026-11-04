-- O8: um teste por critério de aceite. Caixa em centavos, fechamento cego, dia operacional, rateio e reabertura.
begin;
select plan(25);

create function pg_temp.act(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true) $$;
create function pg_temp.state_of(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ok'; exception when sqlstate 'P0004' then return 'P0004'; when others then return sqlstate; end $$;
create temp table _ctx(k text primary key, v uuid);
create function pg_temp.ctx(p text) returns uuid language sql as $$ select v from _ctx where k = p $$;
create function pg_temp.person(p_label text, p_role text) returns uuid language plpgsql as $$
declare u uuid := gen_random_uuid();
begin
  insert into auth.users(id, email) values (u, u || '@o8.test');
  insert into public.profiles(id, full_name) values (u, p_label) on conflict (id) do update set full_name = excluded.full_name;
  if p_role is not null then
    insert into public.user_roles(user_id, restaurant_id, role, is_active) values (u, pg_temp.ctx('r'), p_role::public.user_roles_role_enum, true);
  end if;
  insert into _ctx values (p_label, u);
  return u;
end $$;
-- Comanda com um item, aberta por um cliente.
create function pg_temp.session(p_cents bigint) returns uuid language plpgsql as $$
declare r uuid := pg_temp.ctx('r'); c uuid := gen_random_uuid(); tbl jsonb; sid uuid; o uuid; menu uuid;
begin
  insert into auth.users(id, email) values (c, c || '@o8.test');
  insert into public.profiles(id) values (c) on conflict do nothing;
  perform pg_temp.act(pg_temp.ctx('dono'));
  tbl := public.restaurant_create_table(r, 'o8-' || c, 4);
  select id into menu from public.menu_items where restaurant_id = r limit 1;
  perform pg_temp.act(c);
  sid := (public.customer_open_table_session(tbl->>'qr_code')->>'tableSessionId')::uuid;
  insert into public.orders(restaurant_id, customer_id, table_session_id) values (r, c, sid) returning id into o;
  insert into public.order_items(order_id, menu_item_id, quantity, unit_price, total_price, total_price_cents) values (o, menu, 1, p_cents::numeric / 100, p_cents::numeric / 100, p_cents);
  return sid;
end $$;

-- Tudo aqui roda numa transação só, em que now() não anda. Estas duas funções põem as vendas no passado para o período do dia fazer sentido.
create function pg_temp.bury(p_restaurant uuid) returns void language sql as $$
  update public.bill_shares set paid_at = now() - interval '3 days' where restaurant_id = p_restaurant and paid_at >= now() - interval '1 hour';
  update public.gateway_transactions set confirmed_at = now() - interval '3 days', created_at = now() - interval '3 days'
    where restaurant_id = p_restaurant and coalesce(confirmed_at, created_at) >= now() - interval '1 hour';
  update public.cash_register_sessions set closed_at = now() - interval '3 days', opened_at = now() - interval '3 days' where restaurant_id = p_restaurant and status = 'closed';
$$;
create function pg_temp.sold_just_now(p_restaurant uuid) returns void language sql as $$
  update public.bill_shares set paid_at = now() - interval '1 minute' where restaurant_id = p_restaurant and paid_at = now();
  update public.gateway_transactions set confirmed_at = now() - interval '1 minute' where restaurant_id = p_restaurant and coalesce(confirmed_at, created_at) = now();
  update public.operational_days set started_at = now() - interval '1 hour' where restaurant_id = p_restaurant and status = 'open';
$$;

do $$
declare r uuid := 'c1000000-0000-4000-8000-000000000002';
begin
  insert into _ctx values ('r', r), ('dono', 'c1000000-0000-4000-8000-000000000001');
  -- Banco sem caixa nem comanda aberta deste restaurante, para o teste não depender do que já existe.
  update public.cash_register_sessions set status = 'closed', closed_at = now() where restaurant_id = r and status = 'open';
  update public.table_sessions set status = 'ended', ended_at = now(), billing_status = 'open' where restaurant_id = r and status = 'active';
  update public.restaurant_model_policies set fee_or_tip_mode = 'service_fee', service_fee_bps = 1000, split_modes = '{by_owner,equal,by_item,fixed_amount}'
    where restaurant_id = r and not prepaid_required;
  perform pg_temp.person('gerente', 'manager');
  perform pg_temp.person('gerente2', 'manager');
  perform pg_temp.person('garcom', 'waiter');
  perform pg_temp.person('maitre', 'maitre');
  perform pg_temp.person('cozinha', 'chef');
end $$;

-- Critério 1
do $$
declare r uuid := pg_temp.ctx('r'); j jsonb; sid uuid; m jsonb;
begin
  perform pg_temp.act(pg_temp.ctx('garcom'));
  assert pg_temp.state_of(format($q$select public.restaurant_open_cash_register(%L, 100)$q$, r)) = '42501', 'garçom não abre caixa';
  perform pg_temp.act(pg_temp.ctx('gerente'));
  j := public.restaurant_open_cash_register(r, 100.10);
  sid := (j->>'id')::uuid;
  assert (j->>'opening_cents')::bigint = 10010, 'fundo de troco em centavos';
  assert pg_temp.state_of(format($q$select public.restaurant_open_cash_register(%L, 100)$q$, r)) = '23505', 'um caixa aberto por vez';
  assert pg_temp.state_of(format($q$select public.restaurant_add_cash_movement(%L, 'sangria', 10)$q$, sid)) = '22023', 'sangria exige motivo';
  assert pg_temp.state_of(format($q$select public.restaurant_add_cash_movement(%L, 'sale', 10, 'x')$q$, sid)) = '22023', 'venda não é lançada à mão';
  m := public.restaurant_add_cash_movement(sid, 'sangria', 20.05, 'Excesso na gaveta');
  assert (m->>'amount_cents')::bigint = 2005 and (m->>'actor_id')::uuid = pg_temp.ctx('gerente'), 'valor e responsável';
  perform public.restaurant_add_cash_movement(sid, 'reforco', 5, 'Troco');
  assert (select expected_cents from public.cash_register_sessions where id = sid) = 10010 - 2005 + 500, 'esperado em centavos';
  assert exists (select 1 from public.audit_logs where action = 'cash.sangria' and entity_id = sid and reason = 'Excesso na gaveta'), 'sangria auditada';
  assert exists (select 1 from public.audit_logs where action = 'cash.reforco' and entity_id = sid), 'reforço auditado';
  assert exists (select 1 from public.audit_logs where action = 'cash.opened' and entity_id = sid), 'abertura auditada';
  assert pg_temp.state_of(format($q$select public.restaurant_add_cash_movement(%L, 'sangria', 0, 'x')$q$, sid)) = '22023', 'valor positivo';
  insert into _ctx values ('caixa', sid);
end $$;
select pass('critério 1: caixa em centavos; abertura, sangria e reforço com motivo e responsável, auditados');
select is((select data_type from information_schema.columns where table_schema = 'public' and table_name = 'cash_register_movements' and column_name = 'amount_cents'), 'bigint', 'dinheiro é bigint');

-- Critérios 2, 9 e 14
do $$
declare r uuid := pg_temp.ctx('r'); sid uuid := pg_temp.session(5000); caixa uuid := pg_temp.ctx('caixa'); e bigint; res jsonb; online public.gateway_transactions;
begin
  select expected_cents into e from public.cash_register_sessions where id = caixa;
  perform pg_temp.act(pg_temp.ctx('garcom'));
  res := public.restaurant_record_bill_payment(sid, 'cash', gen_random_uuid(), 2000);
  assert (select expected_cents from public.cash_register_sessions where id = caixa) = e + 2200, 'dinheiro entra na gaveta sozinho, com a taxa';
  assert exists (select 1 from public.cash_register_movements m where m.session_id = caixa and m.type = 'sale' and m.actor_id = pg_temp.ctx('garcom') and m.gateway_transaction_id = (res->>'transactionId')::uuid), 'ligado ao pagamento e a quem recebeu';
  -- Maquininha da casa: externo, abate o saldo, fora da gaveta e sem taxa NOOWE.
  select expected_cents into e from public.cash_register_sessions where id = caixa;
  res := public.restaurant_record_bill_payment(sid, 'voucher', gen_random_uuid(), 1000, false, 0, null, 'refeicao');
  assert (select expected_cents from public.cash_register_sessions where id = caixa) = e, 'maquininha não entra na gaveta';
  assert (select (metadata->>'external')::boolean from public.gateway_transactions where id = (res->>'transactionId')::uuid), 'registrada como externa';
  assert not exists (select 1 from private.noowe_pay_transaction_fees where gateway_transaction_id = (res->>'transactionId')::uuid), 'sem taxa NOOWE';
  assert (select payment_method from public.gateway_transactions where id = (res->>'transactionId')::uuid) = 'voucher', 'guarda a forma';
  assert private.session_consumption_balance(sid) = 2000, 'tudo abate o mesmo saldo';
  -- Pagamento digital não mexe na gaveta, e o resto quita a comanda.
  res := public.restaurant_record_bill_payment(sid, 'pix', gen_random_uuid());
  assert (select status from public.table_sessions where id = sid) = 'ended', 'saldo zero quita a comanda';
  assert (select expected_cents from public.cash_register_sessions where id = caixa) = e, 'digital concilia sem passar pela gaveta';
end $$;
select pass('critérios 2, 9 e 14: dinheiro entra no caixa; maquininha é externa, sem taxa; todos abatem o saldo');

-- Critério 3
do $$
declare caixa uuid := pg_temp.ctx('caixa'); r uuid := pg_temp.ctx('r'); st jsonb; res jsonb; e bigint;
begin
  perform pg_temp.act(pg_temp.ctx('gerente'));
  st := public.restaurant_get_cash_register(r);
  assert st->'session'->'expected_cents' = 'null'::jsonb, 'gerente não vê o esperado: o fechamento é cego';
  assert not exists (select 1 from jsonb_array_elements(st->'session'->'movements') x where x->>'type' = 'sale'), 'nem as vendas, que dariam a conta';
  perform pg_temp.act(pg_temp.ctx('garcom'));
  st := public.restaurant_get_cash_register(r);
  assert not st->'session' ? 'opening_cents', 'garçom só sabe se está aberto';
  assert pg_temp.state_of(format($q$select public.restaurant_close_cash_register(%L, 10)$q$, caixa)) = '42501', 'garçom não fecha';
  perform pg_temp.act(pg_temp.ctx('dono'));
  update public.restaurant_cash_settings set break_limit_cents = 100 where restaurant_id = r;
  select expected_cents into e from public.cash_register_sessions where id = caixa;
  -- Dentro do limite: registra, e não vai ao Dono.
  perform pg_temp.act(pg_temp.ctx('gerente'));
  res := public.restaurant_close_cash_register(caixa, (e + 50)::numeric / 100, 'Fim do turno');
  assert (res->>'difference_cents')::bigint = 50 and (res->>'expected_cents')::bigint = e, 'depois de contar, compara com o esperado';
  assert not (res->>'needs_owner_review')::boolean, 'dentro do limite não vai ao Dono';
  assert exists (select 1 from public.audit_logs where action = 'cash.closed' and entity_id = caixa), 'fechamento auditado';
  -- Acima do limite: vai ao Dono.
  res := public.restaurant_open_cash_register(r, 10);
  res := public.restaurant_close_cash_register((res->>'id')::uuid, 5, null);
  assert (res->>'needs_owner_review')::boolean, 'acima do limite marca revisão';
  assert exists (select 1 from public.staff_tasks where kind = 'cash.break_over_limit' and entity_id = (res->>'id')::uuid and 'owner' = any(audience_roles)), 'o Dono é avisado';
  assert pg_temp.state_of(format($q$select public.restaurant_review_cash_break(%L, 'visto')$q$, res->>'id')) = '42501', 'só o Dono resolve a quebra';
  perform pg_temp.act(pg_temp.ctx('dono'));
  assert (public.restaurant_get_day_status(r)->'pendingBreaks'->0->>'sessionId') = res->>'id', 'aparece no fechamento do dia';
  perform public.restaurant_review_cash_break((res->>'id')::uuid, 'Troco errado');
  assert jsonb_array_length(public.restaurant_get_day_status(r)->'pendingBreaks') = 0, 'resolvida com registro';
end $$;
select pass('critério 3: fechamento cego compara contado e esperado; quebra acima do limite vai ao Dono');

-- Critério 15 (e o aviso continua, agora vindo da gaveta)
do $$
declare r uuid := pg_temp.ctx('r'); sid uuid; c jsonb; res jsonb;
begin
  perform pg_temp.act(pg_temp.ctx('gerente2'));
  c := public.restaurant_open_cash_register(r, 0);
  sid := pg_temp.session(1000);
  perform pg_temp.act(pg_temp.ctx('gerente2'));
  perform public.restaurant_record_bill_payment(sid, 'cash', gen_random_uuid());
  res := public.restaurant_close_cash_register((c->>'id')::uuid, 11, null);
  assert exists (select 1 from public.audit_logs where action = 'cash.closed_by_receiver' and entity_id = (c->>'id')::uuid), 'quem recebeu e fechou fica registrado';
  assert exists (select 1 from public.staff_tasks where kind = 'cash.closed_by_receiver' and entity_id = (c->>'id')::uuid), 'avisa o Dono';
end $$;
select pass('critério 15: fechar o caixa onde a própria pessoa recebeu dinheiro fica registrado e avisa o Dono');

-- Critério 10
do $$
declare r uuid := pg_temp.ctx('r');
begin
  perform pg_temp.act(pg_temp.ctx('gerente'));
  perform public.restaurant_update_cash_settings(r, 5000, 200000, '05:30', (select break_limit_cents from public.restaurant_cash_settings where restaurant_id = r));
  assert (select opening_float_cents from public.restaurant_cash_settings where restaurant_id = r) = 5000, 'gerente muda fundo de troco';
  assert (select to_char(day_turnover, 'HH24:MI') from public.restaurant_cash_settings where restaurant_id = r) = '05:30', 'e a virada do dia';
  assert pg_temp.state_of(format($q$select public.restaurant_update_cash_settings(%L, 5000, 200000, '05:30', 99999)$q$, r)) = '42501', 'limite de quebra, não';
  assert exists (select 1 from public.audit_logs where action = 'cash.settings_changed' and entity_id = r), 'registrado';
  perform pg_temp.act(pg_temp.ctx('dono'));
  perform public.restaurant_update_cash_settings(r, 5000, 200000, '06:00', 3000);
  assert (select break_limit_cents from public.restaurant_cash_settings where restaurant_id = r) = 3000, 'o Dono muda';
  perform pg_temp.act(pg_temp.ctx('garcom'));
  assert pg_temp.state_of(format($q$select public.restaurant_get_cash_settings(%L)$q$, r)) = '42501', 'garçom não vê';
  -- Fundo configurado é o padrão da abertura.
  perform pg_temp.act(pg_temp.ctx('gerente'));
  assert (public.restaurant_open_cash_register(r)->>'opening_cents')::bigint = 5000, 'abre com o fundo configurado';
  perform public.restaurant_close_cash_register((select id from public.cash_register_sessions where restaurant_id = r and status = 'open'), 50, null);
end $$;
select pass('critério 10: limite de quebra só o Dono; fundo de troco e sangria sugerida, Dono e Gerente');

-- Critério 11
do $$
declare r uuid := pg_temp.ctx('r'); sid uuid := pg_temp.session(4000); b jsonb;
begin
  perform pg_temp.act(pg_temp.ctx('gerente'));
  perform public.restaurant_record_bill_payment(sid, 'pix', gen_random_uuid(), 1000);
  perform pg_temp.act(pg_temp.ctx('maitre'));
  b := public.restaurant_get_session_bill(sid);
  assert (b->>'consumptionCents')::bigint = 4000 and (b->>'balanceCents')::bigint = 3000, 'consumo e saldo';
  assert jsonb_array_length(b->'payers') = 1 and b->'payers'->0->>'method' = 'pix', 'quem pagou';
  assert pg_temp.state_of(format($q$select public.restaurant_get_cash_register(%L)$q$, r)) = '42501', 'não vê caixa';
  assert pg_temp.state_of(format($q$select public.restaurant_get_day_status(%L)$q$, r)) = '42501', 'nem o dia';
  perform pg_temp.act(pg_temp.ctx('gerente'));
  perform public.restaurant_record_bill_payment(sid, 'pix', gen_random_uuid());
end $$;
select pass('critério 11: Maître vê consumo, saldo e quem pagou; não vê caixa');

-- Critérios 5, 6, 7 e 4: fechamento do dia, rateio e extrato.
do $$
declare r uuid := pg_temp.ctx('r'); d public.operational_days; sid uuid; g uuid := pg_temp.ctx('garcom'); m uuid := pg_temp.ctx('maitre'); k uuid := pg_temp.ctx('cozinha'); res jsonb; t public.tip_distributions; rep jsonb; v_pool bigint;
begin
  perform pg_temp.act(pg_temp.ctx('dono'));
  -- Regra vale do próximo dia, nunca retroativa.
  d := private.operational_day_current(r);
  res := public.restaurant_update_tip_rules(r, 'points', 1000, '{"waiter":2,"maitre":1}');
  assert res->>'mode' = 'equal' and res->'pending'->>'mode' = 'points' and (res->'pending'->>'effectiveDay')::date = d.business_date + 1, 'mudança fica para o próximo dia';
  assert exists (select 1 from public.audit_logs where action = 'tips.rules_changed' and entity_id = r), 'autor, antes e depois';
  -- Teto do regime.
  update public.restaurants set tax_regime = null where id = r;
  assert pg_temp.state_of(format($q$select public.restaurant_update_tip_rules(%L, 'equal', 2001)$q$, r)) = '22023', 'sem regime, vale o teto menor';
  perform public.restaurant_set_tax_regime(r, 'simples_nacional');
  assert pg_temp.state_of(format($q$select public.restaurant_update_tip_rules(%L, 'equal', 2001)$q$, r)) = '22023', 'Simples: até 20%%';
  perform public.restaurant_set_tax_regime(r, 'outros');
  perform public.restaurant_update_tip_rules(r, 'points', 3300, '{"waiter":2,"maitre":1}');
  assert pg_temp.state_of(format($q$select public.restaurant_update_tip_rules(%L, 'equal', 3301)$q$, r)) = '22023', 'demais: até 33%%';
  assert pg_temp.state_of(format($q$select public.restaurant_update_tip_rules(%L, 'nada', 0)$q$, r)) = '22023', 'modo inválido';

  -- Hoje vale a regra anterior: igualitário entre os escalados. O dia só conta pagamento dentro dele.
  perform pg_temp.bury(r);
  insert into public.shifts(staff_id, restaurant_id, date, start_time, end_time, role, status, is_overtime, created_at, updated_at) values
    (g, r, (d.business_date::timestamp + time '12:00') at time zone 'America/Sao_Paulo', '10:00', '16:00', 'waiter', 'scheduled', false, now(), now()),
    (m, r, (d.business_date::timestamp + time '12:00') at time zone 'America/Sao_Paulo', '10:00', '12:00', 'maitre', 'scheduled', false, now(), now()),
    (k, r, (d.business_date::timestamp + time '12:00') at time zone 'America/Sao_Paulo', '10:00', '12:00', 'chef', 'cancelled', false, now(), now());
  sid := pg_temp.session(10000);
  -- Comanda aberta bloqueia.
  perform pg_temp.act(pg_temp.ctx('gerente'));
  assert pg_temp.state_of(format($q$select public.restaurant_close_operational_day(%L)$q$, r)) = 'P0001', 'comanda aberta bloqueia';
  perform public.restaurant_record_bill_payment(sid, 'pix', gen_random_uuid(), 5000);
  perform public.restaurant_record_bill_payment(sid, 'credit_card', gen_random_uuid(), 5000, true);
  -- Critério 4: consumo fecha, com taxa de um e não de outro.
  assert (select sum(base_cents) from public.bill_shares where table_session_id = sid and status = 'paid') = 10000, 'consumo pago = consumo total';
  res := public.restaurant_open_cash_register(r, 10);
  assert pg_temp.state_of(format($q$select public.restaurant_close_operational_day(%L)$q$, r)) = 'P0001', 'caixa aberto bloqueia';
  perform public.restaurant_close_cash_register((res->>'id')::uuid, 10);
  perform pg_temp.sold_just_now(r);
  select * into d from public.operational_days where id = d.id;
  v_pool := private.tip_pool_cents(r, d.started_at, now());
  assert v_pool = 500, 'só a taxa paga entra no rateio: ' || v_pool;
  res := public.restaurant_close_operational_day(r);
  assert (select status from public.operational_days where id = d.id) = 'closed', 'dia fechado';
  assert res->'byMethod' ? 'pix', 'resumo por forma';
  assert exists (select 1 from public.staff_tasks where kind = 'day.closed' and entity_id = d.id and 'owner' = any(audience_roles)), 'resumo vai ao Dono';
  assert (res->>'nextDayId')::uuid <> d.id, 'o próximo dia começa';
  select * into t from public.tip_distributions where operational_day_id = d.id;
  assert t.mode = 'equal' and t.retention_bps = 0, 'a regra nova não foi retroativa';
  assert t.pool_cents = 500 and t.distributed_cents = 500 and t.retained_cents = 0, 'rateio do dia';
  assert (select sum(amount_cents) from public.tip_distribution_lines where distribution_id = t.id) = 500, 'a soma fecha ao centavo';
  assert (select amount_cents from public.tip_distribution_lines where distribution_id = t.id and user_id = g) = 250, 'igualitário';
  assert not exists (select 1 from public.tip_distribution_lines where distribution_id = t.id and user_id = k), 'turno cancelado não entra';
  assert pg_temp.state_of(format($q$select public.restaurant_close_operational_day(%L, %L)$q$, r, d.id)) = 'P0001', 'não fecha duas vezes';

  -- Critério 7: cada um vê só o próprio; o relatório é do gerente.
  perform pg_temp.act(g);
  assert jsonb_array_length(public.restaurant_my_tips(r)) = 1 and (public.restaurant_my_tips(r)->0->>'amountCents')::bigint = 250, 'Minha gorjeta';
  assert pg_temp.state_of(format($q$select public.restaurant_tip_report(%L, %L)$q$, r, d.id)) = '42501', 'relatório da folha não é do garçom';
  perform pg_temp.act(pg_temp.ctx('gerente'));
  rep := public.restaurant_tip_report(r, d.id);
  assert jsonb_array_length(rep->'lines') = 2 and rep->'lines'->0 ? 'name', 'relatório para a folha';
  assert not exists (select 1 from information_schema.columns where table_name = 'tip_distribution_lines' and column_name in ('paid_at', 'payment_id')), 'o app não paga gorjeta';

  -- Dia seguinte: vale a regra nova. Por pontos e com retenção; a soma fecha, com centavo que não divide certo.
  perform pg_temp.bury(r);
  update public.operational_days set business_date = d.business_date + 1 where restaurant_id = r and status = 'open' returning * into d;
  insert into public.shifts(staff_id, restaurant_id, date, start_time, end_time, role, status, is_overtime, created_at, updated_at) values
    (g, r, (d.business_date::timestamp + time '12:00') at time zone 'America/Sao_Paulo', '10:00', '16:00', 'waiter', 'scheduled', false, now(), now()),
    (m, r, (d.business_date::timestamp + time '12:00') at time zone 'America/Sao_Paulo', '10:00', '12:00', 'maitre', 'scheduled', false, now(), now());
  sid := pg_temp.session(10010);
  perform pg_temp.act(pg_temp.ctx('gerente'));
  perform public.restaurant_record_bill_payment(sid, 'pix', gen_random_uuid());
  perform pg_temp.sold_just_now(r);
  res := public.restaurant_close_operational_day(r);
  select * into t from public.tip_distributions where operational_day_id = d.id;
  assert t.mode = 'points' and t.retention_bps = 3300, 'no dia seguinte vale a regra nova';
  assert t.pool_cents = 1001, 'taxa do dia';
  assert t.retained_cents = 330 and t.distributed_cents = 671, 'retenção, arredondada no servidor';
  assert (select sum(amount_cents) from public.tip_distribution_lines where distribution_id = t.id) = 671, 'soma exata';
  assert (select amount_cents from public.tip_distribution_lines where distribution_id = t.id and user_id = g) > (select amount_cents from public.tip_distribution_lines where distribution_id = t.id and user_id = m), 'por pontos';

  -- Por horas, pela entrada e saída quando houver; turno que passa da meia-noite.
  assert private.shift_minutes('22:00', '02:00', null, null, 30) = 210, 'virada da meia-noite, com pausa';
  assert private.shift_minutes('10:00', '16:00', '10:30', '16:00', null) = 330, 'usa a entrada registrada';
end $$;
select pass('critérios 4, 5, 6 e 7: fechamento bloqueia, gera o rateio exato com a regra do dia e cada um vê só o próprio');

-- Sem escala: gorjeta não some, nem é paga a ninguém sem critério.
do $$
declare r uuid := pg_temp.ctx('r'); d public.operational_days; t public.tip_distributions;
begin
  perform pg_temp.act(pg_temp.ctx('gerente'));
  perform public.restaurant_update_tip_rules(r, 'hours', 0);
  perform pg_temp.bury(r);
  d := private.operational_day_current(r);
  update public.operational_days set business_date = d.business_date + 5 where id = d.id returning * into d;
  perform pg_temp.session(1000);
  perform pg_temp.act(pg_temp.ctx('gerente'));
  perform public.restaurant_record_bill_payment((select id from public.table_sessions where restaurant_id = r and status = 'active'), 'pix', gen_random_uuid());
  perform pg_temp.sold_just_now(r);
  perform public.restaurant_close_operational_day(r);
  select * into t from public.tip_distributions where operational_day_id = d.id;
  assert t.unallocated_cents = 100 and t.distributed_cents = 0, 'fica sem rateio, à vista';
  assert exists (select 1 from public.staff_tasks where kind = 'tips.unallocated' and entity_id = d.id), 'gerente e Dono são avisados';
end $$;
select pass('sem ninguém na escala, a gorjeta fica sem rateio e o gerente é avisado');

-- Critérios 12 e 13: virada do dia.
do $$
declare r uuid := pg_temp.ctx('r'); d public.operational_days; d2 public.operational_days; c jsonb;
begin
  perform pg_temp.act(pg_temp.ctx('gerente'));
  d := private.operational_day_current(r);
  -- Ainda não chegou a hora: nada muda.
  update public.operational_days set business_date = (now() at time zone 'America/Sao_Paulo')::date + 1, started_at = now() where id = d.id;
  perform private.operational_day_tick();
  assert (select status from public.operational_days where id = d.id) = 'open', 'antes da hora não vira';
  -- Passou da hora, com caixa aberto: só avisa, e nada fecha.
  update public.operational_days set business_date = (now() at time zone 'America/Sao_Paulo')::date - 2, started_at = now() - interval '2 days' where id = d.id;
  c := public.restaurant_open_cash_register(r, 10);
  perform private.operational_day_tick();
  assert (select status from public.operational_days where id = d.id) = 'open', 'com caixa aberto o dia não vira';
  assert (select status from public.cash_register_sessions where id = (c->>'id')::uuid) = 'open', 'nada fecha sozinho';
  assert exists (select 1 from public.staff_tasks where kind = 'day.close_missing' and entity_id = d.id), 'gerente e Dono são alertados';
  perform public.restaurant_close_cash_register((c->>'id')::uuid, 10);
  -- Sem caixa e com venda: vira, e o dia fica pendente de fechamento, sem rateio sozinho.
  insert into public.gateway_transactions(restaurant_id, provider, payment_method, amount_cents, refunded_amount_cents, status, idempotency_key, purpose, confirmed_at, created_at, updated_at)
    values (r, 'manual', 'pix', 100, 0, 'completed', 'o8-venda-' || d.id, 'order', now() - interval '1 hour', now(), now());
  perform private.operational_day_tick();
  assert (select status from public.operational_days where id = d.id) = 'unclosed', 'vira e fica pendente';
  assert not exists (select 1 from public.tip_distributions where operational_day_id = d.id), 'não fecha sozinho';
  select * into d2 from public.operational_days where restaurant_id = r and status = 'open';
  assert d2.id is not null and d2.id <> d.id, 'o novo dia já começou';
  assert exists (select 1 from jsonb_array_elements(public.restaurant_get_day_status(r)->'unclosedDays') x where (x->>'dayId')::uuid = d.id), 'pendência à vista';
  -- Dá para fechar depois, mesmo com comanda aberta no dia novo.
  perform pg_temp.session(1000);
  perform pg_temp.act(pg_temp.ctx('gerente'));
  perform public.restaurant_close_operational_day(r, d.id);
  assert (select status from public.operational_days where id = d.id) = 'closed', 'fecha o dia que ficou para trás';
  assert exists (select 1 from public.tip_distributions where operational_day_id = d.id), 'com o rateio do período';
  perform public.restaurant_record_bill_payment((select id from public.table_sessions where restaurant_id = r and status = 'active'), 'pix', gen_random_uuid());
  -- Sem venda e sem caixa, o dia só vira, sem pendência.
  select * into d from public.operational_days where restaurant_id = r and status = 'open';
  update public.operational_days set business_date = (now() at time zone 'America/Sao_Paulo')::date - 2, started_at = now() where id = d.id;
  perform pg_temp.bury(r);
  perform private.operational_day_tick();
  assert (select status from public.operational_days where id = d.id) = 'closed' and (select summary->>'noSales' from public.operational_days where id = d.id) = 'true', 'dia sem venda só vira';
end $$;
select pass('critérios 12 e 13: com caixa aberto só alerta; sem caixa, o dia vira e fica pendente; nada fecha sozinho');

-- Restaurante que vende sem ninguém abrir caixa também tem dia, ou a gorjeta ficaria de fora.
do $$
declare r uuid := pg_temp.ctx('r');
begin
  delete from public.operational_days where restaurant_id = r and status = 'open';
  insert into public.gateway_transactions(restaurant_id, provider, payment_method, amount_cents, refunded_amount_cents, status, idempotency_key, purpose, created_at, updated_at)
    values (r, 'manual', 'pix', 100, 0, 'completed', 'o8-sem-dia-' || gen_random_uuid(), 'order', now(), now());
  perform private.operational_day_tick();
  assert exists (select 1 from public.operational_days where restaurant_id = r and status = 'open'), 'o dia começa sozinho';
end $$;
select pass('restaurante vendendo sem abrir caixa tem dia operacional');

-- Critério 8: reabrir comanda paga e estornar.
do $$
declare r uuid := pg_temp.ctx('r'); sid uuid := pg_temp.session(3000); a jsonb; o uuid; menu uuid;
begin
  perform pg_temp.bury(r);
  perform pg_temp.act(pg_temp.ctx('garcom'));
  perform public.restaurant_record_bill_payment(sid, 'pix', gen_random_uuid());
  assert (select status from public.table_sessions where id = sid) = 'ended', 'paga e encerrada';
  assert pg_temp.state_of(format($q$select public.restaurant_request_bill_reopen(%L, ' ')$q$, sid)) = '22023', 'exige motivo';
  a := public.restaurant_request_bill_reopen(sid, 'Faltou lançar a sobremesa');
  assert a->>'status' = 'pending' and (select status from public.table_sessions where id = sid) = 'ended', 'pede, e nada muda antes de aprovar';
  assert pg_temp.state_of(format($q$select public.restaurant_request_bill_reopen(%L, 'de novo')$q$, sid)) = '23505', 'um pedido por vez';
  perform pg_temp.act(pg_temp.ctx('gerente'));
  perform public.restaurant_resolve_approval((a->>'id')::uuid, 'approved', 'Ok');
  assert (select status from public.table_sessions where id = sid) = 'active', 'aprovado, reabre';
  assert (select reopened_count from public.table_sessions where id = sid) >= 1, 'contado';
  assert exists (select 1 from public.audit_logs where action = 'bill.reopened_paid' and entity_id = sid), 'no log';
  -- Pagamentos continuam valendo: só a diferença fica aberta; sem estorno automático.
  assert (select count(*) from public.bill_shares where table_session_id = sid and status = 'paid') = 1, 'pagamento continua valendo';
  assert not exists (select 1 from public.payment_refunds r2 join public.gateway_transactions g on g.id = r2.gateway_transaction_id where g.table_session_id = sid), 'sem estorno automático';
  assert private.session_consumption_balance(sid) = 0, 'sem novos itens, nada em aberto';
  select id into menu from public.menu_items where restaurant_id = r limit 1;
  insert into public.orders(restaurant_id, customer_id, table_session_id) select r, customer_id, sid from public.table_sessions where id = sid returning id into o;
  insert into public.order_items(order_id, menu_item_id, quantity, unit_price, total_price, total_price_cents) values (o, menu, 1, 7, 7, 700);
  assert private.session_consumption_balance(sid) = 700, 'só a diferença fica em aberto';
  perform public.restaurant_record_bill_payment(sid, 'cash', gen_random_uuid());
  assert (select status from public.table_sessions where id = sid) = 'ended', 'fecha de novo';

  -- Gerente não aprova o próprio; outro gerente aprova.
  perform pg_temp.act(pg_temp.ctx('gerente'));
  a := public.restaurant_request_bill_reopen(sid, 'Correção');
  assert pg_temp.state_of(format($q$select public.restaurant_resolve_approval(%L, 'approved')$q$, a->>'id')) <> 'ok', 'ninguém aprova o próprio pedido';
  perform pg_temp.act(pg_temp.ctx('gerente2'));
  perform public.restaurant_resolve_approval((a->>'id')::uuid, 'approved');
  assert (select status from public.table_sessions where id = sid) = 'active', 'outro gerente aprova';
end $$;
select pass('critério 8: reabrir exige motivo e aprovação; pagamentos valem, só a diferença fica aberta; ninguém aprova o próprio');

do $$
declare r uuid := pg_temp.ctx('r'); s1 uuid; s2 uuid; t uuid; new_t uuid; a jsonb; c jsonb; other uuid := gen_random_uuid(); tb public.tables;
begin
  -- Fecha o que ficou aberto no bloco anterior, para o cenário começar limpo.
  perform pg_temp.bury(r);
  update public.table_sessions set status = 'ended', ended_at = now() where restaurant_id = r and status = 'active';
  s1 := pg_temp.session(1000);
  perform pg_temp.act(pg_temp.ctx('dono'));
  perform public.restaurant_record_bill_payment(s1, 'pix', gen_random_uuid());
  select table_id into t from public.table_sessions where id = s1;
  -- A mesa foi ocupada por outro grupo: a comanda reabre sem mesa.
  update public.tables set status = 'available' where id = t;
  insert into auth.users(id, email) values (other, other || '@o8.test');
  insert into public.profiles(id) values (other) on conflict do nothing;
  perform pg_temp.act(other);
  perform public.customer_open_table_session((select qr_code from public.tables where id = t));
  perform pg_temp.act(pg_temp.ctx('dono'));
  a := public.restaurant_request_bill_reopen(s1, 'Cliente voltou');
  assert a->>'status' = 'approved', 'o Dono aplica direto';
  select table_id into new_t from public.table_sessions where id = s1;
  select * into tb from public.tables where id = new_t;
  assert new_t <> t and tb.is_standalone, 'comanda avulsa, sem tomar a mesa ocupada';
  assert (select status from public.table_sessions where id = s1) = 'active', 'reaberta';
  -- Terminou, a mesa avulsa some da operação.
  update public.table_sessions set status = 'ended', ended_at = now() where id = s1;
  assert not exists (select 1 from public.tables where id = new_t), 'avulsa sai da operação';
  assert (select table_id from public.table_sessions where id = s1) = t, 'a comanda volta para a mesa de origem';

  -- Fora do dia operacional, ou depois do fechamento do caixa, não reabre.
  update public.table_sessions set ended_at = now() - interval '3 days' where id = s1;
  assert pg_temp.state_of(format($q$select public.restaurant_request_bill_reopen(%L, 'tarde')$q$, s1)) = 'P0001', 'só no mesmo dia operacional';
  s2 := pg_temp.session(1000);
  perform pg_temp.act(pg_temp.ctx('dono'));
  perform public.restaurant_record_bill_payment(s2, 'pix', gen_random_uuid());
  c := public.restaurant_open_cash_register(r, 0);
  perform public.restaurant_close_cash_register((c->>'id')::uuid, 0);
  assert pg_temp.state_of(format($q$select public.restaurant_request_bill_reopen(%L, 'tarde')$q$, s2)) = 'P0001', 'antes do fechamento do caixa';

  perform pg_temp.act(pg_temp.ctx('cozinha'));
  assert pg_temp.state_of(format($q$select public.restaurant_request_bill_reopen(%L, 'x')$q$, s2)) = '42501', 'cozinha não pede';
end $$;
select pass('reabertura: mesa ocupada vira comanda avulsa; só no mesmo dia e antes do fechamento do caixa');

-- "Estornar valor": lista o que dá para devolver, e devolver dinheiro sai da gaveta.
do $$
declare r uuid := pg_temp.ctx('r'); sid uuid := pg_temp.session(2000); c jsonb; res jsonb; e bigint; l jsonb;
begin
  perform pg_temp.act(pg_temp.ctx('dono'));
  c := public.restaurant_open_cash_register(r, 0);
  res := public.restaurant_record_bill_payment(sid, 'cash', gen_random_uuid());
  select expected_cents into e from public.cash_register_sessions where id = (c->>'id')::uuid;
  l := public.restaurant_list_refundable_payments(r);
  assert exists (select 1 from jsonb_array_elements(l) x where (x->>'paymentId')::uuid = (res->>'transactionId')::uuid and (x->>'availableCents')::bigint = (res->>'amountCents')::bigint), 'aparece para estornar';
  perform public.restaurant_request_refund((res->>'transactionId')::uuid, 'Cobrado a mais', 500);
  assert (select expected_cents from public.cash_register_sessions where id = (c->>'id')::uuid) = e - 500, 'dinheiro devolvido sai da gaveta';
  assert (select refunded_amount_cents from public.gateway_transactions where id = (res->>'transactionId')::uuid) = 500, 'valor devolvido registrado';
  perform public.restaurant_close_cash_register((c->>'id')::uuid, (e - 500)::numeric / 100);
end $$;
select pass('"Estornar valor": parcial, com aprovação; dinheiro devolvido sai da gaveta');

-- RLS
select ok((select bool_and(relrowsecurity) from pg_class where oid in ('public.cash_register_sessions'::regclass, 'public.cash_register_movements'::regclass,
  'public.operational_days'::regclass, 'public.restaurant_cash_settings'::regclass, 'public.restaurant_tip_rules'::regclass, 'public.tip_distributions'::regclass, 'public.tip_distribution_lines'::regclass)), 'RLS ligado');
do $$ begin insert into _ctx values ('dia_rls', (select id from public.operational_days where restaurant_id = pg_temp.ctx('r') order by started_at limit 1)); end $$;
grant select on _ctx to authenticated;
select _test.as_user(pg_temp.ctx('garcom'));
select is((select count(*)::int from public.tip_distribution_lines where user_id <> auth.uid()), 0, 'garçom não lê o extrato de ninguém');
select is((select count(*)::int from public.tip_distributions), 0, 'nem o rateio geral');
select is((select count(*)::int from public.cash_register_sessions), 0, 'nem o caixa, direto');
select is((select count(*)::int from public.cash_register_movements), 0, 'nem a gaveta');
select throws_ok($$ insert into public.cash_register_movements(session_id, type, amount, amount_cents, is_cash, created_by, created_at) values (gen_random_uuid(), 'sale', 1, 100, true, 'x', now()) $$, '42501', null, 'nem escreve direto');
select _test.as_user(pg_temp.ctx('gerente'));
select is((select count(*)::int from public.cash_register_sessions), 0, 'gerente também não lê direto: o fechamento é cego');
select _test.reset_role();
select is(private.tip_retention_cap_bps('00000000-0000-0000-0000-000000000000'), 2000, 'restaurante sem regime fica no teto menor');
select ok((select cap_bps from private.noowe_tip_retention_caps where regime = 'outros') = 3300, 'o teto está em parâmetro');
select is((select count(*)::int from information_schema.columns where table_schema = 'public' and table_name = 'cash_register_sessions' and column_name in ('opening_cents','expected_cents','counted_cents','difference_cents') and data_type = 'bigint'), 4, 'caixa em bigint');
select ok(not has_function_privilege('authenticated', 'private.cash_record(uuid,text,bigint,text,uuid,uuid)', 'EXECUTE'), 'lançar na gaveta não abre para o app');

select * from finish();
rollback;
