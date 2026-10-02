-- Vários donos por restaurante e vários restaurantes por dono (20261001152000):
-- só dono concede/revoga dono, o restaurante nunca fica sem dono, restaurants.owner_id e
-- profile_roles acompanham a saída de um dono, a troca deixa auditoria e create_my_restaurant
-- cria um restaurante novo a cada chamada (idempotente por p_request_id).
begin;
select plan(10);

create temp table owner_results(label text primary key, ok boolean not null);

do $$
declare
  a uuid := gen_random_uuid();   -- dono original
  b uuid := gen_random_uuid();   -- segundo dono
  m uuid := gen_random_uuid();   -- gerente
  c uuid := gen_random_uuid();   -- outra pessoa
  req uuid := gen_random_uuid();
  r1 jsonb; r2 jsonb; r2_again jsonb; r3 jsonb; r4 jsonb;
  rid uuid; role_a uuid; role_b uuid; n integer;
begin
  insert into auth.users(id, email) values (a, a || '@multi-owner.test'), (b, b || '@multi-owner.test'),
    (m, m || '@multi-owner.test'), (c, c || '@multi-owner.test');
  insert into public.profiles(id, email) values (a, a || '@multi-owner.test'), (b, b || '@multi-owner.test'),
    (m, m || '@multi-owner.test'), (c, c || '@multi-owner.test')
    on conflict (id) do update set email = excluded.email;

  -- ── um dono, vários restaurantes ───────────────────────────────────────────
  perform set_config('request.jwt.claims', jsonb_build_object('sub', a, 'role', 'authenticated')::text, true);
  r1 := public.create_my_restaurant('Multi Owner 1', '11999990001', 'dono@multi-owner.test', p_service_type => 'casual_dining', p_request_id => gen_random_uuid());
  r2 := public.create_my_restaurant('Multi Owner 2', '11999990001', 'dono@multi-owner.test', p_service_type => 'casual_dining', p_request_id => req);
  insert into owner_results values ('quem já é dono cria outro restaurante e recebe um id novo', (r1->>'id') <> (r2->>'id'));

  r2_again := public.create_my_restaurant('Multi Owner 2', '11999990001', 'dono@multi-owner.test', p_service_type => 'casual_dining', p_request_id => req);
  insert into owner_results values ('repetir a mesma criação (mesmo p_request_id) devolve o mesmo restaurante', (r2_again->>'id') = (r2->>'id'));

  r3 := public.create_my_restaurant('Multi Owner 3', '11999990001', 'dono@multi-owner.test', p_service_type => 'casual_dining');
  r4 := public.create_my_restaurant('Multi Owner 4', '11999990001', 'dono@multi-owner.test', p_service_type => 'casual_dining');
  select count(*) into n from public.restaurants where owner_id = a;
  insert into owner_results values ('o dono acumula restaurantes: quatro criações, quatro restaurantes', n = 4 and (r3->>'id') <> (r4->>'id'));

  -- ── vários donos num restaurante ───────────────────────────────────────────
  rid := (r1->>'id')::uuid;
  perform public.restaurant_upsert_staff_role(rid, b, 'owner');
  perform public.restaurant_upsert_staff_role(rid, m, 'manager');
  select count(*) into n from public.user_roles where restaurant_id = rid and role = 'owner' and is_active;
  insert into owner_results values ('um dono adiciona outro dono: o restaurante passa a ter dois', n = 2);
  select count(*) into n from public.audit_logs where restaurant_id = rid and action = 'owner_granted' and user_id = a;
  insert into owner_results values ('conceder dono grava autor e motivo em audit_logs', n = 1
    and (select reason from public.audit_logs where restaurant_id = rid and action = 'owner_granted') is not null);

  -- ── gerente não mexe em dono ───────────────────────────────────────────────
  select id into role_b from public.user_roles where restaurant_id = rid and user_id = b and role = 'owner';
  perform set_config('request.jwt.claims', jsonb_build_object('sub', m, 'role', 'authenticated')::text, true);
  begin
    perform public.restaurant_upsert_staff_role(rid, c, 'owner');
    insert into owner_results values ('gerente não concede o papel de dono', false);
  exception when sqlstate '42501' then insert into owner_results values ('gerente não concede o papel de dono', true); end;
  begin
    perform public.restaurant_deactivate_staff(role_b);
    insert into owner_results values ('gerente não desativa um dono', false);
  exception when sqlstate '42501' then insert into owner_results values ('gerente não desativa um dono', true); end;

  -- ── dono revoga dono: owner_id e profile_roles acompanham ───────────────────
  perform set_config('request.jwt.claims', jsonb_build_object('sub', b, 'role', 'authenticated')::text, true);
  select id into role_a from public.user_roles where restaurant_id = rid and user_id = a and role = 'owner';
  perform public.restaurant_deactivate_staff(role_a);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', a, 'role', 'authenticated')::text, true);
  insert into owner_results values ('quem perdeu o papel de dono perde o acesso (owner_id e profile_roles inclusive)',
    (select owner_id from public.restaurants where id = rid) = b
    and not private.has_restaurant_role(rid, array['owner']::public.user_roles_role_enum[])
    and private.has_restaurant_role((r2->>'id')::uuid, array['owner']::public.user_roles_role_enum[]));

  -- ── o restaurante nunca fica sem dono ──────────────────────────────────────
  perform set_config('request.jwt.claims', jsonb_build_object('sub', b, 'role', 'authenticated')::text, true);
  begin
    delete from public.user_roles where id = role_b;
    insert into owner_results values ('o último dono ativo não pode ser removido', false);
  exception when sqlstate '23514' then insert into owner_results values ('o último dono ativo não pode ser removido', true); end;

  -- ── apagar o restaurante não é barrado pela regra do último dono ───────────
  perform set_config('request.jwt.claims', jsonb_build_object('sub', a, 'role', 'authenticated')::text, true);
  delete from public.restaurants where id = (r4->>'id')::uuid;
  insert into owner_results values ('apagar o restaurante leva os papéis junto (cascata não é barrada)',
    not exists (select 1 from public.user_roles where restaurant_id = (r4->>'id')::uuid));
end $$;

select ok(ok, label) from owner_results order by label;
select * from finish();
rollback;
