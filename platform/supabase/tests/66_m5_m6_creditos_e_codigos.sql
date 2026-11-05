-- M5 e M6: um teste por critério do servidor.
begin;
select plan(17);
create function pg_temp.act(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true) $$;
create function pg_temp.state_of(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ok'; exception when sqlstate 'P0004' then return 'P0004'; when others then return sqlstate; end $$;
create temp table _ctx(k text primary key, v uuid);
create function pg_temp.ctx(p text) returns uuid language sql as $$ select v from _ctx where k = p $$;
create function pg_temp.pay(p_provider text, p_method text, p_cents bigint, p_at timestamptz, p_refunded bigint default 0) returns uuid language sql as $$
  insert into public.gateway_transactions(restaurant_id, provider, payment_method, amount_cents, refunded_amount_cents, status, idempotency_key, purpose, confirmed_at, created_at, updated_at)
  values (pg_temp.ctx('r'), p_provider, p_method, p_cents, p_refunded, 'completed', 'm5-' || gen_random_uuid(), 'order', p_at, p_at, p_at) returning id $$;
create function pg_temp.last_month() returns timestamptz language sql as $$
  select (date_trunc('month', now() at time zone 'America/Sao_Paulo') - interval '1 month' + interval '10 days') at time zone 'America/Sao_Paulo' $$;

do $$
declare r uuid := 'c1000000-0000-4000-8000-000000000002'; g uuid := gen_random_uuid();
begin
  insert into _ctx values ('r', r), ('dono', 'c1000000-0000-4000-8000-000000000001'), ('gerente', g);
  perform pg_temp.act(pg_temp.ctx('dono'));
  insert into auth.users(id, email) values (g, g || '@m5.test');
  insert into public.profiles(id) values (g) on conflict do nothing;
  insert into public.user_roles(user_id, restaurant_id, role, is_active) values (g, r, 'manager', true);
  delete from public.subscription_invoices where restaurant_id = r;
  delete from public.restaurant_subscriptions where restaurant_id = r;
  delete from private.noowe_promo_redemptions where restaurant_id = r;
  update public.gateway_transactions set status = 'failed' where restaurant_id = r and status = 'completed';
  update private.noowe_pay_compensations set status = 'voided' where restaurant_id = r and status = 'open';
  perform public.restaurant_choose_plan(r, 'essencial', 'monthly');
  -- Assinante desde antes do mês passado, e já fora do teste.
  update public.restaurant_subscriptions set status = 'active', trial_ends_at = null, created_at = now() - interval '4 months',
    current_period_start = now() - interval '5 days', current_period_end = now() + interval '25 days' where restaurant_id = r;
end $$;

-- M5, critérios 1 e 2
do $$
declare r uuid := pg_temp.ctx('r'); f record; t record; v_at timestamptz := pg_temp.last_month();
begin
  perform pg_temp.pay('asaas', 'pix', 600000, v_at);
  perform pg_temp.pay('asaas', 'credit_card', 300000, v_at);
  perform pg_temp.pay('manual', 'cash', 100000, v_at);
  perform pg_temp.pay('manual', 'voucher', 500000, v_at);       -- fora dos dois lados
  perform pg_temp.pay('simulated', 'pix', 900000, v_at);        -- não existe
  select * into f from private.credit_figures(r, v_at - interval '1 day', v_at + interval '1 day');
  assert f.paid_cents = 900000 and f.revenue_cents = 1000000 and f.index_bps = 9000, 'índice sem vale: ' || f.index_bps;
  perform pg_temp.pay('tap', 'tap_card', 100000, v_at);
  select * into f from private.credit_figures(r, v_at - interval '1 day', v_at + interval '1 day');
  assert f.paid_cents = 900000 and f.revenue_cents = 1100000, 'Tap só com o parâmetro';
  perform set_config('noowe.param_author', 'teste M5', true);
  update private.noowe_credit_settings set tap_counts_for_index = true;
  select * into f from private.credit_figures(r, v_at - interval '1 day', v_at + interval '1 day');
  assert f.paid_cents = 1000000, 'com o parâmetro, Tap conta';
  update private.noowe_credit_settings set tap_counts_for_index = false;
  select * into t from private.credit_tier('essencial', 900000, 9000);
  assert t.tier_code = 'platinum' and t.credit_bps = 2000, 'faixa da tabela';
  select * into t from private.credit_tier('essencial', 700000, 9000);
  assert t.tier_code is null, 'abaixo do volume mínimo, sem crédito';
end $$;
select pass('M5, critérios 1 e 2: índice sem vale, Tap só com o parâmetro; faixa e mínimo vêm da tabela');

-- M5, critério 3
do $$
declare r uuid := pg_temp.ctx('r'); f record; v_at timestamptz := pg_temp.last_month() + interval '2 days'; a uuid; b uuid;
begin
  a := pg_temp.pay('asaas', 'pix', 100000, v_at, 40000);
  select * into f from private.credit_figures(r, v_at - interval '1 hour', v_at + interval '1 hour');
  assert f.paid_cents = 60000, 'estorno parcial sai';
  update public.gateway_transactions set status = 'refunded' where id = a;
  select * into f from private.credit_figures(r, v_at - interval '1 hour', v_at + interval '1 hour');
  assert f.paid_cents = 0, 'estorno total sai';
  b := pg_temp.pay('asaas', 'pix', 100000, v_at);
  insert into private.noowe_pay_transaction_fees(gateway_transaction_id, restaurant_id, payment_method, rate_bps, amount_cents, fee_cents, chargeback_at) values (b, r, 'pix', 99, 100000, 990, now());
  select * into f from private.credit_figures(r, v_at - interval '1 hour', v_at + interval '1 hour');
  assert f.paid_cents = 0, 'contestação sai';
  update public.gateway_transactions set status = 'failed' where id = b;
end $$;
select pass('M5, critério 3: fechamento desconta estornos e contestações');

-- Fechamento do mês: crédito de 20% de R$ 199.
do $$
declare r uuid := pg_temp.ctx('r'); l private.noowe_credit_lots; v_month date := date_trunc('month', (now() at time zone 'America/Sao_Paulo') - interval '1 month')::date;
begin
  delete from private.noowe_credit_month_close where restaurant_id = r;
  delete from private.noowe_credit_lots where restaurant_id = r;
  perform private.credit_tick();
  select * into l from private.noowe_credit_lots where restaurant_id = r and month = v_month;
  assert l.amount_cents = 3980, 'sobre o preço mensal de tabela: ' || coalesce(l.amount_cents::text, 'nada');
  assert l.available_from = (v_month + interval '2 months')::date, 'libera duas faturas depois';
  assert l.expires_at = (v_month + interval '7 months')::date, 'expira em 6 meses';
  assert exists (select 1 from private.noowe_credit_ledger e where e.lot_id = l.id and e.kind = 'generated' and e.amount_cents = 3980), 'no razão';
  assert exists (select 1 from public.notifications n join public.user_roles u on u.user_id = n.user_id and u.role = 'owner' and u.restaurant_id = r where n.metadata->>'kind' = 'credit_generated'), 'Dono avisado';
  perform private.credit_tick();
  assert (select count(*) from private.noowe_credit_lots where restaurant_id = r and month = v_month) = 1, 'fechar de novo não duplica';
  insert into _ctx values ('lot', l.id);
end $$;
select pass('M5, critérios 2 e 4: crédito gerado sobre o preço de tabela, libera depois e expira no prazo');

-- M5, critério 4: uso.
do $$
declare r uuid := pg_temp.ctx('r'); i public.subscription_invoices; lot uuid := pg_temp.ctx('lot');
begin
  -- Antes de liberar, não abate.
  i := private.invoice_create(r, 'renewal', now(), now() + interval '1 month', 19900, 'Plano');
  assert i.total_cents = 19900, 'ainda não liberado';
  update private.noowe_credit_lots set available_from = (now() at time zone 'America/Sao_Paulo')::date - 1, amount_cents = 20000, remaining_cents = 20000 where id = lot;
  i := private.invoice_create(r, 'renewal', now(), now() + interval '1 month', 19900, 'Plano');
  assert i.total_cents = 19900 - 5970, 'abate até 30%: ' || i.total_cents;
  assert (select amount_cents from public.subscription_invoice_lines where invoice_id = i.id and kind = 'credit') = -5970, 'linha na fatura';
  assert (select remaining_cents from private.noowe_credit_lots where id = lot) = 20000 - 5970, 'o resto fica para as próximas';
  -- Só a mensalidade: excedente e diferença de upgrade não usam crédito.
  i := private.invoice_create(r, 'overage', now(), now() + interval '1 month', 0, null, 1000, 'Excedente');
  assert i.total_cents = 1000, 'excedente não usa crédito';
  i := private.invoice_create(r, 'upgrade', now(), now() + interval '1 month', 1000, 'Diferença');
  assert i.total_cents = 1000, 'nem a diferença de plano';
  -- Expirar.
  update private.noowe_credit_lots set expires_at = (now() at time zone 'America/Sao_Paulo')::date where id = lot;
  perform private.credit_tick();
  assert (select remaining_cents from private.noowe_credit_lots where id = lot) = 0, 'expira';
  assert exists (select 1 from private.noowe_credit_ledger where lot_id = lot and kind = 'expired'), 'no razão';
end $$;
select pass('M5, critério 4: libera depois, abate até 30%, só a mensalidade, e expira');

-- M5, critérios 5 e 8
do $$
declare r uuid := pg_temp.ctx('r'); lot uuid := pg_temp.ctx('lot');
begin
  update private.noowe_credit_lots set remaining_cents = 1000, expires_at = (now() at time zone 'America/Sao_Paulo')::date + 90 where id = lot;
  perform private.subscription_on_canceled(r);
  assert (select remaining_cents from private.noowe_credit_lots where id = lot) = 0, 'some ao cancelar';
  assert exists (select 1 from private.noowe_credit_ledger where lot_id = lot and kind = 'lost'), 'registrado';
  assert pg_temp.state_of($q$update private.noowe_credit_ledger set amount_cents = 1$q$) = '42501', 'razão imutável';
  assert pg_temp.state_of($q$delete from private.noowe_credit_ledger$q$) = '42501', 'nem apaga';
  assert not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'restaurants' and column_name like '%credit%'), 'não vira dinheiro nem saldo do restaurante';
