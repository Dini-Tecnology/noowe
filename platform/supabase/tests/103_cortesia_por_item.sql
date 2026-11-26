-- Cortesia aprovada zera o item escolhido (por id), não o primeiro de mesmo nome;
-- OP-04: encerrar a comanda fecha a tarefa ainda aberta de um pedido dela.
begin;
select plan(4);

create function pg_temp.act(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true) $$;
create function pg_temp.state_of(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ok'; exception when others then return sqlstate; end $$;
create temp table _ctx(k text primary key, v uuid);
create function pg_temp.ctx(p text) returns uuid language sql as $$ select v from _ctx where k = p $$;

-- Pedido com o mesmo prato duas vezes; uma segunda comanda vazia com tarefa de pedido aberta.
do $$
declare
  r uuid := 'c1000000-0000-4000-8000-000000000002'; owner_id uuid := 'c1000000-0000-4000-8000-000000000001';
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); tbl jsonb; tbl2 jsonb; sid uuid; sid2 uuid; dish uuid; o uuid; o2 uuid; i1 uuid; i2 uuid; t uuid;
begin
  insert into auth.users(id, email) values (a, a || '@cort.test');
  insert into public.profiles(id, full_name) values (a, 'Cora Teste') on conflict (id) do nothing;
  insert into auth.users(id, email) values (b, b || '@cort.test');
  insert into public.profiles(id, full_name) values (b, 'Beto Teste') on conflict (id) do nothing;
  insert into public.menu_items(restaurant_id, name, price) values (r, 'Prato Cortesia ' || a, 40) returning id into dish;
  perform pg_temp.act(owner_id);
  tbl := public.restaurant_create_table(r, 'test-cort-' || a, 4);
  tbl2 := public.restaurant_create_table(r, 'test-cort2-' || a, 4);
  perform pg_temp.act(a);
  sid := (public.customer_open_table_session(tbl->>'qr_code')->>'tableSessionId')::uuid;
  insert into public.orders(restaurant_id, customer_id, table_session_id, status) values (r, a, sid, 'confirmed') returning id into o;
  insert into public.order_items(order_id, menu_item_id, quantity, unit_price, total_price, unit_price_cents, total_price_cents)
    values (o, dish, 1, 40, 40, 4000, 4000) returning id into i1;
  insert into public.order_items(order_id, menu_item_id, quantity, unit_price, total_price, unit_price_cents, total_price_cents)
    values (o, dish, 1, 40, 40, 4000, 4000) returning id into i2;
  update public.orders set subtotal_cents = 8000, total_cents = 8000 where id = o;
  perform pg_temp.act(b);
  sid2 := (public.customer_open_table_session(tbl2->>'qr_code')->>'tableSessionId')::uuid;
  insert into public.orders(restaurant_id, customer_id, table_session_id, status) values (r, b, sid2, 'confirmed') returning id into o2;
  insert into public.staff_tasks(restaurant_id, kind, task_type, title, priority, status, dedupe_key, audience_roles, order_id)
    values (r, 'order.created', 'action', 'Pedido QA', 2, 'open', 'test-cort-task:' || o2, '{waiter}', o2) returning id into t;
  insert into _ctx values ('r', r), ('owner', owner_id), ('o', o), ('first', i1), ('second', i2), ('sid2', sid2), ('task', t);
end $$;

select pg_temp.act(pg_temp.ctx('owner'));

-- 1. Cortesia do segundo prato (Dono aplica direto): só ele zera; o primeiro, de mesmo nome, segue cobrado.
select public.restaurant_request_approval(pg_temp.ctx('r'), 'courtesy',
  (select name from public.menu_items mi join public.order_items oi on oi.menu_item_id = mi.id where oi.id = pg_temp.ctx('second')),
  'Aniversário', 0, null, pg_temp.ctx('o'), pg_temp.ctx('second'));
select ok((select total_price_cents from public.order_items where id = pg_temp.ctx('second')) = 0
  and (select total_price_cents from public.order_items where id = pg_temp.ctx('first')) = 4000
  and (select total_cents from public.orders where id = pg_temp.ctx('o')) = 4000,
  'cortesia zera o item escolhido, não o primeiro de mesmo nome');

-- 2. Item de outro pedido é recusado.
select is(pg_temp.state_of(format('select public.restaurant_request_approval(%L, %L, %L, %L, 0, null, %L, %L)',
  pg_temp.ctx('r'), 'courtesy', 'x', 'y', pg_temp.ctx('o'), gen_random_uuid())), '23503', 'item fora do pedido é recusado');

-- 3. A aprovação guarda o item.
select is((select order_item_id from public.approvals where order_id = pg_temp.ctx('o') and type = 'courtesy'),
  pg_temp.ctx('second'), 'aprovação aponta o item');

-- 4. OP-04: encerrar a comanda fecha a tarefa aberta do pedido dela.
update public.table_sessions set status = 'closed' where id = pg_temp.ctx('sid2');
select is((select status from public.staff_tasks where id = pg_temp.ctx('task')), 'done', 'comanda encerrada fecha a tarefa do pedido');

select * from finish();
rollback;
