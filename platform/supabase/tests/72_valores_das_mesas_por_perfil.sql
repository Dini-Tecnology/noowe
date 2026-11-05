-- Aditivo item G: Garçom vê o consumo só das mesas dele; Maître vê o estado, sem valor; Dono e Gerente veem tudo.
begin;
select plan(8);
create function pg_temp.act(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true) $$;
create temp table _ctx(k text primary key, v uuid);
do $$
declare r uuid := 'c1000000-0000-4000-8000-000000000002'; w uuid := gen_random_uuid(); m uuid := gen_random_uuid();
  g uuid := gen_random_uuid(); t1 uuid; t2 uuid;
begin
  insert into _ctx values ('r', r), ('dono', 'c1000000-0000-4000-8000-000000000001'), ('w', w), ('maitre', m), ('gerente', g);
  insert into auth.users(id, email) values (w, w || '@vt.test'), (m, m || '@vt.test'), (g, g || '@vt.test');
  insert into public.profiles(id) values (w), (m), (g) on conflict do nothing;
  insert into public.user_roles(user_id, restaurant_id, role, is_active) values (w, r, 'waiter', true), (m, r, 'maitre', true), (g, r, 'manager', true);
  insert into public.tables(restaurant_id, table_number, seats, status, assigned_waiter_id) values (r, 'VT-1', 2, 'occupied', w) returning id into t1;
  insert into public.tables(restaurant_id, table_number, seats, status, assigned_waiter_id) values (r, 'VT-2', 2, 'occupied', 'c1000000-0000-4000-8000-000000000001') returning id into t2;
  insert into public.table_sessions(restaurant_id, table_id, status, total_spent) values (r, t1, 'active', 50), (r, t2, 'active', 70);
  insert into _ctx values ('t1', t1), ('t2', t2);
end $$;
create function pg_temp.seen(p_who text, p_tbl text) returns jsonb language plpgsql as $$
declare x jsonb;
begin
  perform pg_temp.act((select v from _ctx where k = p_who));
  select e->'active_session' into x from jsonb_array_elements(public.restaurant_get_tables((select v from _ctx where k='r'))) e
   where e->>'id' = (select v::text from _ctx where k = p_tbl);
  return x;
end $$;
grant select on _ctx to authenticated;
set local role authenticated;

select ok((pg_temp.seen('w','t1')->>'total_spent')::numeric = 50 and not (pg_temp.seen('w','t1')->>'spent_hidden')::boolean,
  'Garçom vê o valor da própria mesa');
select ok(pg_temp.seen('w','t2')->>'total_spent' is null and (pg_temp.seen('w','t2')->>'spent_hidden')::boolean,
  'Garçom não vê o valor da mesa de outro garçom');
select ok(pg_temp.seen('maitre','t1')->>'total_spent' is null and (pg_temp.seen('maitre','t1')->>'spent_hidden')::boolean,
  'Maître vê a mesa, sem valor');
select ok((pg_temp.seen('gerente','t2')->>'total_spent')::numeric = 70 and (pg_temp.seen('dono','t1')->>'total_spent')::numeric = 50,
  'Gerente e Dono veem o valor de todas as mesas');

reset role;
do $$
declare o uuid; r uuid := (select v from _ctx where k='r'); t1 uuid := (select v from _ctx where k='t1'); s uuid; item uuid;
begin
  select id into s from public.table_sessions where table_id = t1 and status = 'active';
  select id into item from public.menu_items where restaurant_id = r limit 1;
  if item is null then raise exception 'cardápio vazio no restaurante de demonstração'; end if;
  insert into public.orders(restaurant_id, customer_id, table_session_id, table_id, total_amount, total_cents) values (r, (select v from _ctx where k='dono'), s, t1, 42.5, 4250) returning id into o;
  insert into public.order_items(order_id, menu_item_id, quantity, unit_price, total_price, unit_price_cents, total_price_cents)
    values (o, item, 1, 30, 30, 3000, 3000), (o, item, 1, 12.5, 12.5, 1250, 1250);
end $$;
set local role authenticated;
create function pg_temp.bill(p_who text, p_tbl text) returns jsonb language plpgsql as $$
begin
  perform pg_temp.act((select v from _ctx where k = p_who));
  return public.restaurant_get_table_bill((select v from _ctx where k = p_tbl));
end $$;
create function pg_temp.bill_state(p_who text, p_tbl text) returns text language plpgsql as $$
begin perform pg_temp.bill(p_who, p_tbl); return 'ok'; exception when others then return sqlstate; end $$;

select is((pg_temp.seen('gerente','t1')->>'total_spent')::numeric, 42.5::numeric, 'a Conta do mapa vem do consumo real, não do campo parado');
select is(pg_temp.bill_state('w','t2'), '42501', 'Garçom não abre a comanda da mesa de outro garçom');
select ok((pg_temp.bill('w','t1')->>'paidCents') is not null, 'Garçom vê o total pago da própria mesa');
select ok((pg_temp.bill('maitre','t1')->>'paidCents') is null and (pg_temp.bill('maitre','t1')->>'subtotal')::numeric = 42.5,
  'Maître vê o consumo da mesa, sem o total pago');
select * from finish();
rollback;
