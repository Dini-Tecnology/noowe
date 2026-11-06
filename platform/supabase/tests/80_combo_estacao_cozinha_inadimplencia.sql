-- Regras de conferência final: parâmetro do combo, estação do item, cupom na receita, cozinha sem valores e inadimplência fora do público.
begin;
select plan(10);
create function pg_temp.act(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true) $$;
create temp table _c(k text primary key, v uuid);
do $$
declare r uuid := 'c1000000-0000-4000-8000-000000000002'; ck uuid := gen_random_uuid(); bm uuid := gen_random_uuid(); ch uuid := gen_random_uuid(); w uuid := gen_random_uuid(); cust uuid := gen_random_uuid(); o uuid;
begin
  insert into auth.users(id, email) values (ck, ck || '@f.test'), (bm, bm || '@f.test'), (ch, ch || '@f.test'), (w, w || '@f.test'), (cust, cust || '@f.test');
  insert into public.profiles(id) values (ck), (bm), (ch), (w), (cust) on conflict do nothing;
  insert into public.user_roles(user_id, restaurant_id, role, is_active) values (ck, r, 'cook', true), (bm, r, 'barman', true), (ch, r, 'chef', true), (w, r, 'waiter', true);
  insert into public.orders(restaurant_id, customer_id, status, payment_status, total_cents, total_amount, order_type)
    values (r, cust, 'pending', 'pending', 2500, 25, 'pickup') returning id into o;
  insert into _c values ('r', r), ('ck', ck), ('bm', bm), ('ch', ch), ('w', w), ('cust', cust), ('o', o);
end $$;
grant select on _c to authenticated;
create function pg_temp.c(p_k text) returns uuid language sql as $$ select v from _c where k = p_k $$;

-- Estação do item vem do cardápio.
do $$
declare st uuid := gen_random_uuid(); mi uuid; it public.order_items;
begin
  select m.id into mi from public.menu_items m where m.restaurant_id = pg_temp.c('r') limit 1;
  update public.menu_items set station_id = st where id = mi;
  insert into public.order_items(order_id, menu_item_id, quantity, unit_price, total_price) values (pg_temp.c('o'), mi, 1, 25, 25) returning * into it;
  assert it.station_id = st, 'estação gravada: ' || coalesce(it.station_id::text, 'vazia');
end $$;
select pass('o item do pedido grava a estação do cardápio');

-- Sinal sem valores: a cozinha é avisada e não lê orders nem order_items.
select ok(exists (select 1 from public.kds_signals s where s.order_id = pg_temp.c('o')), 'pedido novo gera sinal');
select is((select count(*)::int from information_schema.columns where table_schema = 'public' and table_name = 'kds_signals' and (column_name ~ 'cents|amount|price|total')), 0, 'o sinal não tem coluna de valor');
set local role authenticated;
do $$
declare p text;
begin
  foreach p in array array['ck','bm','ch'] loop
    perform pg_temp.act(pg_temp.c(p));
    assert not exists (select 1 from public.orders where id = pg_temp.c('o')), p || ' não lê orders';
    assert not exists (select 1 from public.order_items where order_id = pg_temp.c('o')), p || ' não lê order_items';
    assert exists (select 1 from public.kds_signals where order_id = pg_temp.c('o')), p || ' lê o sinal';
  end loop;
end $$;
select pass('Chef, Cozinheiro e Barman não leem pedido nem item pela API, e recebem o sinal');
do $$
begin
  perform pg_temp.act(pg_temp.c('w'));
  assert exists (select 1 from public.orders where id = pg_temp.c('o')), 'Garçom segue lendo';
  perform pg_temp.act(pg_temp.c('cust'));
  assert exists (select 1 from public.orders where id = pg_temp.c('o')), 'cliente segue lendo o próprio';
  assert not exists (select 1 from public.kds_signals where order_id = pg_temp.c('o')), 'cliente não lê sinal';
end $$;
select pass('Garçom e cliente seguem lendo, e o cliente não recebe sinal de cozinha');
reset role;

-- Inadimplência: fora do público, e a busca continua filtrando.
select is((select count(*)::int from information_schema.columns where table_schema = 'public' and table_name = 'restaurants' and column_name in ('billing_hidden', 'orders_suspended')), 0, 'os campos saíram da tabela pública');
do $$
declare r public.restaurants;
begin
  select * into r from public.restaurants where id = pg_temp.c('r');
  assert public.listed(r), 'sem atraso aparece';
  insert into private.restaurant_billing_flags(restaurant_id, billing_hidden, orders_suspended) values (r.id, true, false)
    on conflict (restaurant_id) do update set billing_hidden = true;
  assert not public.listed(r), 'em atraso sai da busca';
  assert public.billing_hidden(r) = false, 'o nome antigo não revela nada';
