-- IV-01: todo item de pedido nasce com centavos; o banco não aceita item sem eles.
begin;
select plan(3);

create temp table _ctx(k text primary key, v uuid);

select is((select count(*)::int from public.order_items where unit_price_cents is null or total_price_cents is null), 0,
  'nenhum item existente fica sem centavos');

do $$
declare r uuid := 'c1000000-0000-4000-8000-000000000002'; a uuid := gen_random_uuid(); menu uuid; o uuid; i uuid;
begin
  insert into auth.users(id, email) values (a, a || '@cents.test');
  select id into menu from public.menu_items where restaurant_id = r limit 1;
  insert into public.orders(restaurant_id, customer_id) values (r, a) returning id into o;
  -- Caminho antigo (place_order/simulação): só o valor em reais.
  insert into public.order_items(order_id, menu_item_id, quantity, unit_price, total_price)
    values (o, menu, 3, 12.35, 37.05) returning id into i;
  insert into _ctx values ('item', i), ('order', o), ('menu', menu);
end $$;

select is((select array[unit_price_cents, total_price_cents] from public.order_items where id = (select v from _ctx where k = 'item')),
  array[1235::bigint, 3705::bigint], 'centavos derivados do valor da linha quando o chamador não os envia');

select ok((select bool_and(attnotnull) from pg_attribute where attrelid = 'public.order_items'::regclass
  and attname in ('unit_price_cents', 'total_price_cents')), 'centavos do item são NOT NULL');

select * from finish();
rollback;
