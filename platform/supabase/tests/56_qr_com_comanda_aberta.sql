-- Resposta 31 do Pedro: o QR funciona com a comanda aberta, em qualquer estado informativo da mesa.
begin;
select plan(8);

create function pg_temp.act(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.state_of(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ok'; exception when others then return sqlstate; end $$;
create temp table _ctx(k text primary key, v text);
create function pg_temp.ctx(p_k text) returns text language sql as $$ select v from _ctx where k = p_k $$;

do $$
declare r uuid := 'c1000000-0000-4000-8000-000000000002'; owner_id uuid := 'c1000000-0000-4000-8000-000000000001';
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid(); t jsonb; t2 jsonb;
begin
  insert into auth.users(id, email) values (a, a || '@qr.test'), (b, b || '@qr.test'), (c, c || '@qr.test');
  insert into public.profiles(id) values (a), (b), (c) on conflict do nothing;
  perform pg_temp.act(owner_id);
  t := public.restaurant_create_table(r, 'qr31-' || a, 4);
  t2 := public.restaurant_create_table(r, 'qr31b-' || a, 4);
  insert into _ctx values ('a', a::text), ('b', b::text), ('c', c::text), ('table', t->>'id'), ('qr', t->>'qr_code'),
    ('table2', t2->>'id'), ('qr2', t2->>'qr_code');
  perform pg_temp.act(a);
  perform public.customer_open_table_session(t->>'qr_code');
end $$;

-- Mesa em "Conta pedida": quem chega depois entra, e o estado não é desfeito.
update public.tables set status = 'payment' where id = pg_temp.ctx('table')::uuid;
select pg_temp.act(pg_temp.ctx('b')::uuid);
select is(pg_temp.state_of(format($q$select public.customer_open_table_session(%L)$q$, pg_temp.ctx('qr'))), 'ok',
  'com a comanda aberta, "Conta pedida" não bloqueia a entrada');
select is((select status from public.tables where id = pg_temp.ctx('table')::uuid), 'payment', 'entrar não desfaz "Conta pedida"');

update public.tables set status = 'partial_payment' where id = pg_temp.ctx('table')::uuid;
select pg_temp.act(pg_temp.ctx('c')::uuid);
select is(pg_temp.state_of(format($q$select public.customer_open_table_session(%L)$q$, pg_temp.ctx('qr'))), 'ok',
  'com a comanda aberta, "Pagamento parcial" não bloqueia a entrada');
select is((select status from public.tables where id = pg_temp.ctx('table')::uuid), 'partial_payment', 'entrar não desfaz "Pagamento parcial"');
select is((select count(*)::int from public.table_session_participants p join public.table_sessions s on s.id = p.table_session_id
  where s.table_id = pg_temp.ctx('table')::uuid and s.status = 'active'), 3, 'os três participam da mesma comanda');

-- Sem comanda aberta, o estado informativo continua recusando, e bloqueada e em limpeza também.
update public.tables set status = 'payment' where id = pg_temp.ctx('table2')::uuid;
select is(pg_temp.state_of(format($q$select public.customer_open_table_session(%L)$q$, pg_temp.ctx('qr2'))), 'P0005',
  'sem comanda aberta, mesa em "Conta pedida" segue recusando');
update public.tables set status = 'cleaning' where id = pg_temp.ctx('table')::uuid;
select is(pg_temp.state_of(format($q$select public.customer_open_table_session(%L)$q$, pg_temp.ctx('qr'))), 'P0005',
  'mesa em limpeza segue recusando');
update public.tables set status = 'blocked' where id = pg_temp.ctx('table')::uuid;
select is(pg_temp.state_of(format($q$select public.customer_open_table_session(%L)$q$, pg_temp.ctx('qr'))), 'P0005',
  'mesa bloqueada segue recusando');

select * from finish();
rollback;