end $$;
select pass('M5, critérios 5 e 8: some ao cancelar, e o razão é imutável');

-- M5, critérios 6 e 7
do $$
declare r uuid := pg_temp.ctx('r'); j jsonb; v_at timestamptz := now() - interval '1 minute';
begin
  update private.noowe_credit_lots set remaining_cents = 500, available_from = (now() at time zone 'America/Sao_Paulo')::date - 1, expires_at = (now() at time zone 'America/Sao_Paulo')::date + 10 where id = pg_temp.ctx('lot');
  perform pg_temp.pay('asaas', 'pix', 900000, v_at);
  perform pg_temp.pay('manual', 'cash', 900000, v_at);
  perform pg_temp.act(pg_temp.ctx('dono'));
  j := public.restaurant_get_credits(r);
  assert (j->>'indexBps')::int = 5000 and j->>'tierCode' = 'silver', 'índice em tempo real: ' || (j->>'indexBps');
  assert (j->>'forecastCents')::bigint = 995, 'previsão se o mês fechasse agora';
  -- Faltam X para 60%: (900000 + X) / (1800000 + X) = 0,6 → X = 450000.
  assert j->'nextTier'->>'name' = 'Ouro' and (j->'nextTier'->>'missingCents')::bigint = 450000, 'quanto falta: ' || (j->'nextTier'->>'missingCents');
  assert (j->>'balanceCents')::bigint = 500 and (j->>'expiringSoonCents')::bigint = 500, 'saldo e a expirar';
  assert jsonb_array_length(j->'marks') = 3 and jsonb_array_length(j->'statement') > 0, 'marcas e extrato';
  perform pg_temp.act(pg_temp.ctx('gerente'));
  assert pg_temp.state_of(format($q$select public.restaurant_get_credits(%L)$q$, r)) = '42501', 'gerente não vê valores';
  j := public.restaurant_get_credit_index(r);
  assert (j->>'indexBps')::int = 5000 and j->>'tierName' = 'Prata' and not (j::text ~ 'Cents'), 'índice e faixa, nunca reais';
