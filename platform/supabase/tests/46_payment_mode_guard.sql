-- N4 / invariante 6: sem flag de desenvolvimento, ninguém confirma pagamento pelo provedor simulado.
begin;
select plan(8);

create temp table _ctx(k text primary key, v uuid);
create function pg_temp.act(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true)
$$;
create function pg_temp.state_of(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ok'; exception when others then return sqlstate; end $$;

do $$
declare
  r uuid := 'c1000000-0000-4000-8000-000000000002'; a uuid := gen_random_uuid(); o uuid; sid uuid;
  owner_id uuid := 'c1000000-0000-4000-8000-000000000001'; tbl jsonb;
begin
  update private.dev_flags set enabled = false where key in ('simulate_order_payment', 'simulate_share_payment');
  insert into auth.users(id, email) values (a, a || '@mode.test');
  insert into public.profiles(id) values (a) on conflict do nothing;
  insert into public.orders(restaurant_id, customer_id, total_cents) values (r, a, 1000) returning id into o;
  perform pg_temp.act(owner_id);
  tbl := public.restaurant_create_table(r, 'test-mode-' || a, 4);
  perform pg_temp.act(a);
  sid := (public.customer_open_table_session(tbl->>'qr_code')->>'tableSessionId')::uuid;
  insert into _ctx values ('r', r), ('a', a), ('o', o), ('s', sid);
end $$;

select pg_temp.act((select v from _ctx where k = 'a'));

select is(public.customer_order_payment_mode((select v from _ctx where k = 'r')), 'unavailable',
  'sem conta Asaas e sem flag o restaurante não aceita pagamento online');
select is(pg_temp.state_of(format($q$select public.customer_start_payment(%L, 'credit_card', gen_random_uuid())$q$,
  (select v from _ctx where k = 'o'))), '42501', 'pedido não é confirmado pelo simulado com a flag desligada');
select is((select payment_status::text from public.orders where id = (select v from _ctx where k = 'o')), 'pending',
  'o pedido segue sem pagamento');
select is(pg_temp.state_of(format($q$select public.customer_pay_table_bill(%L, 0, 'pix')$q$,
  (select v from _ctx where k = 's'))), '42501', 'conta da mesa não é paga pelo simulado com a flag desligada');
select ok(not has_function_privilege('authenticated', 'public.customer_start_payment_simulated(uuid,text,uuid,integer,bigint)', 'execute'),
  'o corpo simulado não fica exposto ao cliente');

update private.dev_flags set enabled = true where key = 'simulate_order_payment';
select is(public.customer_order_payment_mode((select v from _ctx where k = 'r')), 'simulated',
  'com a flag ligada e sem conta o modo é simulado');

insert into public.restaurant_payment_accounts(restaurant_id, provider, status, platform_fee_bps)
  values ((select v from _ctx where k = 'r'), 'asaas', 'active', 0);
select is(public.customer_order_payment_mode((select v from _ctx where k = 'r')), 'asaas',
  'conta ativa vence a flag: o restaurante cobra de verdade');
select is(pg_temp.state_of(format($q$select public.customer_start_payment(%L, 'credit_card', gen_random_uuid())$q$,
  (select v from _ctx where k = 'o'))), '42501', 'com conta ativa o simulado é recusado mesmo com a flag ligada');

select * from finish();
rollback;
