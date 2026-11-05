-- Pendência 77: Barman vê e cobra pedido de balcão, inteiro. O servidor confere o valor e não cobra duas vezes.
begin;
select plan(5);
create function pg_temp.act(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true) $$;
create temp table _ctx(k text primary key, v uuid);
do $$
declare r uuid := 'c1000000-0000-4000-8000-000000000002'; b uuid := gen_random_uuid(); ck uuid := gen_random_uuid(); cust uuid := gen_random_uuid(); o uuid; t uuid; ot uuid;
begin
  insert into auth.users(id, email) values (b, b || '@bar.test'), (ck, ck || '@bar.test'), (cust, cust || '@bar.test');
  insert into public.profiles(id, full_name) values (b, 'Barman'), (ck, 'Cozinheiro'), (cust, 'Cliente') on conflict (id) do update set full_name = excluded.full_name;
  insert into public.user_roles(user_id, restaurant_id, role, is_active) values (b, r, 'barman', true), (ck, r, 'cook', true);
  update public.cash_register_sessions set status = 'closed', closed_at = now() where restaurant_id = r and status = 'open';
  insert into public.cash_register_sessions(restaurant_id, status, opened_at, opened_by, opening_balance, opening_cents, expected_balance, expected_cents)
    values (r, 'open', now(), 'x', 0, 0, 0, 0);
  insert into public.orders(restaurant_id, customer_id, status, payment_status, total_cents, total_amount, order_type)
    values (r, cust, 'pending', 'pending', 2500, 25, 'pickup') returning id into o;
  insert into public.tables(restaurant_id, table_number, seats, status) values (r, 'BAR-' || left(gen_random_uuid()::text, 8), 2, 'occupied') returning id into t;
  insert into public.orders(restaurant_id, table_id, customer_id, status, payment_status, total_cents, total_amount, order_type)
    values (r, t, cust, 'pending', 'pending', 4000, 40, 'dine_in') returning id into ot;
  insert into _ctx values ('r', r), ('b', b), ('ck', ck), ('o', o), ('ot', ot);
end $$;
grant select on _ctx to authenticated;
create function pg_temp.c(p_k text) returns uuid language sql as $$ select v from _ctx where k = p_k $$;
set local role authenticated;

do $$
declare j jsonb;
begin
  perform pg_temp.act(pg_temp.c('b'));
  j := public.restaurant_list_counter_orders(pg_temp.c('r'));
  assert exists (select 1 from jsonb_array_elements(j) e where (e->>'orderId')::uuid = pg_temp.c('o') and (e->>'totalCents')::bigint = 2500), 'vê o de balcão: ' || j::text;
  assert not exists (select 1 from jsonb_array_elements(j) e where (e->>'orderId')::uuid = pg_temp.c('ot')), 'não vê o de mesa';
end $$;
select pass('Barman vê o pedido de balcão, e não o de mesa');

do $$
declare ok boolean := false;
begin
  perform pg_temp.act(pg_temp.c('ck'));
  begin perform public.restaurant_list_counter_orders(pg_temp.c('r')); exception when insufficient_privilege then ok := true; end;
  assert ok, 'Cozinheiro é recusado';
end $$;
select pass('quem não cobra não vê a lista');

do $$
declare ok boolean := false;
begin
  perform pg_temp.act(pg_temp.c('b'));
  begin perform public.restaurant_record_payment(pg_temp.c('o'), 'cash', 1.00, 0, null, gen_random_uuid()::text); exception when invalid_parameter_value then ok := true; end;
  assert ok, 'valor errado é recusado';
end $$;
select pass('o servidor recusa valor diferente do pedido');

do $$
declare ok boolean := false;
begin
  perform pg_temp.act(pg_temp.c('b'));
  perform public.restaurant_record_payment(pg_temp.c('o'), 'cash', 25.00, 0, null, gen_random_uuid()::text);
  assert (public.restaurant_my_cash_in_hand(pg_temp.c('r'))->>'cents')::bigint = 2500, 'entra em dinheiro em mãos';
  begin perform public.restaurant_record_payment(pg_temp.c('o'), 'cash', 25.00, 0, null, gen_random_uuid()::text); exception when unique_violation then ok := true; end;
  assert ok, 'segundo toque é recusado';
  assert (public.restaurant_my_cash_in_hand(pg_temp.c('r'))->>'cents')::bigint = 2500, 'não soma duas vezes';
  assert not exists (select 1 from jsonb_array_elements(public.restaurant_list_counter_orders(pg_temp.c('r'))) e where (e->>'orderId')::uuid = pg_temp.c('o')), 'pago sai da lista';
end $$;
select pass('cobrar uma vez entra em dinheiro em mãos, sai da lista e o segundo toque é recusado');

do $$
declare ok boolean := false;
begin
  perform pg_temp.act(pg_temp.c('b'));
  begin perform public.restaurant_record_payment(pg_temp.c('ot'), 'cash', 40.00, 0, null, gen_random_uuid()::text); exception when insufficient_privilege then ok := true; end;
  assert ok, 'Barman não cobra mesa';
end $$;
select pass('Barman continua sem cobrar pedido de mesa');
select * from finish();
rollback;