end $$;
select pass('M5, critérios 6 e 7: tela do Dono com índice, previsão e quanto falta; gerente vê só índice e faixa');

-- M6
do $$
declare r uuid := pg_temp.ctx('r');
begin
  perform set_config('noowe.param_author', 'teste M6', true);
  insert into private.noowe_promo_codes(code, kind, duration_months, valid_until, max_uses, plan_codes) values ('VENCIDO', 'free_months', 1, now() - interval '1 day', null, null);
  insert into private.noowe_promo_codes(code, kind, duration_months, max_uses) values ('ESGOTADO', 'free_months', 1, 0 + 1);
  insert into private.noowe_promo_codes(code, kind, duration_months, plan_codes) values ('SOBUSINESS', 'free_months', 1, '{business}');
  insert into private.noowe_promo_codes(code, kind, duration_months, allow_monthly, allow_annual) values ('SOANUAL', 'free_months', 1, false, true);
  insert into private.noowe_promo_codes(code, kind, duration_months, new_restaurants_only) values ('NOVOS', 'free_months', 1, true);
  insert into private.noowe_promo_codes(code, kind, duration_months, percent_off_bps) values ('METADE', 'percent_off', 2, 5000);
  insert into private.noowe_promo_codes(code, kind, duration_months, amount_off_cents) values ('MENOSDEZ', 'fixed_off', 1, 1000);
  insert into private.noowe_promo_codes(code, kind, duration_months, skips_trial, grants_category) values ('FUNDADOR', 'free_months', 12, true, 'Parceiro Fundador');
  insert into private.noowe_promo_code_phases(code, phase_order, kind, duration_months, percent_off_bps) values ('FUNDADOR', 1, 'free_months', 6, null), ('FUNDADOR', 2, 'percent_off', 6, 5000);
  -- O limite de ESGOTADO já foi usado por outro restaurante.
  insert into private.noowe_promo_redemptions(restaurant_id, code, status)
    select id, 'ESGOTADO', 'ended' from public.restaurants where id <> r limit 1;
  perform pg_temp.act(pg_temp.ctx('gerente'));
  assert pg_temp.state_of(format($q$select public.restaurant_apply_promo_code(%L, 'METADE')$q$, r)) = '42501', 'só o Dono aplica';
  perform pg_temp.act(pg_temp.ctx('dono'));
  assert pg_temp.state_of(format($q$select public.restaurant_apply_promo_code(%L, 'NAOEXISTE')$q$, r)) = 'P0016', 'código inválido';
  assert pg_temp.state_of(format($q$select public.restaurant_apply_promo_code(%L, 'VENCIDO')$q$, r)) = 'P0016', 'validade';
  assert pg_temp.state_of(format($q$select public.restaurant_apply_promo_code(%L, 'ESGOTADO')$q$, r)) = 'P0016', 'limite de usos';
  assert pg_temp.state_of(format($q$select public.restaurant_apply_promo_code(%L, 'SOBUSINESS')$q$, r)) = 'P0016', 'plano';
  assert pg_temp.state_of(format($q$select public.restaurant_apply_promo_code(%L, 'SOANUAL')$q$, r)) = 'P0016', 'ciclo';
  assert pg_temp.state_of(format($q$select public.restaurant_apply_promo_code(%L, 'NOVOS')$q$, r)) = 'P0016', 'só novos';