end $$;
select pass('a busca esconde quem está em atraso sem expor o motivo');
do $$
declare ok boolean := false;
begin
  update private.restaurant_billing_flags set orders_suspended = true where restaurant_id = pg_temp.c('r');
  begin
    insert into public.orders(restaurant_id, customer_id, status, payment_status, order_type) values (pg_temp.c('r'), pg_temp.c('cust'), 'pending', 'pending', 'pickup');
  exception when sqlstate 'P0015' then ok := true; end;
  assert ok, 'pedido novo recusado';
  delete from private.restaurant_billing_flags where restaurant_id = pg_temp.c('r');
end $$;
select pass('restaurante suspenso continua recusando pedido novo');

-- Cupom na receita.
do $$
declare r uuid := pg_temp.c('r'); t uuid; s uuid; a bigint; b bigint;
begin
  a := private.revenue_cents(r, now() - interval '1 hour', now() + interval '1 hour');
  insert into public.tables(restaurant_id, table_number, seats, status) values (r, 'CUP-' || left(gen_random_uuid()::text, 8), 4, 'occupied') returning id into t;
  insert into public.table_sessions(restaurant_id, table_id, status, guest_count, service_model) values (r, t, 'active', 1, 'fine_dining') returning id into s;
  insert into public.bill_shares(restaurant_id, table_session_id, round_no, mode, base_cents, coupon_discount_cents, service_fee_cents, amount_cents, tip_cents, status, paid_at, idempotency_key)
    values (r, s, 1, 'fixed_amount', 12000, 1800, 0, 10200, 0, 'paid', now(), gen_random_uuid());
  b := private.revenue_cents(r, now() - interval '1 hour', now() + interval '1 hour');
  assert b - a = 10200, 'o cupom sai da receita: ' || (b - a);
  assert private.coupon_discounts_cents(r, now() - interval '1 hour', now() + interval '1 hour') >= 1800, 'soma o cupom';
end $$;
select pass('o cupom sai da receita do painel e aparece à parte no Financeiro');

-- Combo: o desconto vem do parâmetro do restaurante, e não do código.
do $$
declare r uuid := pg_temp.c('r'); cb uuid; ca uuid; cd uuid; i1 uuid; i2 uuid; i3 uuid; j jsonb; o public.orders;
begin
  update public.restaurants set service_type = 'quick_service' where id = r;
  update public.restaurant_model_policies set combo_discount_bps = 1500 where restaurant_id = r and service_model = 'quick_service';
  if not found then
    insert into public.restaurant_model_policies
      select (jsonb_populate_record(null::public.restaurant_model_policies, to_jsonb(p) || jsonb_build_object('restaurant_id', r, 'combo_discount_bps', 1500))).*
      from public.restaurant_model_policies p where p.service_model = 'quick_service' limit 1;
  end if;
  insert into public.menu_categories(restaurant_id, name) values (r, 'Burgers') returning id into cb;
  insert into public.menu_categories(restaurant_id, name) values (r, 'Acompanhamentos') returning id into ca;
  insert into public.menu_categories(restaurant_id, name) values (r, 'Bebidas') returning id into cd;
  insert into public.menu_items(restaurant_id, category_id, name, price, is_available) values (r, cb, 'X', 40, true) returning id into i1;
  insert into public.menu_items(restaurant_id, category_id, name, price, is_available) values (r, ca, 'Y', 20, true) returning id into i2;
  insert into public.menu_items(restaurant_id, category_id, name, price, is_available) values (r, cd, 'Z', 10, true) returning id into i3;
  perform pg_temp.act(pg_temp.c('cust'));
  j := public.customer_order_custom_combo(r, i1, i2, i3);
  assert (j->>'total_amount')::numeric = 59.50, 'R$ 70 com 15% de desconto: ' || j::text;
  select * into o from public.orders where id = (j->>'id')::uuid;
  assert o.total_amount = 59.50, 'o pedido fica com o valor: ' || o.total_amount;
  assert o.total_cents is null or o.total_cents = 5950, 'centavos iguais: ' || o.total_cents;
  assert o.special_instructions like '%-15%', 'o texto acompanha: ' || coalesce(o.special_instructions, '');
end $$;
select pass('o desconto do combo vem do parâmetro do restaurante');
select * from finish();
rollback;
