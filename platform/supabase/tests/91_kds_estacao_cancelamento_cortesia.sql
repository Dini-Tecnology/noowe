-- QA 2026-11-25: OP-01 (cada estação só avança os seus itens), AUD-ITEM (cancelar item pede motivo e deixa rastro)
-- e cortesia aprovada que zera o item na conta.
begin;
select plan(8);

create function pg_temp.act(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true) $$;
create function pg_temp.state_of(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ok'; exception when others then return sqlstate; end $$;
create temp table _ctx(k text primary key, v uuid);
create function pg_temp.ctx(p text) returns uuid language sql as $$ select v from _ctx where k = p $$;

-- Mesa com um prato (cozinha) e um drinque (estação do bar) no mesmo pedido.
do $$
declare
  r uuid := 'c1000000-0000-4000-8000-000000000002'; owner_id uuid := 'c1000000-0000-4000-8000-000000000001';
  a uuid := gen_random_uuid(); tbl jsonb; sid uuid; bar uuid; dish uuid; drink uuid; o uuid; i1 uuid; i2 uuid; i3 uuid;
begin
  insert into auth.users(id, email) values (a, a || '@kds.test');
  insert into public.profiles(id, full_name) values (a, 'Ana Teste') on conflict (id) do nothing;
  insert into public.cook_stations(restaurant_id, name, station_type) values (r, 'Bar teste', 'bar') returning id into bar;
  insert into public.menu_items(restaurant_id, name, price) values (r, 'Prato QA ' || a, 40) returning id into dish;
  insert into public.menu_items(restaurant_id, name, price, station_id) values (r, 'Drinque QA ' || a, 25, bar) returning id into drink;
  perform pg_temp.act(owner_id);
  tbl := public.restaurant_create_table(r, 'test-kds-' || a, 4);
  perform pg_temp.act(a); sid := (public.customer_open_table_session(tbl->>'qr_code')->>'tableSessionId')::uuid;
  insert into public.orders(restaurant_id, customer_id, table_session_id, status) values (r, a, sid, 'confirmed') returning id into o;
  insert into public.order_items(order_id, menu_item_id, quantity, unit_price, total_price, unit_price_cents, total_price_cents)
    values (o, dish, 1, 40, 40, 4000, 4000) returning id into i1;
  insert into public.order_items(order_id, menu_item_id, quantity, unit_price, total_price, unit_price_cents, total_price_cents)
    values (o, drink, 1, 25, 25, 2500, 2500) returning id into i2;
  insert into public.order_items(order_id, menu_item_id, quantity, unit_price, total_price, unit_price_cents, total_price_cents)
    values (o, dish, 1, 40, 40, 4000, 4000) returning id into i3;
  update public.orders set subtotal_cents = 10500, total_cents = 10500 where id = o;
  insert into _ctx values ('r', r), ('owner', owner_id), ('o', o), ('dish', i1), ('drink', i2), ('dish2', i3), ('sid', sid);
end $$;

select pg_temp.act(pg_temp.ctx('owner'));

-- 1-2. A fila da cozinha não traz o drinque; a do bar só traz ele.
select ok(not exists (select 1 from jsonb_array_elements(public.restaurant_get_kds_queue(pg_temp.ctx('r'), null, 'kitchen')) e
  where (e->>'id')::uuid = pg_temp.ctx('drink'))
  and exists (select 1 from jsonb_array_elements(public.restaurant_get_kds_queue(pg_temp.ctx('r'), null, 'kitchen')) e
  where (e->>'id')::uuid = pg_temp.ctx('dish')), 'fila da cozinha sem o item do bar');
select ok((select bool_and((e->>'id')::uuid = pg_temp.ctx('drink')) and count(*) >= 1
  from jsonb_array_elements(public.restaurant_get_kds_queue(pg_temp.ctx('r'), null, 'bar')) e
  where (e->>'order_id')::uuid = pg_temp.ctx('o')), 'fila do bar só com o item do bar');

-- 3. Cozinha marca os seus itens: o pedido não fica pronto enquanto o bar não terminar.
do $$
declare e jsonb;
begin
  for e in select * from jsonb_array_elements(public.restaurant_get_kds_queue(pg_temp.ctx('r'), null, 'kitchen'))
    where (value->>'order_id')::uuid = pg_temp.ctx('o') and (value->>'id')::uuid <> pg_temp.ctx('dish2') loop
    perform public.restaurant_update_order_item_status((e->>'id')::uuid, 'ready');
  end loop;
end $$;
select ok((select status::text from public.order_items where id = pg_temp.ctx('drink')) <> 'ready'
  and (select status::text from public.orders where id = pg_temp.ctx('o')) <> 'ready', 'cozinha pronta não deixa o pedido pronto');

-- 4-5. Cancelar item sem motivo é recusado e nada muda.
select is(pg_temp.state_of(format('select public.restaurant_update_order_item_status(%L, %L)', pg_temp.ctx('dish2'), 'cancelled')),
  '22023', 'cancelar sem motivo é recusado');
select is(pg_temp.state_of(format('select public.restaurant_update_order_item_status(%L, %L, %L)', pg_temp.ctx('dish2'), 'cancelled', '  ')),
  '22023', 'motivo em branco também');

-- 6. Com motivo, cancela e grava autor, motivo e horário.
select public.restaurant_update_order_item_status(pg_temp.ctx('dish2'), 'cancelled', 'Cliente desistiu');
select ok(exists (select 1 from public.audit_logs where entity_id = pg_temp.ctx('dish2') and action = 'order_item.cancelled'
  and reason = 'Cliente desistiu' and user_id = pg_temp.ctx('owner') and created_at is not null), 'cancelamento auditado');

-- 7. Bar termina: agora o pedido fica pronto (derivado dos itens).
select public.restaurant_update_order_item_status(pg_temp.ctx('drink'), 'ready');
select is((select status::text from public.orders where id = pg_temp.ctx('o')), 'ready', 'pronto só com cozinha e bar prontos');

-- 8. Cortesia aprovada (Dono aplica direto) zera o drinque; a conta soma exatamente o que sobrou.
select public.restaurant_request_approval(pg_temp.ctx('r'), 'courtesy',
  (select name from public.menu_items mi join public.order_items oi on oi.menu_item_id = mi.id where oi.id = pg_temp.ctx('drink')),
  'Aniversário', 0, null, pg_temp.ctx('o'));
select ok((select total_price_cents from public.order_items where id = pg_temp.ctx('drink')) = 0
  and (select total_cents from public.orders where id = pg_temp.ctx('o')) = 8000
  and (select sum(open_cents) from private.session_lines(pg_temp.ctx('sid'))) = 4000,
  'cortesia zera o item: pedido e comanda caem o valor dele, em centavos');

select * from finish();
rollback;