end $$;
select pass('M6, critério 2 e 5: validade, usos, plano, ciclo, só novos; só o Dono aplica');

do $$
declare r uuid := pg_temp.ctx('r'); i public.subscription_invoices; j jsonb;
begin
  update private.noowe_promo_redemptions set status = 'ended' where restaurant_id = r;
  delete from private.noowe_promo_redemptions where restaurant_id = r;
  update private.noowe_credit_lots set remaining_cents = 0 where restaurant_id = r;
  perform pg_temp.act(pg_temp.ctx('dono'));
  update public.restaurant_subscriptions set status = 'active', canceled_at = null where restaurant_id = r;
  j := public.restaurant_apply_promo_code(r, 'metade');
  assert j->'promo'->>'code' = 'METADE' and (j->'promo'->>'priceAfterCents')::bigint = 19900, 'mostra até quando vale e quanto paga depois';
  assert j->'promo'->>'endsAt' is not null, 'até quando';
  j := public.restaurant_apply_promo_code(r, 'METADE');
  assert (select count(*) from private.noowe_promo_redemptions where restaurant_id = r and code = 'METADE') = 1, 'aplicar duas vezes não duplica';
  assert pg_temp.state_of(format($q$select public.restaurant_apply_promo_code(%L, 'MENOSDEZ')$q$, r)) = 'P0016', 'um código por vez';
  i := private.invoice_create(r, 'renewal', now(), now() + interval '1 month', 19900, 'Plano');
  assert i.total_cents = 9950, 'percentual';
  assert (select amount_cents from public.subscription_invoice_lines where invoice_id = i.id and kind = 'promo') = -9950, 'linha do código';
  -- Crédito entra depois do código, com o limite de 30% sobre o que sobrou.
  update private.noowe_credit_lots set remaining_cents = 20000, available_from = (now() at time zone 'America/Sao_Paulo')::date - 1, expires_at = (now() at time zone 'America/Sao_Paulo')::date + 90 where id = pg_temp.ctx('lot');
  update private.noowe_promo_redemptions set status = 'active', months_billed = 0 where restaurant_id = r and code = 'METADE';
  i := private.invoice_create(r, 'renewal', now(), now() + interval '1 month', 19900, 'Plano');
  assert i.total_cents = 9950 - 2985, 'depois do código, até 30%: ' || i.total_cents;
  -- Piso de fatura.
  perform set_config('noowe.param_author', 'teste M6', true);
  update private.noowe_credit_settings set min_invoice_cents = 9000;
  update private.noowe_promo_redemptions set status = 'active', months_billed = 0 where restaurant_id = r and code = 'METADE';
  i := private.invoice_create(r, 'renewal', now(), now() + interval '1 month', 19900, 'Plano');
  assert i.total_cents = 9000, 'respeita o piso: ' || i.total_cents;
  update private.noowe_credit_settings set min_invoice_cents = 0;
