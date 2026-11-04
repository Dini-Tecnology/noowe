-- Fatia O3 (docs/fatias/O3-funcoes-e-escala.md), um bloco por critério de aceite.
begin;
select plan(12);

create function pg_temp.act(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.state_of(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ok'; exception when others then return sqlstate; end $$;
create temp table _ctx(k text primary key, v uuid);
grant select on _ctx to authenticated;
create function pg_temp.ctx(p_k text) returns uuid language sql as $$ select v from _ctx where k = p_k $$;
create function pg_temp.new_user(p_name text) returns uuid language plpgsql as $$
declare u uuid := gen_random_uuid();
begin
  insert into auth.users(id, email) values (u, p_name || '-' || u || '@o3.test');
  insert into public.profiles(id, full_name) values (u, p_name) on conflict (id) do update set full_name = p_name;
  insert into _ctx values (p_name, u);
  return u;
end $$;

do $$
declare r uuid := 'c1000000-0000-4000-8000-000000000002'; m uuid; m2 uuid; w uuid;
begin
  insert into _ctx values ('r', r), ('owner', 'c1000000-0000-4000-8000-000000000001');
  m := pg_temp.new_user('manager'); m2 := pg_temp.new_user('manager2'); w := pg_temp.new_user('waiter');
  perform pg_temp.new_user('novo'); perform pg_temp.new_user('novo2');
  insert into public.user_roles(user_id, restaurant_id, role) values (m, r, 'manager'), (m2, r, 'manager'), (w, r, 'waiter');
end $$;

-- ---------------------------------------------------------------------------
-- Critério 4: só o Dono concede Dono e Gerente, em qualquer caminho
-- ---------------------------------------------------------------------------
select pg_temp.act(pg_temp.ctx('manager'));
select is(pg_temp.state_of(format($q$select public.restaurant_upsert_staff_role(%L, %L, 'manager')$q$, pg_temp.ctx('r'), pg_temp.ctx('novo'))),
  '42501', 'critério 4: Gerente não concede Gerente pela RPC');
select is(pg_temp.state_of(format($q$select public.restaurant_upsert_staff_role(%L, %L, 'owner')$q$, pg_temp.ctx('r'), pg_temp.ctx('novo'))),
  '42501', 'critério 4: Gerente não concede Dono');
select is(pg_temp.state_of(format($q$select public.restaurant_deactivate_staff((select id from public.user_roles where user_id = %L))$q$, pg_temp.ctx('manager2'))),
  '42501', 'Gerente não inativa outro Gerente');
select is(pg_temp.state_of(format($q$select public.restaurant_update_staff_role((select id from public.user_roles where user_id = %L), 'manager')$q$, pg_temp.ctx('waiter'))),
  '42501', 'Gerente não promove Garçom a Gerente');
select is(pg_temp.state_of(format($q$select public.restaurant_upsert_staff_role(%L, %L, 'host')$q$, pg_temp.ctx('r'), pg_temp.ctx('novo'))),
  '42501', 'função fora da lista não é concedida');
select is(pg_temp.state_of(format($q$select public.restaurant_upsert_staff_role(%L, %L, 'waiter')$q$, pg_temp.ctx('r'), pg_temp.ctx('novo'))),
  'ok', 'Gerente segue concedendo as funções operacionais');
select is((select count(*)::int from public.audit_logs where action = 'staff_role_granted' and restaurant_id = pg_temp.ctx('r')
  and user_id = pg_temp.ctx('manager') and "after"->>'user_id' = pg_temp.ctx('novo')::text), 1, 'conceder função fica em audit_logs, com autor');

select pg_temp.act(pg_temp.ctx('owner'));
select is(pg_temp.state_of(format($q$select public.restaurant_upsert_staff_role(%L, %L, 'manager')$q$, pg_temp.ctx('r'), pg_temp.ctx('novo2'))),
  'ok', 'critério 4: o Dono concede Gerente');
select is(pg_temp.state_of(format($q$select public.restaurant_deactivate_staff((select id from public.user_roles where user_id = %L))$q$, pg_temp.ctx('manager2'))),
  'ok', 'o Dono inativa um Gerente');
select is((select count(*)::int from public.audit_logs where action = 'staff_role_revoked' and "before"->>'user_id' = pg_temp.ctx('manager2')::text), 1,
  'remover função fica em audit_logs');

select pg_temp.act(pg_temp.ctx('manager'));
set local role authenticated;
select is(pg_temp.state_of(format($q$insert into public.profile_roles(user_id, role_key, restaurant_id) values (%L, 'manager', %L)$q$, pg_temp.ctx('novo'), pg_temp.ctx('r'))),
  '42501', 'profile_roles não é caminho paralelo para ganhar função');
select is(pg_temp.state_of(format($q$update public.user_roles set role = 'manager' where user_id = %L$q$, pg_temp.ctx('waiter'))),
  '42501', 'update direto também não promove a Gerente');
reset role;

select * from finish();
rollback;
