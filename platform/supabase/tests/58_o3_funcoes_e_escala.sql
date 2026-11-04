-- Fatia O3 (docs/fatias/O3-funcoes-e-escala.md), um bloco por critério de aceite.
begin;
select plan(64);

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

-- ---------------------------------------------------------------------------
-- Critério 2: as permissões são a soma das funções, e valem no servidor
-- ---------------------------------------------------------------------------
do $$ begin perform pg_temp.new_user('duas'); perform pg_temp.new_user('tres'); end $$;
select pg_temp.act(pg_temp.ctx('owner'));
select is(pg_temp.state_of(format($q$select public.restaurant_set_staff_roles(%L, %L, array['waiter', 'barman'], 'waiter')$q$, pg_temp.ctx('r'), pg_temp.ctx('duas'))),
  'ok', 'a mesma pessoa recebe duas funções de uma vez');
select pg_temp.act(pg_temp.ctx('duas'));
select is(public.restaurant_get_my_roles(pg_temp.ctx('r')), '{"roles": ["barman", "waiter"], "primary": "waiter", "permissions": []}'::jsonb,
  'a pessoa vê as duas funções e a principal');
select ok(private.has_restaurant_role(pg_temp.ctx('r'), array['waiter']::public.user_roles_role_enum[])
  and private.has_restaurant_role(pg_temp.ctx('r'), array['barman']::public.user_roles_role_enum[]), 'critério 2: as duas valem no servidor');
select is(pg_temp.state_of(format($q$select public.restaurant_get_shifts(%L)$q$, pg_temp.ctx('r'))), '42501', 'e só elas: Garçom e Barman não veem o que é de Gerente');

select pg_temp.act(pg_temp.ctx('owner'));
select is(pg_temp.state_of(format($q$select public.restaurant_set_staff_roles(%L, %L, array['barman'], 'waiter')$q$, pg_temp.ctx('r'), pg_temp.ctx('duas'))),
  '22023', 'a principal precisa estar entre as funções');
select is(pg_temp.state_of(format($q$select public.restaurant_set_staff_roles(%L, %L, array[]::text[], 'waiter')$q$, pg_temp.ctx('r'), pg_temp.ctx('duas'))),
  '22023', 'ninguém fica sem função por aqui');
select is(pg_temp.state_of(format($q$select public.restaurant_set_staff_roles(%L, %L, array['barman', 'chef'], 'chef')$q$, pg_temp.ctx('r'), pg_temp.ctx('duas'))),
  'ok', 'trocar as funções');
select pg_temp.act(pg_temp.ctx('duas'));
select is(public.restaurant_get_my_roles(pg_temp.ctx('r')), '{"roles": ["chef", "barman"], "primary": "chef", "permissions": []}'::jsonb, 'quem saiu perde a função, e a principal acompanha');
select ok(not private.has_restaurant_role(pg_temp.ctx('r'), array['waiter']::public.user_roles_role_enum[]), 'a função retirada deixa de valer no servidor');
select is((select count(*)::int from public.user_roles where user_id = pg_temp.ctx('duas') and is_primary), 1, 'só uma linha é a principal');
select is((select count(*)::int from public.audit_logs where action = 'staff_primary_changed' and entity_id = pg_temp.ctx('duas')), 2, 'cada troca da principal fica em audit_logs');

select pg_temp.act(pg_temp.ctx('manager'));
select is(pg_temp.state_of(format($q$select public.restaurant_set_staff_roles(%L, %L, array['waiter', 'manager'], 'waiter')$q$, pg_temp.ctx('r'), pg_temp.ctx('tres'))),
  '42501', 'Gerente não concede Gerente nem junto de outra função');
select is((select count(*)::int from public.user_roles where user_id = pg_temp.ctx('tres') and is_active), 0, 'e nada fica pela metade');
select is(pg_temp.state_of(format($q$select public.restaurant_set_staff_roles(%L, %L, array['chef'], 'chef')$q$, pg_temp.ctx('r'), pg_temp.ctx('manager'))),
  '42501', 'Gerente não tira a própria função de Gerente');
select pg_temp.act(pg_temp.ctx('owner'));
select is(pg_temp.state_of(format($q$select public.restaurant_deactivate_staff((select id from public.user_roles where user_id = %L limit 1))$q$, pg_temp.ctx('duas'))),
  'ok', 'inativar');
