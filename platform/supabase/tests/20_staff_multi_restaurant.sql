-- Uma pessoa em mais de um restaurante (20260930143000): o vínculo em outro
-- restaurante não bloqueia, não revela o nome do outro restaurante e não dá
-- acesso além do papel de cada vínculo.
begin;
select plan(5);

create temp table multi_results(label text primary key, ok boolean not null);

do $$
declare
  restaurant_a uuid := 'c1000000-0000-4000-8000-000000000002';
  owner_a uuid := 'c1000000-0000-4000-8000-000000000001';
  restaurant_b uuid := 'd1000000-0000-4000-8000-000000000002';
  owner_b uuid := 'd1000000-0000-4000-8000-000000000001';
  worker uuid := gen_random_uuid();
  worker_email text;
  found jsonb;
  role_count integer;
begin
  worker_email := worker || '@multi-restaurant.test';
  insert into auth.users(id, email) values (worker, worker_email);
  insert into public.profiles(id, email) values (worker, worker_email) on conflict (id) do update set email = excluded.email;

  -- Garçom no restaurante A.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', owner_a, 'role', 'authenticated')::text, true);
  perform public.restaurant_upsert_staff_role(restaurant_a, worker, 'waiter');

  -- O dono do restaurante B encontra a mesma pessoa: pode vincular, sem ver o nome de A.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', owner_b, 'role', 'authenticated')::text, true);
  found := public.restaurant_find_user_by_email(restaurant_b, worker_email);
  insert into multi_results values ('a busca diz que a pessoa trabalha em outro restaurante',
    (found->>'works_in_other_restaurant')::boolean and not (found->>'already_in_this_restaurant')::boolean);
  insert into multi_results values ('a busca não revela o nome do outro restaurante',
    found->'linked_to_other_restaurant' = 'null'::jsonb and position((select name from public.restaurants where id = restaurant_a) in found::text) = 0);

  perform public.restaurant_upsert_staff_role(restaurant_b, worker, 'manager');
  select count(*) into role_count from public.user_roles where user_id = worker and is_active;
  insert into multi_results values ('a mesma conta tem vínculo ativo nos dois restaurantes', role_count = 2);

  -- Cada vínculo vale só dentro do seu restaurante e do seu papel.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', worker, 'role', 'authenticated')::text, true);
  begin
    perform public.restaurant_get_staff(restaurant_b);
    insert into multi_results values ('gerente em B enxerga a equipe de B', true);
  exception when others then
    insert into multi_results values ('gerente em B enxerga a equipe de B', false);
  end;
  begin
    perform public.restaurant_upsert_staff_role(restaurant_a, worker, 'owner');
    insert into multi_results values ('garçom em A não consegue se promover em A (o cargo de gerente em B não vale em A)', false);
  exception when others then
    insert into multi_results values ('garçom em A não consegue se promover em A (o cargo de gerente em B não vale em A)', true);
  end;
end $$;

select ok(ok, label) from multi_results order by label;
select * from finish();
rollback;
