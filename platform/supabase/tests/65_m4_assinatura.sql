-- M4: um teste por critério do servidor. Faturas sem chegar ao provedor: o disparo é rolado de volta com a transação.
begin;
select plan(13);
create function pg_temp.act(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true) $$;
create function pg_temp.state_of(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ok'; exception when sqlstate 'P0004' then return 'P0004'; when others then return sqlstate; end $$;
create temp table _ctx(k text primary key, v uuid);
create function pg_temp.ctx(p text) returns uuid language sql as $$ select v from _ctx where k = p $$;

do $$
declare r uuid := 'c1000000-0000-4000-8000-000000000002'; g uuid := gen_random_uuid();
begin
  insert into _ctx values ('r', r), ('dono', 'c1000000-0000-4000-8000-000000000001'), ('gerente', g);
  delete from public.restaurant_subscriptions where restaurant_id = r;
  perform pg_temp.act(pg_temp.ctx('dono'));
  insert into auth.users(id, email) values (g, g || '@m4.test');
  insert into public.profiles(id) values (g) on conflict do nothing;
  insert into public.user_roles(user_id, restaurant_id, role, is_active) values (g, r, 'manager', true);
end $$;

-- Critérios 1, 10, 11 e 12: escolha, teste, Enterprise.
do $$
declare r uuid := pg_temp.ctx('r'); j jsonb; plans jsonb;
begin
  perform pg_temp.act(pg_temp.ctx('dono'));
  assert (public.restaurant_get_plan_summary(r)->>'needsChoice')::boolean, 'restaurante ativo passa pela etapa';
  plans := public.restaurant_list_plans(r);
  assert exists (select 1 from jsonb_array_elements(plans) x where (x->>'suggested')::boolean), 'sugestão por tipo de serviço vem de parâmetro';
  assert exists (select 1 from jsonb_array_elements(plans) x where (x->>'isContract')::boolean and x->'monthlyCents' = 'null'::jsonb), 'Enterprise sem preço na tela';
  assert (select (x->>'annualSavingsCents')::bigint from jsonb_array_elements(plans) x where x->>'code' = 'essencial') = 19900 * 2, 'economia do anual';
  assert pg_temp.state_of(format($q$select public.restaurant_choose_plan(%L, 'enterprise')$q$, r)) = 'P0001', 'Enterprise é falar com a NOOWE';
  perform pg_temp.act(pg_temp.ctx('gerente'));
  assert pg_temp.state_of(format($q$select public.restaurant_choose_plan(%L, 'essencial')$q$, r)) = '42501', 'só o Dono altera';
  assert pg_temp.state_of(format($q$select public.restaurant_get_plan_summary(%L)$q$, r)) = '42501', 'nem vê os valores';
  perform pg_temp.act(pg_temp.ctx('dono'));
  j := public.restaurant_choose_plan(r, 'profissional', 'monthly');
  assert j->>'status' = 'trial' and (j->>'trialEndsAt')::timestamptz between now() + interval '29 days' and now() + interval '31 days', '30 dias de teste, sem cartão';
  assert not exists (select 1 from public.subscription_invoices where restaurant_id = r), 'teste não fatura';
  assert pg_temp.state_of(format($q$select public.restaurant_choose_plan(%L, 'essencial')$q$, r)) = '23505', 'não escolhe de novo';
end $$;
select pass('critérios 1, 10, 11 e 12: etapa de escolha, teste de 30 dias sem cartão, Enterprise sob consulta');

select ok((select monthly_price_cents from private.noowe_plans where code = 'essencial') = 19900, 'preço vem da tabela');

-- Critério 2
do $$
declare r uuid := pg_temp.ctx('r'); caps jsonb; m public.noowe_service_model; c uuid := gen_random_uuid(); ts timestamptz := now() + interval '1 day';
begin
  select unnest into m from unnest((select service_models from public.restaurant_model_configs where restaurant_id = r)) limit 1;
  perform pg_temp.act(pg_temp.ctx('dono'));
  perform public.restaurant_change_plan(r, 'essencial');
  assert not private.plan_allows(r, 'reservations') and not private.plan_allows(r, 'bill_split'), 'Essencial não tem';
  caps := public.get_restaurant_model_capabilities_v2(r, 'casual_dining');
  assert not (caps->'capabilities'->>'reservations')::boolean and not (caps->'capabilities'->>'virtualQueue')::boolean and not (caps->'capabilities'->>'splitBill')::boolean, 'some para os perfis e para o app';
  assert caps->'capabilities'->'splitModes' = '[]'::jsonb, 'sem divisão';
  insert into auth.users(id, email) values (c, c || '@m4.test');
  insert into public.profiles(id) values (c) on conflict do nothing;
  perform pg_temp.act(c);
  assert pg_temp.state_of(format($q$select public.customer_create_reservation(%L, %L, 2, null)$q$, r, ts)) = 'P0014', 'o servidor recusa a reserva';
  assert pg_temp.state_of(format($q$select public.customer_join_waitlist(%L, 2, null, false)$q$, r)) = 'P0014', 'e a fila';
  perform pg_temp.act(pg_temp.ctx('gerente'));
  assert exists (select 1 from jsonb_array_elements_text(public.restaurant_get_plan_locks(r)) x where x = 'reservations'), 'o app sabe o que esconder';
  assert exists (select 1 from jsonb_array_elements_text(public.restaurant_get_plan_locks(r)) x where x = 'tap_to_pay'), 'Tap fora até ter fornecedor';
  perform pg_temp.act(pg_temp.ctx('dono'));
  perform public.restaurant_change_plan(r, 'profissional');
  assert private.plan_allows(r, 'reservations'), 'de volta com o plano';
  -- Tap volta à lista do Profissional quando o fornecedor liga.
  perform set_config('noowe.param_author', 'teste M4', true);
  update private.noowe_tap_settings set provider = 'x', active = true;
  assert private.plan_allows(r, 'tap_to_pay'), 'Profissional tem Tap com fornecedor';
  update private.noowe_tap_settings set active = false, provider = null;
end $$;
select pass('critério 2: recurso fora do plano some, e a regra vale no servidor');

-- Critérios 3 e 4
do $$
declare r uuid := pg_temp.ctx('r'); i public.subscription_invoices; v_diff bigint; s public.restaurant_subscriptions;
begin
  perform pg_temp.act(pg_temp.ctx('dono'));
  -- Sai do teste: primeira fatura.
  update public.restaurant_subscriptions set status = 'active', trial_ends_at = null, current_period_start = now() - interval '15 days', current_period_end = now() + interval '15 days' where restaurant_id = r;
  perform public.restaurant_change_plan(r, 'business');
  select * into i from public.subscription_invoices where restaurant_id = r and kind = 'upgrade';
  v_diff := round((64900 - 34900) * 0.5);
  assert i.total_cents between v_diff - 100 and v_diff + 100, 'upgrade: diferença proporcional: ' || i.total_cents;
  assert (select plan_code from public.restaurant_subscriptions where restaurant_id = r) = 'business', 'vale na hora';
  perform public.restaurant_change_plan(r, 'essencial');
  select * into s from public.restaurant_subscriptions where restaurant_id = r;
  assert s.plan_code = 'business' and s.next_plan_code = 'essencial', 'downgrade fica para o ciclo seguinte';
  -- Renova: aplica o downgrade.
  update public.restaurant_subscriptions set current_period_end = now() - interval '1 second' where restaurant_id = r;
  perform private.subscription_tick();
  select * into s from public.restaurant_subscriptions where restaurant_id = r;
  assert s.plan_code = 'essencial' and s.next_plan_code is null and s.current_period_end > now() + interval '27 days', 'virou no ciclo seguinte';
  assert (select total_cents from public.subscription_invoices where restaurant_id = r and kind = 'renewal' order by created_at desc limit 1) >= 19900 - 1, 'no preço do novo plano';
  -- Anual: 10 meses, e passar para anual vale da próxima fatura.
  perform public.restaurant_change_plan(r, 'essencial', 'annual');
  select * into s from public.restaurant_subscriptions where restaurant_id = r;
  assert s.billing_cycle = 'monthly' and s.next_billing_cycle = 'annual', 'anual vale a partir da próxima fatura';
  assert private.plan_period_price(r, 'essencial', 'annual') = 199000, 'anual equivale a 10 meses';
end $$;
select pass('critérios 3 e 4: upgrade na hora com diferença; downgrade no ciclo seguinte; anual equivale a 10 meses');

-- Critérios 5 e 9
do $$
declare r uuid := pg_temp.ctx('r'); menu uuid; c uuid := gen_random_uuid(); o uuid; j jsonb; a jsonb; used bigint; v_from timestamptz := now() - interval '1 hour';
begin
  perform set_config('noowe.status_actor', 'system', true);
  used := private.plan_orders_used(r, v_from, now() + interval '1 hour');
  insert into auth.users(id, email) values (c, c || '@m4.test');
  insert into public.profiles(id) values (c) on conflict do nothing;
  insert into public.orders(restaurant_id, customer_id) values (r, c), (r, c);
  assert private.plan_orders_used(r, v_from, now() + interval '1 hour') = used + 2, 'cada envio conta 1';
  select id into menu from public.menu_items where restaurant_id = r limit 1;
  insert into public.orders(restaurant_id, customer_id) values (r, c) returning id into o;
  insert into public.order_items(order_id, menu_item_id, quantity, unit_price, total_price, status) values (o, menu, 1, 10, 10, 'cancelled');
  assert private.plan_orders_used(r, v_from, now() + interval '1 hour') = used + 2, 'cancelado não conta';
  -- Pedido feito na espera é um pedido. Entrar na fila, sem pedir, não conta (resposta 25).
  insert into public.waitlist_entries(restaurant_id, customer_id, customer_name, party_size, position, status) values (r, c, 'Ana', 2, 1, 'seated');
  assert private.plan_orders_used(r, v_from, now() + interval '1 hour') = used + 2, 'entrar na fila não conta';
  assert private.plan_overage_cents(r, 'essencial', 1000) = 0, 'na franquia, sem excedente';
  assert private.plan_overage_cents(r, 'essencial', 1010) = 150, 'R$ 0,15 por pedido acima';
  perform pg_temp.act(pg_temp.ctx('dono'));
  j := public.restaurant_get_plan_summary(r);
  assert j->'usage' ? 'projectedOverageCents' and (j->'usage'->>'allowance')::int = 1000, 'previsão na tela';
end $$;
select pass('critérios 5 e 9: pedido na franquia e excedente, calculados no servidor');

-- Critério 6
do $$
declare r uuid := pg_temp.ctx('r');
begin
  update public.restaurant_subscriptions set current_period_end = now() + interval '20 days', renewal_notified_for = null where restaurant_id = r;
  perform private.subscription_tick();
  assert exists (select 1 from public.notifications n join public.user_roles u on u.user_id = n.user_id and u.role = 'owner' and u.restaurant_id = r where n.metadata->>'kind' = 'plan_renewal_notice'), 'aviso de renovação';
  assert (select renewal_notified_for from public.restaurant_subscriptions where restaurant_id = r) is not null, 'uma vez por período';
end $$;
select pass('critério 6: aviso antes da renovação');

-- Critérios 7 e 8
do $$
declare r uuid := pg_temp.ctx('r'); i public.subscription_invoices; c uuid := gen_random_uuid(); tbl jsonb; sid uuid; menu uuid; o uuid;
begin
  perform pg_temp.act(pg_temp.ctx('dono'));
  tbl := public.restaurant_create_table(r, 'm4-' || c, 4);
  select id into menu from public.menu_items where restaurant_id = r limit 1;
  insert into auth.users(id, email) values (c, c || '@m4.test');
  insert into public.profiles(id) values (c) on conflict do nothing;
  perform pg_temp.act(c);
  sid := (public.customer_open_table_session(tbl->>'qr_code')->>'tableSessionId')::uuid;
  update public.subscription_invoices set status = 'paid' where restaurant_id = r;
  insert into public.subscription_invoices(restaurant_id, kind, period_start, period_end, subtotal_cents, total_cents, due_at) values (r, 'renewal', now(), now(), 100, 100, now() - interval '1 day') returning * into i;
  -- Só vence o que virou cobrança.
  update public.subscription_invoices set provider_ref = 'pay_m4' where restaurant_id = r and status = 'open';
  perform private.subscription_tick();
  assert (select status from public.subscription_invoices where id = i.id) = 'overdue', 'vencida';
  assert (select status from public.restaurant_subscriptions where restaurant_id = r) = 'past_due', 'em atraso';
  assert not (select coalesce((select billing_hidden from private.restaurant_billing_flags where restaurant_id = r), false)), 'dentro da tolerância segue na busca';
  update public.subscription_invoices set due_at = now() - interval '8 days' where id = i.id;
  perform private.subscription_tick();
  assert (select coalesce((select billing_hidden from private.restaurant_billing_flags where restaurant_id = r), false)) and not (select coalesce((select orders_suspended from private.restaurant_billing_flags where restaurant_id = r), false)), 'sai da busca';
  update public.subscription_invoices set due_at = now() - interval '31 days' where id = i.id;
  perform private.subscription_tick();
  assert (select coalesce((select orders_suspended from private.restaurant_billing_flags where restaurant_id = r), false)), 'suspende pedido novo';
  -- Comanda aberta segue.
  insert into public.orders(restaurant_id, customer_id, table_session_id) values (r, c, sid) returning id into o;
  assert o is not null, 'comanda aberta continua pedindo';
  assert (select status from public.table_sessions where id = sid) = 'active', 'e aberta';
  assert pg_temp.state_of(format($q$insert into public.orders(restaurant_id, customer_id) values (%L, %L)$q$, r, c)) = 'P0015', 'pedido fora de comanda, não';
  perform pg_temp.act(pg_temp.ctx('dono'));
  assert pg_temp.state_of(format($q$insert into public.table_sessions(restaurant_id, table_id, status) values (%L, %L, 'active')$q$, r, (public.restaurant_create_table(r, 'susp-' || gen_random_uuid(), 2)->>'id')::uuid)) = 'P0015', 'comanda nova, não';
  -- Dados seguem acessíveis.
  perform pg_temp.act(pg_temp.ctx('dono'));
  assert public.restaurant_get_plan_summary(r) ? 'status', 'dados seguem acessíveis';
  assert jsonb_array_length(public.restaurant_list_invoices(r)) > 0, 'faturas também';
  -- Pagou: tudo volta.
  perform public.service_invoice_paid(i.id);
  assert not (select coalesce((select billing_hidden or orders_suspended from private.restaurant_billing_flags where restaurant_id = r), false)), 'paga, volta';
  assert (select status from public.restaurant_subscriptions where restaurant_id = r) = 'active', 'em dia';
  assert (select nfse_status from public.subscription_invoices where id = i.id) = 'waiting_company_data', 'nota espera os dados da empresa';
end $$;
select pass('critérios 7 e 8: atraso avisa, tira da busca e suspende pedido novo; nunca bloqueia comanda aberta');

-- Compensação na fatura (M2, critério 12)
do $$
declare r uuid := pg_temp.ctx('r'); i public.subscription_invoices; tx uuid;
begin
  update private.noowe_pay_compensations set status = 'voided' where restaurant_id = r and status = 'open';
  update public.subscription_invoices set status = 'paid' where restaurant_id = r and status <> 'paid';
  insert into public.gateway_transactions(restaurant_id, provider, payment_method, amount_cents, refunded_amount_cents, status, idempotency_key, purpose, created_at, updated_at) values (r, 'asaas', 'pix', 100, 0, 'completed', 'm4-c-' || gen_random_uuid(), 'order', now(), now()) returning id into tx;
  insert into private.noowe_pay_compensations(restaurant_id, gateway_transaction_id, kind, amount_cents) values (r, tx, 'tariff_over_fee', 500);
  i := private.invoice_create(r, 'renewal', now(), now() + interval '1 month', 300, 'Plano');
  assert i.total_cents = 0 and i.status = 'paid', 'abate a mensalidade inteira';
  assert (select amount_cents from public.subscription_invoice_lines where invoice_id = i.id and kind = 'fee_adjustment') = -300, 'linha "Ajuste de taxa NOOWE Pay"';
  assert (select amount_cents - applied_cents from private.noowe_pay_compensations where gateway_transaction_id = tx) = 200, 'o que sobra segue';
  i := private.invoice_create(r, 'renewal', now(), now() + interval '1 month', 1000, 'Plano');
  assert i.total_cents = 800, 'desconta o resto na próxima';
  assert (select status from private.noowe_pay_compensations where gateway_transaction_id = tx) = 'invoiced', 'fechada';
  -- O que o restaurante deve entra por cima.
  insert into private.noowe_pay_compensations(restaurant_id, gateway_transaction_id, kind, amount_cents) values (r, tx, 'fee_kept_on_refund', 50);
  i := private.invoice_create(r, 'renewal', now(), now() + interval '1 month', 1000, 'Plano');
  assert i.total_cents = 1050, 'taxa não devolvida entra na fatura';
end $$;
select pass('M2, critério 12: a compensação entra na fatura, sem limite nem validade; o que passa segue para as próximas');

-- Cancelamento
do $$
declare r uuid := pg_temp.ctx('r');
begin
  -- Faturas das cenas anteriores não contam: aqui não há próximo período pago.
  delete from public.subscription_invoices where restaurant_id = r and kind = 'renewal';
  update public.restaurant_subscriptions set renewal_invoiced_for = null where restaurant_id = r;
  perform pg_temp.act(pg_temp.ctx('dono'));
  assert pg_temp.state_of(format($q$select public.restaurant_cancel_subscription(%L, ' ')$q$, r)) = '22023', 'exige motivo';
  perform public.restaurant_cancel_subscription(r, 'Fechando a casa');
  assert (select status from public.restaurant_subscriptions where restaurant_id = r) <> 'canceled', 'o serviço segue até o fim do período';
  update public.restaurant_subscriptions set current_period_end = now() - interval '1 second' where restaurant_id = r;
  perform private.subscription_tick();
  assert (select status from public.restaurant_subscriptions where restaurant_id = r) = 'canceled', 'acabou o período, cancela';
  assert (public.restaurant_get_plan_summary(r)->>'needsChoice')::boolean, 'pode escolher de novo';
  assert exists (select 1 from public.audit_logs where action = 'plan.cancel_requested' and entity_id = r), 'registrado';
end $$;
select pass('cancelamento: com motivo, segue até o fim do período, sem reembolso');

select ok((select relrowsecurity from pg_class where oid = 'public.restaurant_subscriptions'::regclass) and (select relrowsecurity from pg_class where oid = 'public.subscription_invoices'::regclass) and (select relrowsecurity from pg_class where oid = 'public.subscription_invoice_lines'::regclass), 'RLS ligado');
select ok(not has_function_privilege('authenticated', 'public.service_invoice_paid(uuid)', 'EXECUTE') and not has_function_privilege('authenticated', 'public.service_invoice_claim(uuid)', 'EXECUTE'), 'as portas do worker não abrem para o app');
select ok(not has_function_privilege('authenticated', 'private.invoice_create(uuid,text,timestamptz,timestamptz,bigint,text,bigint,text,timestamptz)', 'EXECUTE'), 'criar fatura também não');
do $$ begin grant select on _ctx to authenticated; end $$;
select _test.as_user(pg_temp.ctx('gerente'));
select is((select count(*)::int from public.subscription_invoices), 0, 'gerente não lê faturas');
select _test.reset_role();

select * from finish();
rollback;
