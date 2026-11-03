-- Fatia O1 (docs/fatias/O1-estados-unicos.md). O critério 2 também está na varredura 03; o critério 3 vive em
-- platform/mobile/apps/restaurant/src/__tests__/statusLabel.test.ts.
begin;
select plan(32);

create function pg_temp.state_of(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ok'; exception when others then return sqlstate; end $$;
create function pg_temp.act(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;
create temp table _ctx(k text primary key, v uuid);
create function pg_temp.ctx(p_k text) returns uuid language sql as $$ select v from _ctx where k = p_k $$;
create function pg_temp.order_status(p_order uuid) returns text language sql as $$
  select status::text from public.orders where id = p_order
$$;
create function pg_temp.item_status(p_item uuid) returns text language sql as $$
  select status::text from public.order_items where id = p_item
$$;

do $$
declare r uuid := 'c1000000-0000-4000-8000-000000000002'; owner_id uuid := 'c1000000-0000-4000-8000-000000000001';
  c uuid := gen_random_uuid(); menu uuid; o uuid; kitchen uuid; bar uuid; tbl jsonb; sid uuid;
begin
  insert into auth.users(id, email) values (c, c || '@o1.test');
  insert into public.profiles(id) values (c) on conflict do nothing;
  select id into menu from public.menu_items where restaurant_id = r limit 1;
  insert into public.orders(restaurant_id, customer_id, order_type) values (r, c, 'dine_in') returning id into o;
  insert into public.order_items(order_id, menu_item_id, quantity, unit_price, total_price)
    values (o, menu, 1, 10, 10) returning id into kitchen;
  insert into public.order_items(order_id, menu_item_id, quantity, unit_price, total_price)
    values (o, menu, 1, 10, 10) returning id into bar;
  perform pg_temp.act(owner_id);
  tbl := public.restaurant_create_table(r, 'o1-' || c, 4);
  insert into _ctx values ('r', r), ('owner', owner_id), ('c', c), ('menu', menu), ('o', o), ('kitchen', kitchen), ('bar', bar),
    ('table', (tbl->>'id')::uuid);
end $$;

select pg_temp.act(pg_temp.ctx('owner'));

-- ---------------------------------------------------------------------------
-- Critério 5: em preparo sozinho
-- ---------------------------------------------------------------------------
select is(pg_temp.item_status(pg_temp.ctx('kitchen')), 'preparing', 'critério 5: o item de salão entra em preparo ao aparecer na estação');
select is(pg_temp.order_status(pg_temp.ctx('o')), 'preparing', 'o pedido acompanha, sem ninguém escrever nele');

-- ---------------------------------------------------------------------------
-- Critério 1: só fica pronto com todas as estações prontas, e reconverge
-- ---------------------------------------------------------------------------
select public.restaurant_update_order_item_status(pg_temp.ctx('kitchen'), 'ready');
select is(pg_temp.order_status(pg_temp.ctx('o')), 'preparing', 'critério 1: cozinha pronta e bar não: pedido segue em preparo');
select is(pg_temp.state_of(format($q$select public.restaurant_update_order_status(%L, 'ready')$q$, pg_temp.ctx('o'))), '23514',
  'critério 1: a equipe não força o pedido a pronto');
select public.restaurant_update_order_item_status(pg_temp.ctx('bar'), 'ready');
select is(pg_temp.order_status(pg_temp.ctx('o')), 'ready', 'critério 1: última estação pronta, pedido pronto');
select isnt((select actual_ready_at from public.orders where id = pg_temp.ctx('o')), null, 'o horário de pronto é gravado');
select is((select fulfillment_status::text from public.orders where id = pg_temp.ctx('o')), 'ready', 'a etapa de atendimento acompanha');

insert into public.order_items(order_id, menu_item_id, quantity, unit_price, total_price)
  values (pg_temp.ctx('o'), pg_temp.ctx('menu'), 1, 10, 10);
select is(pg_temp.order_status(pg_temp.ctx('o')), 'preparing', 'item novo volta o pedido para preparo');
update public.order_items set status = 'cancelled'
  where order_id = pg_temp.ctx('o') and id not in (pg_temp.ctx('kitchen'), pg_temp.ctx('bar'));
select is(pg_temp.order_status(pg_temp.ctx('o')), 'ready', 'item cancelado não segura o pedido');

select public.restaurant_update_order_item_status(pg_temp.ctx('kitchen'), 'delivered');
select is(pg_temp.order_status(pg_temp.ctx('o')), 'ready', 'um item entregue não entrega o pedido');
select public.restaurant_update_order_status(pg_temp.ctx('o'), 'delivered');
select is(pg_temp.item_status(pg_temp.ctx('bar')), 'delivered', 'entregar o pedido entrega os itens prontos');
select is(pg_temp.order_status(pg_temp.ctx('o')), 'delivered', 'todos entregues, pedido entregue');

-- ---------------------------------------------------------------------------
-- Critério 2: ninguém escreve orders.status
-- ---------------------------------------------------------------------------
select is(pg_temp.state_of(format($q$update public.orders set status = 'cancelled' where id = %L$q$, pg_temp.ctx('o'))), '42501',
  'critério 2: escrever o status direto é recusado');
select is(pg_temp.order_status(pg_temp.ctx('o')), 'delivered', 'critério 2: o status não mudou');
select hasnt_trigger('public', 'orders', 'trg_sync_order_item_status_from_order', 'o trigger inverso saiu');
select is((select count(*)::integer from pg_proc where proname = 'restaurant_update_order_status_legacy_v1'), 0, 'a RPC antiga saiu');

-- Pagar não entrega nem conclui o pedido.
do $$
declare o uuid; i uuid;
begin
  insert into public.orders(restaurant_id, customer_id, order_type)
    values (pg_temp.ctx('r'), pg_temp.ctx('c'), 'dine_in') returning id into o;
  insert into public.order_items(order_id, menu_item_id, quantity, unit_price, total_price)
    values (o, pg_temp.ctx('menu'), 1, 10, 10) returning id into i;
  perform public.restaurant_record_payment(o, 'cash', 10, 0, null, gen_random_uuid()::text);
  insert into _ctx values ('paid_order', o), ('paid_item', i);
end $$;
select is((select payment_status::text from public.orders where id = pg_temp.ctx('paid_order')), 'confirmed', 'o pagamento é gravado');
select is(pg_temp.item_status(pg_temp.ctx('paid_item')), 'preparing', 'pagar não marca a comida como entregue');
select is(pg_temp.order_status(pg_temp.ctx('paid_order')), 'preparing', 'pagar não mexe no status de produção');

-- Cancelamento vem dos itens e deixa rastro.
do $$
declare o uuid;
begin
  insert into public.orders(restaurant_id, customer_id, order_type)
    values (pg_temp.ctx('r'), pg_temp.ctx('c'), 'dine_in') returning id into o;
  insert into public.order_items(order_id, menu_item_id, quantity, unit_price, total_price)
    values (o, pg_temp.ctx('menu'), 1, 10, 10);
  perform public.restaurant_update_order_status(o, 'cancelled', null, 'Cliente desistiu');
  insert into _ctx values ('cancelled', o);
end $$;
select is(pg_temp.order_status(pg_temp.ctx('cancelled')), 'cancelled', 'cancelar os itens cancela o pedido');
select is((select reason from public.audit_logs where action = 'order.cancelled' and entity_id = pg_temp.ctx('cancelled')),
  'Cliente desistiu', 'o cancelamento grava o motivo no audit_log');

-- Cliente não cancela o que já está na estação; segue para a aprovação do gerente.
do $$
declare o uuid;
begin
  insert into public.orders(restaurant_id, customer_id, order_type)
    values (pg_temp.ctx('r'), pg_temp.ctx('c'), 'dine_in') returning id into o;
  insert into public.order_items(order_id, menu_item_id, quantity, unit_price, total_price)
    values (o, pg_temp.ctx('menu'), 1, 10, 10);
  insert into _ctx values ('at_station', o);
end $$;
select pg_temp.act(pg_temp.ctx('c'));
select is(pg_temp.state_of(format($q$select public.customer_cancel_order(%L, 'desisti')$q$, pg_temp.ctx('at_station'))), 'P0001',
  'pedido na estação não é cancelado pelo cliente');
select pg_temp.act(pg_temp.ctx('owner'));

-- ---------------------------------------------------------------------------
-- Estados novos do item
-- ---------------------------------------------------------------------------
select ok(enum_range(null::public.order_items_status_enum)::text[] @> array['awaiting_payment', 'on_hold', 'fired'],
  'os estados novos do item existem');

do $$
declare o uuid; i uuid;
begin
  insert into public.orders(restaurant_id, customer_id, order_type)
    values (pg_temp.ctx('r'), pg_temp.ctx('c'), 'pickup') returning id into o;
  insert into public.order_items(order_id, menu_item_id, quantity, unit_price, total_price)
    values (o, pg_temp.ctx('menu'), 1, 10, 10) returning id into i;
  insert into _ctx values ('unpaid', o), ('unpaid_item', i);
end $$;
select is(pg_temp.item_status(pg_temp.ctx('unpaid_item')), 'awaiting_payment', 'sem pagamento, o item aguarda e não aparece na estação');
select is((select count(*)::integer from jsonb_array_elements(public.restaurant_get_kds_queue(pg_temp.ctx('r'))) q
  where q->>'id' = pg_temp.ctx('unpaid_item')::text), 0, 'a fila da cozinha não mostra o item sem pagamento');

do $$
declare o uuid; i uuid;
begin
  insert into public.orders(restaurant_id, customer_id, order_type)
    values (pg_temp.ctx('r'), pg_temp.ctx('c'), 'dine_in') returning id into o;
  insert into public.order_items(order_id, menu_item_id, quantity, unit_price, total_price, status, course)
    values (o, pg_temp.ctx('menu'), 1, 10, 10, 'on_hold', 'main') returning id into i;
  insert into _ctx values ('held', o), ('held_item', i);
end $$;
select is(pg_temp.item_status(pg_temp.ctx('held_item')), 'on_hold', 'item em espera não entra em preparo sozinho');
select public.restaurant_fire_course(pg_temp.ctx('held'), 'main');
select is(pg_temp.item_status(pg_temp.ctx('held_item')), 'preparing', 'disparado, entra em preparo');

-- ---------------------------------------------------------------------------
-- Critério 4: pagar leva a mesa a Limpeza, liberar é ação do garçom
-- ---------------------------------------------------------------------------
-- O caminho completo (última parcela paga -> cleaning) está em 36_bill_shares_flow e 08_simulated_table_checkout.
do $$
declare w uuid := gen_random_uuid();
begin
  insert into auth.users(id, email) values (w, w || '@o1.test');
  insert into public.profiles(id) values (w) on conflict do nothing;
  insert into public.user_roles(user_id, restaurant_id, role) values (w, pg_temp.ctx('r'), 'waiter');
  insert into _ctx values ('waiter', w);
  update public.tables set status = 'cleaning' where id = pg_temp.ctx('table');
end $$;

select pg_temp.act(pg_temp.ctx('waiter'));
set local role authenticated;
update public.tables set status = 'blocked' where id = 'c1000000-0000-4000-8000-000000000099';
update public.tables set status = 'available'
  where restaurant_id = 'c1000000-0000-4000-8000-000000000002' and status = 'cleaning';
reset role;
select is((select status from public.tables where id = pg_temp.ctx('table')), 'cleaning', 'garçom não escreve o status da mesa direto');
select is(public.restaurant_update_table_status(pg_temp.ctx('table'), 'available')->>'status', 'available',
  'critério 4: liberar a mesa é ação do garçom');
select pg_temp.act(pg_temp.ctx('owner'));

select is(pg_temp.state_of(format($q$update public.tables set status = 'qualquer' where id = %L$q$, pg_temp.ctx('table'))), '23514',
  'mesa só aceita os estados conhecidos');

-- Pedido de comanda entregue depois de pago não mexe na mesa que o garçom já liberou.
do $$
declare t uuid := pg_temp.ctx('table'); sid uuid := gen_random_uuid(); o uuid; i uuid;
begin
  update public.tables set status = 'available' where id = t;
  insert into public.table_sessions(id, restaurant_id, table_id, status) values (sid, pg_temp.ctx('r'), t, 'ended');
  insert into public.orders(restaurant_id, customer_id, order_type, table_id, table_session_id)
    values (pg_temp.ctx('r'), pg_temp.ctx('c'), 'dine_in', t, sid) returning id into o;
  insert into public.order_items(order_id, menu_item_id, quantity, unit_price, total_price)
    values (o, pg_temp.ctx('menu'), 1, 10, 10) returning id into i;
  perform public.restaurant_update_order_item_status(i, 'ready');
  perform public.restaurant_update_order_status(o, 'delivered');
end $$;
select is((select status from public.tables where id = pg_temp.ctx('table')), 'available',
  'entregar pedido de comanda não devolve a mesa livre para Limpeza');

-- As etapas de uma mesma transação ficam na ordem em que aconteceram (o histórico real está em 21_quick_service).
select is((select column_default from information_schema.columns where table_schema = 'public'
  and table_name = 'order_status_events' and column_name = 'created_at'), 'clock_timestamp()', 'eventos da mesma transação não empatam');

select * from finish();
rollback;
