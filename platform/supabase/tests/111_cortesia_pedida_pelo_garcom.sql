-- Decisão 11: garçom pede cortesia por item; a pendência é por item e o valor vem do item no servidor.
begin;
select plan(5);

create function pg_temp.act(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true) $$;
create function pg_temp.state_of(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ok'; exception when others then return sqlstate; end $$;
create temp table _ctx(k text primary key, v uuid);
create function pg_temp.ctx(p text) returns uuid language sql as $$ select v from _ctx where k = p $$;

do $$
declare
  r uuid := 'c1000000-0000-4000-8000-000000000002'; w uuid := gen_random_uuid(); c uuid := gen_random_uuid();
  dish uuid; o uuid; i1 uuid; i2 uuid;
begin
  insert into auth.users(id, email) values (w, w || '@cort111.test'), (c, c || '@cort111.test');
  insert into public.profiles(id, full_name) values (w, 'Garçom 111'), (c, 'Cliente 111') on conflict (id) do nothing;
  insert into public.user_roles(user_id, restaurant_id, role) values (w, r, 'waiter');
  insert into public.menu_items(restaurant_id, name, price) values (r, 'Prato 111 ' || w, 40) returning id into dish;
  insert into public.orders(restaurant_id, customer_id, order_type, status) values (r, c, 'dine_in', 'confirmed') returning id into o;
  insert into public.order_items(order_id, menu_item_id, quantity, unit_price, total_price, unit_price_cents, total_price_cents)
    values (o, dish, 1, 40, 40, 4000, 4000) returning id into i1;
  insert into public.order_items(order_id, menu_item_id, quantity, unit_price, total_price, unit_price_cents, total_price_cents)
    values (o, dish, 1, 25, 25, 2500, 2500) returning id into i2;
  insert into _ctx values ('r', r), ('w', w), ('o', o), ('i1', i1), ('i2', i2);
end $$;

select pg_temp.act(pg_temp.ctx('w'));

-- 1. Garçom pede cortesia de um item: fica pendente, nada é zerado ainda.
select is(public.restaurant_request_approval(pg_temp.ctx('r'), 'courtesy', 'Prato', 'Aniversário', 999, null, null, pg_temp.ctx('i1'))->>'status',
  'pending', 'garçom pede cortesia e ela fica pendente');
select is((select total_price_cents from public.order_items where id = pg_temp.ctx('i1')), 4000::bigint, 'item segue cobrado até a aprovação');

-- 2. O valor é o do item, não o enviado pelo app.
select is((select amount_cents from public.approvals where order_item_id = pg_temp.ctx('i1')), 4000::bigint, 'valor vem do item no servidor');

-- 3. Outro item do mesmo pedido também pode ter cortesia pendente.
select is(pg_temp.state_of(format('select public.restaurant_request_approval(%L, %L, %L, %L, 0, null, null, %L)',
  pg_temp.ctx('r'), 'courtesy', 'Prato', 'Cliente fiel', pg_temp.ctx('i2'))), 'ok', 'segundo item do mesmo pedido aceita cortesia');

-- 4. O mesmo item não ganha segunda pendência.
select is(pg_temp.state_of(format('select public.restaurant_request_approval(%L, %L, %L, %L, 0, null, null, %L)',
  pg_temp.ctx('r'), 'courtesy', 'Prato', 'De novo', pg_temp.ctx('i1'))), '23505', 'mesmo item não tem duas pendências');

select * from finish();
rollback;
