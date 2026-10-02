-- Preferência da fila virtual = setor do mapa de mesas (20261001151000): o cliente vê os setores
-- que o restaurante tem, a fila só aceita 'qualquer' ou um desses setores e grava o nome canônico.
begin;
select plan(9);

create temp table sections_results(label text primary key, ok boolean not null);

do $$
declare
  r uuid := 'c1000000-0000-4000-8000-000000000002';
  customer uuid := gen_random_uuid();
  customer_email text := gen_random_uuid() || '@waitlist-sections.test';
  secs jsonb;
  entry public.waitlist_entries;
begin
  insert into auth.users(id, email) values (customer, customer_email);
  insert into public.profiles(id, email) values (customer, customer_email) on conflict (id) do update set email = excluded.email;

  -- O relógio não pode decidir o teste: restaurante sempre aberto dentro desta transação.
  create or replace function private.restaurant_is_open_now(p_restaurant_id uuid)
  returns boolean language sql as $f$ select true $f$;
  update public.restaurants
    set is_active = true, service_type = 'casual_dining',
        settings = coalesce(settings, '{}'::jsonb) #- '{customer_experience}',
        service_config = coalesce(service_config, '{}'::jsonb) #- '{feature_overrides}'
    where id = r;

  delete from public.tables where restaurant_id = r;
  insert into public.tables(restaurant_id, table_number, seats, status, section) values
    (r, 'sec-1', 4, 'available', 'Rooftop'),
    (r, 'sec-2', 4, 'available', 'Salão Principal'),
    (r, 'sec-3', 4, 'available', 'Salão Principal'),
    (r, 'sec-4', 4, 'available', ' salao principal '),
    (r, 'sec-5', 4, 'available', 'Varanda'),
    (r, 'sec-6', 4, 'available', null),
    (r, 'sec-7', 4, 'available', '   ');

  perform set_config('request.jwt.claims', jsonb_build_object('sub', customer, 'role', 'authenticated')::text, true);

  secs := public.customer_get_waitlist_sections(r);
  insert into sections_results values ('o cliente recebe os setores do restaurante, sem repetir grafias nem vazios',
    secs = '["Rooftop", "Salão Principal", "Varanda"]'::jsonb);

  entry := public.customer_join_waitlist(r, 2, 'salao principal');
  insert into sections_results values ('setor existente é aceito e grava o nome canônico', entry.preference = 'Salão Principal');
  delete from public.waitlist_entries where customer_id = customer;

  entry := public.customer_join_waitlist(r, 2, 'VARANDA');
  insert into sections_results values ('a comparação ignora caixa', entry.preference = 'Varanda');
  delete from public.waitlist_entries where customer_id = customer;

  entry := public.customer_join_waitlist(r, 2);
  insert into sections_results values ('sem preferência vira qualquer', entry.preference = 'qualquer');
  delete from public.waitlist_entries where customer_id = customer;

  entry := public.customer_join_waitlist(r, 2, 'Qualquer');
  insert into sections_results values ('qualquer é sempre aceito', entry.preference = 'qualquer');
  delete from public.waitlist_entries where customer_id = customer;

  begin
    perform public.customer_join_waitlist(r, 2, 'Terraço');
    insert into sections_results values ('setor que o restaurante não tem é recusado', false);
  exception when sqlstate '22023' then
    insert into sections_results values ('setor que o restaurante não tem é recusado', true);
  end;
  insert into sections_results values ('a entrada recusada não foi gravada',
    not exists (select 1 from public.waitlist_entries where customer_id = customer));

  insert into sections_results values ('a preferência é texto livre, não mais o enum fixo',
    (select data_type from information_schema.columns
      where table_schema = 'public' and table_name = 'waitlist_entries' and column_name = 'preference') = 'text');
  insert into sections_results values ('o enum antigo foi removido',
    not exists (select 1 from pg_type where typname = 'waitlist_entries_preference_enum'));
end $$;

select ok(ok, label) from sections_results order by label;
select * from finish();
rollback;
