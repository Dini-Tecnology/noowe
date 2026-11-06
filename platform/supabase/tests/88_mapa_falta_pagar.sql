-- Resposta 86 (05/11/2026): o mapa mostra consumo e quanto falta pagar; o Maître vê "Pagamento parcial", sem valores.
begin;
select plan(2);
create function pg_temp.act(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true) $$;
create temp table _ctx(k text primary key, v uuid);
create function pg_temp.ctx(p text) returns uuid language sql as $$ select v from _ctx where k = p $$;
create function pg_temp.seen(p_who uuid, p_table uuid) returns jsonb language plpgsql as $$
declare x jsonb;
begin
  perform pg_temp.act(p_who);
  select e->'active_session' into x from jsonb_array_elements(public.restaurant_get_tables(pg_temp.ctx('r'))) e where (e->>'id')::uuid = p_table;
  return x;
end $$;

do $$
declare r uuid := 'c1000000-0000-4000-8000-000000000002'; owner uuid := 'c1000000-0000-4000-8000-000000000001'; a uuid := gen_random_uuid(); m uuid := gen_random_uuid(); g uuid := gen_random_uuid();
  tbl jsonb; sid uuid; o uuid; menu uuid;
begin
  insert into auth.users(id, email) values (a, a || '@mapa.test'), (m, m || '@mapa.test'), (g, g || '@mapa.test');
  insert into public.profiles(id) values (a), (m), (g) on conflict do nothing;
  insert into public.user_roles(user_id, restaurant_id, role, is_active) values (m, r, 'maitre', true), (g, r, 'manager', true);
  perform pg_temp.act(owner);
  tbl := public.restaurant_create_table(r, 'mapa-' || a, 4);
  perform pg_temp.act(a); sid := (public.customer_open_table_session(tbl->>'qr_code')->>'tableSessionId')::uuid;
  select id into menu from public.menu_items where restaurant_id = r limit 1;
  insert into public.orders(restaurant_id, customer_id, table_session_id) values (r, a, sid) returning id into o;
  insert into public.order_items(order_id, menu_item_id, quantity, unit_price, total_price) values (o, menu, 2, 20, 40);
  perform pg_temp.act(g);
  perform public.restaurant_record_bill_payment(sid, 'pix', gen_random_uuid(), 1000);
  insert into _ctx values ('r', r), ('owner', owner), ('maitre', m), ('t', (tbl->>'id')::uuid);
end $$;

do $$
declare x jsonb := pg_temp.seen(pg_temp.ctx('owner'), pg_temp.ctx('t'));
begin
  assert (x->>'total_spent')::numeric = 40 and (x->>'remaining_cents')::bigint = 3000 and (x->>'partial_payment')::boolean, 'Dono: consumo e falta: ' || coalesce(x::text, '-');
end $$;
select pass('quem vê a conta vê o consumo e quanto falta pagar');

do $$
declare x jsonb := pg_temp.seen(pg_temp.ctx('maitre'), pg_temp.ctx('t'));
begin
  assert x->>'total_spent' is null and x->>'remaining_cents' is null and (x->>'partial_payment')::boolean, 'Maître: só o estado: ' || coalesce(x::text, '-');
end $$;
select pass('o Maître vê "Pagamento parcial", sem valores');
select * from finish();
rollback;