end $$;
select pass('M6, critérios 3, 4 e 5: desconto, crédito depois do código, limite e piso; aplicar duas vezes não duplica');

-- Fundador: fases, categoria, dispensa o teste, sem crédito na isenção.
do $$
declare r uuid := pg_temp.ctx('r'); i public.subscription_invoices; rd private.noowe_promo_redemptions; v_month date := date_trunc('month', (now() at time zone 'America/Sao_Paulo') - interval '1 month')::date; n integer;
begin
  delete from private.noowe_promo_redemptions where restaurant_id = r;
  delete from public.subscription_invoices where restaurant_id = r;
  delete from public.restaurant_subscriptions where restaurant_id = r;
  perform pg_temp.act(pg_temp.ctx('dono'));
  perform public.restaurant_choose_plan(r, 'essencial');
  perform public.restaurant_apply_promo_code(r, 'FUNDADOR');
  assert (select status from public.restaurant_subscriptions where restaurant_id = r) = 'active', 'dispensa o teste';
  assert (select noowe_category from public.restaurants where id = r) = 'Parceiro Fundador', 'marca a categoria';
  select * into i from public.subscription_invoices where restaurant_id = r and kind = 'renewal';
  assert i.total_cents = 0 and i.status = 'paid', 'primeiros meses grátis';
  select * into rd from private.noowe_promo_redemptions where restaurant_id = r;
  update private.noowe_promo_redemptions set months_billed = 7 where id = rd.id;
  update private.noowe_credit_lots set remaining_cents = 0 where restaurant_id = r;
  i := private.invoice_create(r, 'renewal', now(), now() + interval '1 month', 19900, 'Plano');
  assert i.total_cents = 9950, 'depois, 50% no restante do primeiro ano: ' || i.total_cents;
  update private.noowe_promo_redemptions set months_billed = 12 where id = rd.id;
  i := private.invoice_create(r, 'renewal', now(), now() + interval '1 month', 19900, 'Plano');
  assert i.total_cents = 19900, 'acabou o benefício';
  assert (select status from private.noowe_promo_redemptions where id = rd.id) = 'ended', 'encerrado';
  assert (select noowe_category from public.restaurants where id = r) = 'Parceiro Fundador', 'a categoria continua';
end $$;
select pass('M6, critérios 6, 7 e 8: fases de fundador, categoria que fica, dispensa o teste');

do $$
declare r uuid := pg_temp.ctx('r');
begin
  delete from private.noowe_promo_redemptions where restaurant_id = r;
  insert into private.noowe_promo_redemptions(restaurant_id, code, started_at, months_billed) values (r, 'FUNDADOR', now() - interval '2 months', 2);
  assert private.promo_free_during(r, now()), 'isenção total';
  update private.noowe_promo_redemptions set months_billed = 8 where restaurant_id = r;
  assert not private.promo_free_during(r, now()), 'desconto parcial';
end $$;
select pass('M6, critério 3: durante a isenção total não gera crédito; em desconto parcial, gera');

select ok(not has_table_privilege('authenticated', 'private.noowe_credit_ledger', 'SELECT') and not has_table_privilege('authenticated', 'private.noowe_promo_redemptions', 'SELECT'), 'razão e uso de códigos fechados');
select ok(exists (select 1 from information_schema.views where table_schema = 'private' and table_name = 'noowe_report_credits'), 'consulta interna de créditos');
select ok(not has_function_privilege('authenticated', 'private.credit_tick()', 'EXECUTE'), 'fechamento não abre para o app');
select ok((select relrowsecurity from pg_class where oid = 'private.noowe_credit_lots'::regclass), 'RLS nos lotes');
select ok((select relrowsecurity from pg_class where oid = 'private.noowe_promo_redemptions'::regclass), 'RLS no uso de códigos');
select ok((select relrowsecurity from pg_class where oid = 'private.noowe_promo_code_phases'::regclass), 'RLS nas fases');
select ok((select relrowsecurity from pg_class where oid = 'private.noowe_credit_month_close'::regclass), 'RLS no fechamento');

select * from finish();
rollback;
