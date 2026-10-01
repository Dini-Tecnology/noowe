-- Preço médio do cardápio (20260930141000): média simples, em centavos (bigint),
-- dos itens disponíveis em categoria ativa; mantida por trigger.
begin;
select plan(7);

create temp table avg_price_results(label text primary key, ok boolean not null);

do $$
declare
  r uuid := 'c1000000-0000-4000-8000-000000000002';
  active_cat uuid;
  inactive_cat uuid;
  item_a uuid;
  avg_cents bigint;
begin
  -- Parte de um cardápio limpo: tudo o que já existia fica indisponível.
  update public.menu_items set is_available = false where restaurant_id = r;
  select avg_menu_price_cents into avg_cents from public.restaurants where id = r;
  insert into avg_price_results values ('sem itens disponíveis o preço médio é nulo', avg_cents is null);

  insert into public.menu_categories(restaurant_id, name, is_active) values (r, 'avg-ativa', true) returning id into active_cat;
  insert into public.menu_categories(restaurant_id, name, is_active) values (r, 'avg-inativa', true) returning id into inactive_cat;

  insert into public.menu_items(restaurant_id, category_id, name, price, is_available) values (r, active_cat, 'avg-a', 10.00, true) returning id into item_a;
  insert into public.menu_items(restaurant_id, category_id, name, price, is_available) values (r, active_cat, 'avg-b', 20.00, true);
  insert into public.menu_items(restaurant_id, category_id, name, price, is_available) values (r, null, 'avg-c', 33.33, true);
  insert into public.menu_items(restaurant_id, category_id, name, price, is_available) values (r, active_cat, 'avg-indisponivel', 999.00, false);
  insert into public.menu_items(restaurant_id, category_id, name, price, is_available) values (r, inactive_cat, 'avg-cat-inativa', 500.00, true);

  select avg_menu_price_cents into avg_cents from public.restaurants where id = r;
  insert into avg_price_results values ('média simples em centavos dos itens disponíveis, indisponível fora',
    avg_cents = round((10.00 + 20.00 + 33.33 + 500.00) / 4 * 100));
  -- 10,00 + 20,00 + 33,33 + 500,00 (categoria ainda ativa) = 563,33 / 4 → 14083 centavos.

  update public.menu_categories set is_active = false where id = inactive_cat;
  select avg_menu_price_cents into avg_cents from public.restaurants where id = r;
  insert into avg_price_results values ('categoria inativa sai da média', avg_cents = 2111);

  update public.menu_items set price = 40.00 where id = item_a;
  select avg_menu_price_cents into avg_cents from public.restaurants where id = r;
  insert into avg_price_results values ('mudar o preço de um item recalcula a média', avg_cents = round((40.00 + 20.00 + 33.33) / 3 * 100));

  update public.menu_items set is_available = false where id = item_a;
  select avg_menu_price_cents into avg_cents from public.restaurants where id = r;
  insert into avg_price_results values ('item que fica indisponível sai da média', avg_cents = round((20.00 + 33.33) / 2 * 100));

  delete from public.menu_items where restaurant_id = r and name = 'avg-b';
  select avg_menu_price_cents into avg_cents from public.restaurants where id = r;
  insert into avg_price_results values ('apagar um item recalcula a média', avg_cents = 3333);

  insert into avg_price_results values ('a coluna é bigint (invariante de dinheiro em centavos)',
    (select data_type from information_schema.columns
      where table_schema = 'public' and table_name = 'restaurants' and column_name = 'avg_menu_price_cents') = 'bigint');
end $$;

select ok(ok, label) from avg_price_results order by label;
select * from finish();
rollback;
