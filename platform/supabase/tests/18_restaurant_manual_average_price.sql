-- Preço médio cadastrado pelo restaurante (20261001150000, ADR-014): bigint em centavos,
-- gravado e apagado só por dono/gerente via restaurant_update_profile; mudar o cardápio
-- não mexe nele.
begin;
select plan(11);

create temp table avg_price_results(label text primary key, ok boolean not null);

do $$
declare
  r uuid := 'c1000000-0000-4000-8000-000000000002';
  owner_a uuid := 'c1000000-0000-4000-8000-000000000001';
  waiter uuid := gen_random_uuid();
  waiter_email text := gen_random_uuid() || '@avg-price.test';
  stored bigint;
  profile jsonb;
begin
  insert into auth.users(id, email) values (waiter, waiter_email);
  insert into public.profiles(id, email) values (waiter, waiter_email) on conflict (id) do update set email = excluded.email;

  perform set_config('request.jwt.claims', jsonb_build_object('sub', owner_a, 'role', 'authenticated')::text, true);
  perform public.restaurant_upsert_staff_role(r, waiter, 'waiter');

  -- Ninguém cadastrou: a coluna zerou na migration e nada a recalcula.
  update public.restaurants set average_price_cents = null where id = r;
  insert into avg_price_results values ('a coluna é bigint (invariante de dinheiro em centavos)',
    (select data_type from information_schema.columns
      where table_schema = 'public' and table_name = 'restaurants' and column_name = 'average_price_cents') = 'bigint');
  insert into avg_price_results values ('a coluna antiga da média calculada não existe mais',
    not exists (select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'restaurants' and column_name = 'avg_menu_price_cents'));
  insert into avg_price_results values ('o cálculo automático por trigger foi removido',
    not exists (select 1 from pg_trigger where tgname in ('menu_items_refresh_avg_price', 'menu_categories_refresh_avg_price')));

  -- Dono grava R$ 50,00.
  profile := public.restaurant_update_profile(r, jsonb_build_object('average_price_cents', 5000));
  select average_price_cents into stored from public.restaurants where id = r;
  insert into avg_price_results values ('o dono grava o preço médio em centavos', stored = 5000 and (profile->>'average_price_cents')::bigint = 5000);

  -- Mexer no cardápio não recalcula nada.
  insert into public.menu_items(restaurant_id, name, price, is_available) values (r, 'avg-manual-caro', 900.00, true);
  update public.menu_items set price = 1.00 where restaurant_id = r and name = 'avg-manual-caro';
  select average_price_cents into stored from public.restaurants where id = r;
  insert into avg_price_results values ('mudar o cardápio não altera o preço cadastrado', stored = 5000);

  -- Outros campos do perfil não apagam o preço.
  perform public.restaurant_update_profile(r, jsonb_build_object('description', 'avg-manual-desc'));
  select average_price_cents into stored from public.restaurants where id = r;
  insert into avg_price_results values ('atualizar outro campo do perfil mantém o preço', stored = 5000);

  -- Valores inválidos são recusados e o preço continua o mesmo.
  begin
    perform public.restaurant_update_profile(r, jsonb_build_object('average_price_cents', 0));
    insert into avg_price_results values ('zero é recusado', false);
  exception when sqlstate '22023' then insert into avg_price_results values ('zero é recusado', true); end;
  begin
    perform public.restaurant_update_profile(r, jsonb_build_object('average_price_cents', -100));
    insert into avg_price_results values ('negativo é recusado', false);
  exception when sqlstate '22023' then insert into avg_price_results values ('negativo é recusado', true); end;
  begin
    perform public.restaurant_update_profile(r, jsonb_build_object('average_price_cents', 12.5));
    insert into avg_price_results values ('centavo fracionado (float) é recusado', false);
  exception when sqlstate '22023' then insert into avg_price_results values ('centavo fracionado (float) é recusado', true); end;

  -- Garçom não grava.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', waiter, 'role', 'authenticated')::text, true);
  begin
    perform public.restaurant_update_profile(r, jsonb_build_object('average_price_cents', 1));
    insert into avg_price_results values ('garçom não grava o preço médio', false);
  exception when others then insert into avg_price_results values ('garçom não grava o preço médio', true); end;

  -- Dono apaga: null explícito limpa e o app deixa de mostrar preço.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', owner_a, 'role', 'authenticated')::text, true);
  perform public.restaurant_update_profile(r, jsonb_build_object('average_price_cents', null));
  select average_price_cents into stored from public.restaurants where id = r;
  insert into avg_price_results values ('null explícito apaga o preço (não informar)', stored is null);
end $$;

select ok(ok, label) from avg_price_results order by label;
select * from finish();
rollback;