select is((select count(*)::int from public.user_roles where user_id = pg_temp.ctx('duas') and is_active), 0, 'inativar vale para a pessoa inteira');

-- ---------------------------------------------------------------------------
-- Critério 3: autoaprovação e caixa fechado por quem recebeu dinheiro
-- ---------------------------------------------------------------------------
do $$
declare r uuid := pg_temp.ctx('r'); ambos uuid := pg_temp.new_user('garcom_gerente'); c uuid := pg_temp.new_user('cliente'); o uuid;
begin
  perform pg_temp.act(pg_temp.ctx('owner'));
  perform public.restaurant_set_staff_roles(r, ambos, array['waiter', 'manager'], 'waiter');
  perform pg_temp.act(ambos);
  insert into _ctx values ('pedido_ambos', (public.restaurant_request_approval(r, 'other', 'Item', 'Teste', 0)->>'id')::uuid);
  insert into public.orders(restaurant_id, customer_id, order_type, total_amount, total_cents) values (r, c, 'dine_in', 30, 3000) returning id into o;
  insert into _ctx values ('pedido_caixa', o);
  perform pg_temp.act(pg_temp.ctx('manager'));
  insert into _ctx values ('caixa1', (public.restaurant_open_cash_register(r, 100)->>'id')::uuid);
end $$;
select pg_temp.act(pg_temp.ctx('garcom_gerente'));
select is(pg_temp.state_of(format($q$select public.restaurant_resolve_approval(%L, 'approved')$q$, pg_temp.ctx('pedido_ambos'))), '42501',
  'critério 3: Garçom e Gerente não aprova o próprio pedido');
select pg_temp.act(pg_temp.ctx('manager'));
select is(pg_temp.state_of(format($q$select public.restaurant_close_cash_register(%L, 100)$q$, pg_temp.ctx('caixa1'))), 'ok', 'quem não recebeu dinheiro fecha o caixa');
select is((select count(*)::int from public.audit_logs where action = 'cash.closed_by_receiver' and entity_id = pg_temp.ctx('caixa1')), 0, 'e não gera aviso');

select pg_temp.act(pg_temp.ctx('manager'));
do $$ begin insert into _ctx values ('caixa2', (public.restaurant_open_cash_register(pg_temp.ctx('r'), 100)->>'id')::uuid); end $$;
select is(pg_temp.state_of(format($q$select public.restaurant_record_payment(%L, 'cash', 30, 0)$q$, pg_temp.ctx('pedido_caixa'))), 'ok', 'o Gerente recebe em dinheiro');
select is(pg_temp.state_of(format($q$select public.restaurant_close_cash_register(%L, 130)$q$, pg_temp.ctx('caixa2'))), 'ok', 'e fecha o mesmo caixa');
select is((select count(*)::int from public.audit_logs where action = 'cash.closed_by_receiver' and entity_id = pg_temp.ctx('caixa2')), 1, 'critério 3: fica registrado');
select is((select count(*)::int from public.staff_tasks where kind = 'cash.closed_by_receiver' and entity_id = pg_temp.ctx('caixa2')), 1, 'e o Dono é avisado');
select ok((select bool_and(n.user_id <> pg_temp.ctx('manager')) from public.notifications n join public.staff_tasks t on t.id = n.related_id
  where t.kind = 'cash.closed_by_receiver' and t.entity_id = pg_temp.ctx('caixa2')), 'o aviso não volta para quem fechou');

-- Critério 1: a lista diz as funções da tarefa, para a etiqueta e o filtro
select pg_temp.act(pg_temp.ctx('owner'));
select ok((select (x->'primaryRoles') ? 'owner' from jsonb_array_elements(public.restaurant_list_tasks(pg_temp.ctx('r'))) x
  where x->>'kind' = 'cash.closed_by_receiver' limit 1), 'critério 1: a tarefa traz as funções para a etiqueta');

-- ---------------------------------------------------------------------------
-- Critério 5: Recepcionista é o Maître sem aprovar reserva nem isentar no-show
-- ---------------------------------------------------------------------------
do $$
declare r uuid := pg_temp.ctx('r'); c uuid := pg_temp.ctx('cliente'); m uuid := pg_temp.new_user('maitre'); rc uuid := pg_temp.new_user('recep'); x uuid := pg_temp.new_user('recep_gerente');
  a uuid; b uuid; ns uuid;
