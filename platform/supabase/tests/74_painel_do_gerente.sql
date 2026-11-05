-- Aditivo G: painel do Gerente. Plano sem preço, caixa líquido sem taxa por pagamento, dinheiro oculto com o caixa aberto, rateio da equipe.
begin;
select plan(5);
create function pg_temp.act(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true) $$;
create temp table _ctx(k text primary key, v uuid);
create function pg_temp.pay(p_provider text, p_method text, p_cents bigint, p_refunded bigint default 0) returns uuid language sql as $$
  insert into public.gateway_transactions(restaurant_id, provider, payment_method, amount_cents, refunded_amount_cents, status, idempotency_key, purpose, confirmed_at, created_at, updated_at)
  values ((select v from _ctx where k='r'), p_provider, p_method, p_cents, p_refunded, 'completed', 'mgr-' || gen_random_uuid(), 'order', now() - interval '10 minutes', now() - interval '10 minutes', now()) returning id $$;
create function pg_temp.net(p jsonb, p_method text) returns bigint language sql as $$
  select (e->>'netCents')::bigint from jsonb_array_elements(p->'cash') e where e->>'method' = p_method $$;
create function pg_temp.summary(p_who text) returns jsonb language plpgsql as $$
begin
  perform pg_temp.act((select v from _ctx where k = p_who));
  return public.restaurant_manager_summary((select v from _ctx where k='r'));
end $$;
do $$
declare r uuid := 'c1000000-0000-4000-8000-000000000002'; g uuid := gen_random_uuid(); w uuid := gen_random_uuid(); t uuid; day uuid; old_day uuid; dist uuid;
begin
  insert into _ctx values ('r', r), ('gerente', g), ('garcom', w);
  insert into auth.users(id, email) values (g, g || '@mgr.test'), (w, w || '@mgr.test');
  insert into public.profiles(id, full_name) values (g, 'Gerente'), (w, 'Rita') on conflict (id) do update set full_name = excluded.full_name;
  insert into public.user_roles(user_id, restaurant_id, role, is_active) values (g, r, 'manager', true), (w, r, 'waiter', true);
  update public.cash_register_sessions set status = 'closed', closed_at = now() where restaurant_id = r and status = 'open';
  delete from public.restaurant_subscriptions where restaurant_id = r;
  insert into public.restaurant_subscriptions(restaurant_id, plan_code, billing_cycle, status, current_period_start, current_period_end)
    values (r, 'essencial', 'monthly', 'active', now() - interval '1 day', now() + interval '29 days');
  update public.operational_days set status = 'closed', closed_at = now() where restaurant_id = r and status = 'open';
  insert into public.operational_days(restaurant_id, business_date, started_at, status) values (r, (now() at time zone 'America/Sao_Paulo')::date, now() - interval '1 hour', 'open');
  t := pg_temp.pay('asaas', 'pix', 10000);
  insert into private.noowe_pay_transaction_fees(gateway_transaction_id, restaurant_id, payment_method, rate_bps, amount_cents, fee_cents) values (t, r, 'pix', 300, 10000, 300);
  perform pg_temp.pay('manual', 'credit_card', 5000, 1000);
  perform pg_temp.pay('manual', 'cash', 2000);
  perform pg_temp.pay('simulated', 'debit_card', 9900);
  -- Fora do dia aberto.
  t := pg_temp.pay('manual', 'wallet', 7700);
  update public.gateway_transactions set confirmed_at = now() - interval '2 days' where id = t;
  -- Último rateio fechado.
  insert into public.operational_days(restaurant_id, business_date, started_at, closed_at, status) values (r, (now() at time zone 'America/Sao_Paulo')::date - 1000, now() - interval '3 days', now() - interval '2 days', 'closed') returning id into old_day;
  delete from public.tip_distributions where restaurant_id = r;
  insert into public.tip_distributions(restaurant_id, operational_day_id, mode, retention_bps, pool_cents, retained_cents, distributed_cents, unallocated_cents)
    values (r, old_day, 'equal', 0, 2500, 0, 2500, 0) returning id into dist;
  insert into public.tip_distribution_lines(distribution_id, restaurant_id, user_id, role, weight, amount_cents) values (dist, r, w, 'waiter', 1, 2500);
end $$;
create temp table _r(k text primary key, j jsonb);
grant select, insert, update on _r, _ctx to authenticated;
set local role authenticated;

do $$
declare ok boolean := false;
begin
  begin perform pg_temp.summary('garcom'); exception when sqlstate '42501' then ok := true; end;
  assert ok, 'Garçom é recusado';
end $$;
select pass('só Dono e Gerente veem o painel');

do $$
declare j jsonb := pg_temp.summary('gerente');
begin
  assert pg_temp.net(j, 'pix') = 9700, 'Pix líquido: ' || j::text;
  assert pg_temp.net(j, 'credit_card') = 4000, 'maquininha menos estorno: ' || j::text;
  assert pg_temp.net(j, 'debit_card') is null and pg_temp.net(j, 'wallet') is null, 'simulado e outro dia ficam fora: ' || j::text;
end $$;
select pass('caixa do dia aberto por forma, líquido de taxa e estorno, sem simulado');

do $$
declare t text := pg_temp.summary('gerente')::text;
begin
  assert t not like '%fee%' and t not like '%price%' and t not like '%invoice%' and t not like '%grossCents%', 'sem taxa, preço ou fatura: ' || t::text;
  assert (pg_temp.summary('gerente')->'plan'->>'name') is not null and (pg_temp.summary('gerente')->'plan'->>'status') = 'active', 'plano atual';
end $$;
select pass('plano atual sem preço, e nada de taxa ou fatura');

reset role;
do $$
declare sid uuid;
begin
  insert into public.cash_register_sessions(restaurant_id, status, opened_at, opened_by, opening_balance, opening_cents, expected_balance, expected_cents)
    values ((select v from _ctx where k='r'), 'open', now(), (select v from _ctx where k='gerente'), 0, 0, 0, 0);
end $$;
set local role authenticated;
do $$
declare j jsonb := pg_temp.summary('gerente');
begin
  assert exists (select 1 from jsonb_array_elements(j->'cash') e where e->>'method' = 'cash' and e->'netCents' = 'null'::jsonb), 'dinheiro oculto com caixa aberto: ' || j::text;
  assert pg_temp.net(j, 'pix') = 9700, 'o resto continua';
end $$;
select pass('com o caixa aberto, o dinheiro fica oculto: fechamento cego');

do $$
declare j jsonb := pg_temp.summary('gerente');
begin
  assert (j->'tips'->'last'->>'poolCents')::bigint = 2500, 'rateio: ' || j::text;
  assert j->'tips'->'last'->'lines'->0->>'name' = 'Rita' and (j->'tips'->'last'->'lines'->0->>'amountCents')::bigint = 2500, 'linha: ' || j::text;
  assert (j->'tips'->>'poolTodayCents') is not null, 'gorjeta do dia';
end $$;
select pass('gorjeta do dia e último rateio da equipe, por pessoa');
select * from finish();
rollback;
