-- G3: RLS de bill_shares — participante vê a própria sessão, estranho não vê nada,
-- ninguém escreve direto, e o Realtime publica as marcas pago / não pago.
begin;
select plan(10);

create temp table _rls(k text primary key, v uuid);
grant select on _rls to authenticated;

do $$
declare
  r uuid := 'c1000000-0000-4000-8000-000000000002'; owner_id uuid := 'c1000000-0000-4000-8000-000000000001';
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); x uuid := gen_random_uuid();
  tbl jsonb; sid uuid; menu uuid; o uuid;
  act text := $f$select set_config('request.jwt.claims', jsonb_build_object('sub', %L, 'role', 'authenticated')::text, true)$f$;
begin
  insert into auth.users(id, email) values (a, a || '@bill-rls.test'), (b, b || '@bill-rls.test'), (x, x || '@bill-rls.test');
  insert into public.profiles(id) values (a), (b), (x) on conflict do nothing;
  execute format(act, owner_id); tbl := public.restaurant_create_table(r, 'test-rls-' || a, 4);
  select id into menu from public.menu_items where restaurant_id = r limit 1;
  execute format(act, a); sid := (public.customer_open_table_session(tbl->>'qr_code')->>'tableSessionId')::uuid;
  execute format(act, b); perform public.customer_open_table_session(tbl->>'qr_code');
  insert into public.orders(restaurant_id, customer_id, table_session_id) values (r, a, sid) returning id into o;
  insert into public.order_items(order_id, menu_item_id, quantity, unit_price, total_price) values (o, menu, 1, 40, 40);
  execute format(act, a);
  perform public.customer_bill_split_commit(sid, 'equal', '{}', null, gen_random_uuid());
  insert into _rls values ('a', a), ('b', b), ('x', x), ('owner', owner_id), ('sid', sid);
end $$;

select _test.as_user((select v from _rls where k = 'a'));
select is((select count(*)::int from public.bill_shares), 2, 'participante vê as parcelas da própria sessão');
select is((select count(*)::int from public.bill_share_lines), 2, 'participante vê as linhas da própria sessão');

select _test.as_user((select v from _rls where k = 'x'));
select is((select count(*)::int from public.bill_shares), 0, 'estranho à mesa não vê parcelas');

select _test.as_user((select v from _rls where k = 'a'));
select throws_ok($$ update public.bill_shares set status = 'paid' $$, '42501', null, 'cliente não marca parcela como paga');
select throws_ok($$ insert into public.bill_shares(restaurant_id, table_session_id, participant_id, mode, base_cents, service_fee_cents, amount_cents)
    select restaurant_id, table_session_id, participant_id, mode, 1, 0, 1 from public.bill_shares limit 1 $$,
  '42501', null, 'cliente não insere parcela direto');
select throws_ok($$ delete from public.bill_shares $$, '42501', null, 'cliente não apaga parcela');

select _test.reset_role();
select ok(exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'bill_shares'),
  'bill_shares está na publicação Realtime');
select ok(not has_function_privilege('authenticated', 'private.commit_split(uuid,uuid,noowe_split_mode,jsonb,text,uuid)', 'EXECUTE'),
  'commit_split interno não é executável por clientes');

select ok(not has_function_privilege('anon', 'public.customer_pay_bill_share(uuid,text,uuid)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.customer_pay_bill_share(uuid,text,uuid)', 'EXECUTE'),
  'split antigo congelado: customer_pay_bill_share não é executável por clientes');
select ok(not has_table_privilege('authenticated', 'public.bill_split_plans', 'SELECT'),
  'bill_split_plans congelada: sem acesso de cliente');

select * from finish();
rollback;