begin
  perform pg_temp.act(pg_temp.ctx('owner'));
  perform public.restaurant_set_staff_roles(r, m, array['maitre'], 'maitre');
  perform public.restaurant_set_staff_roles(r, rc, array['maitre'], 'maitre');
  perform public.restaurant_set_staff_roles(r, x, array['maitre', 'manager'], 'maitre');
  perform public.restaurant_set_receptionist(r, rc, true);
  perform public.restaurant_set_receptionist(r, x, true);
  insert into public.reservations(restaurant_id, customer_id, reservation_time, party_size, status) values (r, c, now() + interval '1 day', 2, 'pending') returning id into a;
  insert into public.reservations(restaurant_id, customer_id, reservation_time, party_size, status) values (r, c, now() + interval '2 day', 2, 'pending') returning id into b;
  insert into public.reservations(restaurant_id, customer_id, reservation_time, party_size, status) values (r, c, now() - interval '1 day', 2, 'no_show') returning id into ns;
  insert into _ctx values ('res_a', a), ('res_b', b), ('res_ns', ns);
end $$;
select pg_temp.act(pg_temp.ctx('recep'));
select is(pg_temp.state_of(format($q$select public.restaurant_update_reservation_status(%L, 'confirmed')$q$, pg_temp.ctx('res_a'))), '42501', 'critério 5: Recepcionista não aprova reserva');
select is(pg_temp.state_of(format($q$select public.restaurant_update_reservation_status(%L, 'cancelled')$q$, pg_temp.ctx('res_a'))), '42501', 'critério 5: nem recusa');
select is(pg_temp.state_of(format($q$select public.restaurant_update_reservation_status(%L, 'confirmed')$q$, pg_temp.ctx('res_ns'))), '42501', 'critério 5: nem isenta no-show');
select is(public.restaurant_get_my_roles(pg_temp.ctx('r'))->'permissions', '[]'::jsonb, 'o app recebe que ela não tem essas permissões');
select pg_temp.act(pg_temp.ctx('maitre'));
select is(pg_temp.state_of(format($q$select public.restaurant_update_reservation_status(%L, 'confirmed')$q$, pg_temp.ctx('res_a'))), 'ok', 'o Maître completo aprova');
select is((select count(*)::int from public.audit_logs where action = 'reservation.confirmed' and entity_id = pg_temp.ctx('res_a')), 1, 'aprovar fica registrado');
select pg_temp.act(pg_temp.ctx('recep_gerente'));
select is(pg_temp.state_of(format($q$select public.restaurant_update_reservation_status(%L, 'confirmed')$q$, pg_temp.ctx('res_b'))), 'ok', 'Recepcionista que também é Gerente segue podendo: é a soma');
select pg_temp.act(pg_temp.ctx('owner'));
select is(pg_temp.state_of(format($q$select public.restaurant_update_reservation_status(%L, 'confirmed')$q$, pg_temp.ctx('res_ns'))), 'ok', 'o Dono isenta o no-show');
select is((select count(*)::int from public.audit_logs where action = 'reservation.no_show_waived' and entity_id = pg_temp.ctx('res_ns')), 1, 'e fica registrado');
select is(pg_temp.state_of(format($q$select public.restaurant_set_receptionist(%L, %L, true)$q$, pg_temp.ctx('r'), pg_temp.ctx('waiter'))), '22023', 'só quem é Maître vira Recepcionista');
select pg_temp.act(pg_temp.ctx('recep'));
select is(pg_temp.state_of(format($q$select public.restaurant_set_receptionist(%L, %L, false)$q$, pg_temp.ctx('r'), pg_temp.ctx('recep'))), '42501', 'ela não tira a própria redução');
select pg_temp.act(pg_temp.ctx('recep'));
set local role authenticated;
select is(pg_temp.state_of(format($q$delete from public.role_permission_overrides where user_id = %L$q$, pg_temp.ctx('recep'))), '42501', 'nem direto na tabela');
reset role;

-- ---------------------------------------------------------------------------
-- Critério 6: a escala registra pessoa, função, área e estação
-- ---------------------------------------------------------------------------
do $$
declare r uuid := pg_temp.ctx('r'); e uuid := pg_temp.new_user('escalado'); t jsonb; st uuid;
begin
  perform pg_temp.act(pg_temp.ctx('owner'));
  perform public.restaurant_set_staff_roles(r, e, array['waiter', 'manager'], 'waiter');
  t := public.restaurant_create_table(r, 'o3-' || e, 4);
  update public.tables set section = 'Varanda O3' where id = (t->>'id')::uuid;
  insert into public.cook_stations(restaurant_id, name, type) values (r, 'Grelha O3', 'kitchen') returning id into st;
  insert into _ctx values ('estacao', st);
