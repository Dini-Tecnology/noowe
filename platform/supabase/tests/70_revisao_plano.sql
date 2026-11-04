-- Revisão de M4, M5 e M6: o que os testes das fatias não cobriam.
begin;
select plan(8);
create function pg_temp.act(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true) $$;
create function pg_temp.state_of(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ok'; exception when sqlstate 'P0004' then return 'P0004'; when others then return sqlstate; end $$;
create temp table _ctx(k text primary key, v uuid);
create function pg_temp.ctx(p text) returns uuid language sql as $$ select v from _ctx where k = p $$;
-- Assinatura ativa, fora do teste.
create function pg_temp.sub(p_plan text, p_cycle text) returns void language plpgsql as $$
declare r uuid := pg_temp.ctx('r');
begin
  delete from private.noowe_promo_redemptions where restaurant_id = r;
  delete from public.subscription_invoices where restaurant_id = r;
  delete from public.restaurant_subscriptions where restaurant_id = r;
  insert into public.restaurant_subscriptions(restaurant_id, plan_code, billing_cycle, status, current_period_start, current_period_end)
    values (r, p_plan, p_cycle, 'active', now() - interval '20 days', now() + interval '10 days');
end $$;

do $$
declare r uuid := 'c1000000-0000-4000-8000-000000000002'; w uuid := gen_random_uuid();
begin
  insert into _ctx values ('r', r), ('dono', 'c1000000-0000-4000-8000-000000000001'), ('waiter', w);
  perform pg_temp.act(pg_temp.ctx('dono'));
  insert into auth.users(id, email) values (w, w || '@plano.test');
  insert into public.profiles(id) values (w) on conflict do nothing;
  insert into public.user_roles(user_id, restaurant_id, role, is_active) values (w, r, 'waiter', true);
  update public.restaurants set settings = coalesce(settings, '{}'::jsonb) || '{"cnpj":"12.ABC.345/01DE-35"}'::jsonb where id = r;
  delete from public.fiscal_configs where restaurant_id = r;
  delete from private.noowe_credit_lots where restaurant_id = r;
  update private.noowe_pay_compensations set status = 'voided' where restaurant_id = r and status = 'open';
end $$;

-- A fatura chega ao provedor, com o CNPJ que o app grava, inclusive o alfanumérico.
do $$
declare r uuid := pg_temp.ctx('r'); i public.subscription_invoices; j jsonb; v_days int;
begin
  perform pg_temp.sub('essencial', 'monthly');
  select invoice_due_days into v_days from private.noowe_billing_settings;
  i := private.invoice_create(r, 'renewal', now(), now() + interval '1 month', 19900, 'Plano');
  assert i.due_at > now() + make_interval(days => v_days - 1), 'prazo do parâmetro';
  update public.subscription_invoices set claimed_at = null where id = i.id;
  j := public.service_invoice_claim(i.id);
  assert (j->>'claimed')::boolean, 'pega: ' || j;
  assert j->>'cnpj' = '12ABC34501DE35', 'CNPJ do perfil: ' || j;
  -- Vencimento no passado: o prazo conta de novo a partir da cobrança.
  update public.subscription_invoices set due_at = now() - interval '5 days', claimed_at = null where id = i.id;
  j := public.service_invoice_claim(i.id);
  assert (j->>'dueDate')::date > (now() at time zone 'America/Sao_Paulo')::date, 'vencimento futuro: ' || j;
end $$;
select pass('a fatura chega ao provedor, com o CNPJ do perfil e vencimento válido');

-- Sem cobrança, não há atraso; quem corrige depois ainda recebe.
do $$
declare r uuid := pg_temp.ctx('r'); i public.subscription_invoices;
begin
  perform pg_temp.sub('essencial', 'monthly');
  i := private.invoice_create(r, 'renewal', now(), now() + interval '1 month', 19900, 'Plano');
  update public.subscription_invoices set due_at = now() - interval '40 days', attempts = 6, claimed_at = now() - interval '2 days' where id = i.id;
  perform private.subscription_tick();
  assert (select status from public.subscription_invoices where id = i.id) = 'open', 'sem cobrança não vence';
  assert not (select orders_suspended from public.restaurants where id = r), 'nem suspende';
  perform public.service_invoice_attach(i.id, null, null, null, 'Restaurante sem CNPJ para gerar a fatura');
  assert exists (select 1 from public.notifications n where n.metadata->>'kind' = 'plan_invoice_blocked'), 'o Dono é avisado';
  -- Com cobrança, o atraso corre.
  update public.subscription_invoices set provider_ref = 'pay_1' where id = i.id;
  perform private.subscription_tick();
  assert (select status from public.subscription_invoices where id = i.id) = 'overdue', 'com cobrança, vence';
  assert (select orders_suspended from public.restaurants where id = r), 'e suspende';
  update public.subscription_invoices set status = 'paid' where id = i.id;
  perform private.subscription_apply_overdue(r);
end $$;
select pass('atraso só corre com cobrança de verdade, e o Dono sabe por que não veio');

-- Código: respeita ciclo e plano, e no anual conta mês a mês.
do $$
declare r uuid := pg_temp.ctx('r'); i public.subscription_invoices; v_year bigint;
begin
  perform set_config('noowe.param_author', 'teste', true);
  insert into private.noowe_promo_codes(code, kind, duration_months, allow_monthly, allow_annual) values ('SOMENSAL', 'free_months', 1, true, false);
  insert into private.noowe_promo_codes(code, kind, duration_months, allow_monthly, allow_annual) values ('DOISMESES', 'free_months', 2, true, true);
  -- Mudou para anual: o código de mensal não dá o ano de graça.
  perform pg_temp.sub('essencial', 'annual');
  insert into private.noowe_promo_redemptions(restaurant_id, code) values (r, 'SOMENSAL');
  v_year := private.plan_period_price(r, 'essencial', 'annual');
  i := private.invoice_create(r, 'renewal', now(), now() + interval '1 year', v_year, 'Plano');
  assert i.total_cents = v_year, 'cobra o ano: ' || i.total_cents;
  assert (select status from private.noowe_promo_redemptions where restaurant_id = r) = 'ended', 'o código acaba';
  assert exists (select 1 from public.notifications n where n.metadata->>'kind' = 'plan_promo_ended'), 'o Dono sabe';
  -- Código que vale no anual: dois meses grátis são dois doze avos.
  perform pg_temp.sub('essencial', 'annual');
  insert into private.noowe_promo_redemptions(restaurant_id, code) values (r, 'DOISMESES');
  i := private.invoice_create(r, 'renewal', now(), now() + interval '1 year', 120000, 'Plano');
  assert i.total_cents = 100000, 'só os dois meses: ' || i.total_cents;
  assert (select status from private.noowe_promo_redemptions where restaurant_id = r) = 'ended', 'esgotou no período';
  -- Mensal: o próximo mês é pela fatura, e não pelo relógio.
  perform pg_temp.sub('essencial', 'monthly');
  insert into private.noowe_promo_redemptions(restaurant_id, code, started_at) values (r, 'DOISMESES', now() - interval '20 seconds');
  i := private.invoice_create(r, 'renewal', now(), now() + interval '1 month', 19900, 'Plano');
  assert i.total_cents = 0, 'primeira grátis';
  i := private.invoice_create(r, 'renewal', now(), now() + interval '1 month', 19900, 'Plano');
  assert i.total_cents = 0, 'segunda grátis';
  i := private.invoice_create(r, 'renewal', now(), now() + interval '1 month', 19900, 'Plano');
  assert i.total_cents = 19900, 'a terceira é cheia';
end $$;
select pass('código respeita plano e ciclo; no anual conta mês a mês; a fase anda por fatura');

-- Excedente não se cobra duas vezes.
do $$
declare r uuid := pg_temp.ctx('r'); s public.restaurant_subscriptions; v_n int;
begin
  perform pg_temp.sub('essencial', 'annual');
  update public.restaurant_subscriptions set current_period_start = now() - interval '2 months', last_overage_billed_at = now() - interval '2 months', current_period_end = now() + interval '10 months' where restaurant_id = r;
  insert into public.orders(restaurant_id, customer_id, status, created_at) select r, pg_temp.ctx('dono'), 'pending', now() - interval '45 days' from generate_series(1, 1100);
  perform private.subscription_tick();
  select count(*) into v_n from public.subscription_invoices where restaurant_id = r and kind = 'overage';
  assert v_n = 1, 'um mês, uma fatura: ' || v_n;
  update public.restaurant_subscriptions set last_overage_billed_at = now() - interval '2 months' where restaurant_id = r;
  perform private.subscription_tick();
  assert (select count(*) from public.subscription_invoices where restaurant_id = r and kind = 'overage') = 1, 'mesmo período não repete';
  -- Renovar zera o marcador, e voltar depois não cobra o que passou.
  select * into s from public.restaurant_subscriptions where restaurant_id = r;
  perform private.subscription_renew(s);
  assert (select last_overage_billed_at from public.restaurant_subscriptions where restaurant_id = r) is null, 'marcador zerado';
end $$;
select pass('excedente não se cobra duas vezes');

-- Cancelado: fica sem os recursos do plano, e o último mês tem excedente.
do $$
declare r uuid := pg_temp.ctx('r');
begin
  perform pg_temp.sub('essencial', 'monthly');
  update public.restaurant_subscriptions set cancel_requested_at = now(), current_period_start = now() - interval '31 days', current_period_end = now() - interval '1 minute' where restaurant_id = r;
  insert into public.orders(restaurant_id, customer_id, status, created_at) select r, pg_temp.ctx('dono'), 'pending', now() - interval '10 days' from generate_series(1, 1100);
  perform private.subscription_tick();
  assert (select status from public.restaurant_subscriptions where restaurant_id = r) = 'canceled', 'cancelou';
  assert exists (select 1 from public.subscription_invoices where restaurant_id = r and kind = 'overage'), 'excedente do último mês';
  assert not private.plan_allows(r, 'loyalty') and not private.plan_allows(r, 'reservations'), 'sem recursos do plano';
end $$;
select pass('cancelado fica sem os recursos do plano, e o último mês tem o excedente');

-- Quem não escolheu: 30 dias do primeiro acesso, e depois os prazos de atraso, sem travar a comanda aberta.
do $$
declare r uuid := pg_temp.ctx('r'); v_trial int;
begin
  delete from public.subscription_invoices where restaurant_id = r;
  delete from public.restaurant_subscriptions where restaurant_id = r;
  update public.restaurants set billing_hidden = false, orders_suspended = false, plan_prompted_at = null where id = r;
  assert private.plan_allows(r, 'loyalty'), 'antes de escolher, segue com tudo';
  perform pg_temp.act(pg_temp.ctx('waiter'));
  assert pg_temp.state_of(format($q$select public.restaurant_note_plan_prompt(%L)$q$, r)) = '42501', 'só o Dono';
  perform pg_temp.act(pg_temp.ctx('dono'));
  perform public.restaurant_note_plan_prompt(r);
  assert (select plan_prompted_at from public.restaurants where id = r) is not null, 'marca o acesso';
  perform private.subscription_tick();
  assert not (select billing_hidden from public.restaurants where id = r), 'dentro do prazo';
  select trial_days into v_trial from private.noowe_billing_settings;
  update public.restaurants set plan_prompted_at = now() - make_interval(days => v_trial + 200) where id = r;
  perform private.subscription_tick();
  assert (select billing_hidden and orders_suspended from public.restaurants where id = r), 'passou de tudo';
  -- Escolheu: volta ao normal.
  perform public.restaurant_choose_plan(r, 'essencial', 'monthly');
  perform private.subscription_tick();
  assert not (select billing_hidden or orders_suspended from public.restaurants where id = r), 'escolheu, normalizou';
end $$;
select pass('quem não escolhe plano: 30 dias do primeiro acesso, e depois os prazos de atraso');

-- O plano vale no servidor: app do garçom, fidelidade e NFC-e.
do $$
declare r uuid := pg_temp.ctx('r'); tbl jsonb; sid uuid; c uuid := gen_random_uuid(); d uuid := gen_random_uuid(); lp uuid; j jsonb;
begin
  perform pg_temp.sub('essencial', 'monthly');
  perform pg_temp.act(pg_temp.ctx('dono'));
  insert into auth.users(id, email) values (c, c || '@plano.test');
  insert into public.profiles(id) values (c) on conflict do nothing;
  tbl := public.restaurant_create_table(r, 'p-' || gen_random_uuid(), 4);
  -- Sem split no Essencial o cliente abre a mesa do mesmo jeito.
  perform pg_temp.act(c);
  sid := (public.customer_open_table_session(tbl->>'qr_code')->>'tableSessionId')::uuid;
  perform pg_temp.act(pg_temp.ctx('waiter'));
  assert pg_temp.state_of(format($q$select public.restaurant_get_session_bill(%L)$q$, sid)) = 'P0014', 'garçom sem o app do plano';
  assert pg_temp.state_of(format($q$select public.restaurant_get_table_bills(%L)$q$, r)) = 'P0014', 'nem a lista';
  perform pg_temp.act(pg_temp.ctx('dono'));
  assert pg_temp.state_of(format($q$select public.restaurant_get_session_bill(%L)$q$, sid)) <> 'P0014', 'o Dono segue cobrando';
  -- NFC-e
  insert into public.fiscal_documents(id, restaurant_id, table_session_id, external_ref, total_cents, status) values (d, r, sid, 'p-' || sid, 1000, 'pending');
  j := public.service_fiscal_claim(d);
  assert (select error_code from public.fiscal_documents where id = d) = 'plan_without_nfce', 'nota fora do plano: ' || j;
  -- Fidelidade
  select id into lp from public.loyalty_programs where restaurant_id = r limit 1;
  if lp is not null then
    update public.loyalty_programs set user_id = c, is_active = true where id = lp;
    perform pg_temp.act(c);
    assert pg_temp.state_of(format($q$select public.customer_redeem_loyalty_reward(%L, 'x')$q$, lp)) = 'P0014', 'fidelidade fora do plano';
  end if;
end $$;
select pass('o plano vale no servidor para o app do garçom, a fidelidade e a NFC-e');

select is((select string_agg(column_name, ',') from information_schema.columns where table_schema = 'private' and table_name = 'noowe_billing_settings' and column_name = 'invoice_due_days'), 'invoice_due_days', 'vencimento em parâmetro');

select * from finish();
rollback;