end $$;
select pg_temp.act(pg_temp.ctx('owner'));
select is((public.restaurant_create_shift(pg_temp.ctx('r'), pg_temp.ctx('escalado'), now(), '10:00', '18:00', 'waiter', null, 'Varanda O3', pg_temp.ctx('estacao'))->>'area'),
  'Varanda O3', 'critério 6: a escala guarda a área');
select is((select role from public.shifts where staff_id = pg_temp.ctx('escalado')), 'waiter', 'critério 6: e a função');
select is((select station_id from public.shifts where staff_id = pg_temp.ctx('escalado')), pg_temp.ctx('estacao'), 'critério 6: e a estação');
select is(pg_temp.state_of(format($q$select public.restaurant_create_shift(%L, %L, now(), '10:00', '18:00', 'chef')$q$, pg_temp.ctx('r'), pg_temp.ctx('escalado'))),
  '22023', 'não se escala em função que a pessoa não tem');
select is(pg_temp.state_of(format($q$select public.restaurant_create_shift(%L, %L, now(), '10:00', '18:00', 'waiter', null, 'Lua')$q$, pg_temp.ctx('r'), pg_temp.ctx('escalado'))),
  '22023', 'nem em área que não existe');
select is(pg_temp.state_of(format($q$select public.restaurant_create_shift(%L, %L, now(), '10:00', '18:00', 'waiter', null, null, %L)$q$, pg_temp.ctx('r'), pg_temp.ctx('escalado'), gen_random_uuid())),
  '22023', 'nem em estação de outro lugar');
select is((public.restaurant_create_shift(pg_temp.ctx('r'), pg_temp.ctx('escalado'), now(), '10:00', '18:00', 'Garçom')->>'role'), 'waiter', 'o rótulo de app antigo vira a função');
select is((public.restaurant_create_shift(pg_temp.ctx('r'), pg_temp.ctx('escalado'), now(), '10:00', '18:00', 'Caixa')->>'role'), null, 'rótulo desconhecido fica sem função');
select ok((public.restaurant_get_shift_options(pg_temp.ctx('r'))->'areas') ? 'Varanda O3', 'as opções trazem as áreas das mesas');
select is((select (x->>'station_name') from jsonb_array_elements(public.restaurant_get_shifts(pg_temp.ctx('r'), now() - interval '1 day', now() + interval '1 day')) x
  where x->>'staff_id' = pg_temp.ctx('escalado')::text and x->>'station_id' is not null limit 1), 'Grelha O3', 'a escala mostra o nome da estação');
select lives_ok(format($q$select public.restaurant_update_shift((select id from public.shifts where staff_id = %L and station_id is not null), p_area => '', p_clear_station => true)$q$, pg_temp.ctx('escalado')),
  'dá para tirar área e estação');
select is((select count(*)::int from public.shifts where staff_id = pg_temp.ctx('escalado') and (area is not null or station_id is not null)), 0, 'e elas saem');
update public.shifts set status = 'cancelled' where restaurant_id = pg_temp.ctx('r');
insert into public.shifts(staff_id, restaurant_id, date, start_time, end_time, role, status, is_overtime, created_at, updated_at)
select pg_temp.ctx('escalado'), pg_temp.ctx('r'), (now() at time zone private.restaurant_time_zone())::date,
  to_char(now() at time zone private.restaurant_time_zone() - interval '1 hour', 'HH24:MI'),
  to_char(now() at time zone private.restaurant_time_zone() + interval '1 hour', 'HH24:MI'), 'waiter', 'scheduled', false, now(), now();
select ok(not private.manager_on_shift(pg_temp.ctx('r')), 'Gerente escalado como Garçom não conta como Gerente em turno');
update public.shifts set role = 'manager' where restaurant_id = pg_temp.ctx('r') and status = 'scheduled';
select ok(private.manager_on_shift(pg_temp.ctx('r')), 'escalado como Gerente, conta');
update public.shifts set role = null where restaurant_id = pg_temp.ctx('r') and status = 'scheduled';
select ok(private.manager_on_shift(pg_temp.ctx('r')), 'sem função na escala, vale o que a pessoa é');

select * from finish();
rollback;
