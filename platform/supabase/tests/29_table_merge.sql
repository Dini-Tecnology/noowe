-- ADR-018 — junção de mesas: capacidade efetiva, permissão, auditoria, QR da mesa filha,
-- pedido de abertura resolvido com juncao_mesas e liberação automática ao fechar a sessão.
begin;
select plan(10);

create temp table _m (k text primary key, v uuid);
create temp table _mq (k text primary key, v text);
create temp table _mr (label text primary key, ok boolean not null);

create function pg_temp.act(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.id(p_key text) returns uuid language sql as $$ select v from _m where k = p_key; $$;
create function pg_temp.qr(p_key text) returns text language sql as $$ select v from _mq where k = p_key; $$;
create function pg_temp.state_of(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ok'; exception when others then return sqlstate; end $$;

do $$
declare
  r uuid := 'c1000000-0000-4000-8000-000000000002';
  owner_id uuid := 'c1000000-0000-4000-8000-000000000001';
  u text; t jsonb; res jsonb; sid uuid; req uuid; resolved jsonb;
begin
  foreach u in array array['waiter','host','mate','big'] loop
    insert into _m values (u, gen_random_uuid());
    insert into auth.users(id, email) values (pg_temp.id(u), u || '@merge.test');
    insert into public.profiles(id) values (pg_temp.id(u)) on conflict do nothing;
  end loop;
  insert into public.user_roles(user_id, restaurant_id, role) values (pg_temp.id('waiter'), r, 'waiter');

  update public.restaurants set opening_hours = (
    select jsonb_object_agg(d, jsonb_build_object('closed', false,
      'shifts', jsonb_build_array(jsonb_build_object('open', '00:00', 'close', '23:59'))))
    from unnest(array['sunday','monday','tuesday','wednesday','thursday','friday','saturday']) d
  ) where id = r;
  update public.restaurant_model_configs
  set service_models = array['casual_dining']::public.noowe_service_model[],
      queue_as_primary_entry = true, reservation_enabled = true, queue_enabled = true,
      enforce_table_capacity = true, capacity_request_ttl_min = 15,
      capacity_override_roles = array['maitre','manager']::public.user_roles_role_enum[]
  where restaurant_id = r;
  delete from public.waitlist_entries where restaurant_id = r and status = 'waiting';

  perform pg_temp.act(owner_id);
  t := public.restaurant_create_table(r, 'mg-1', 2); insert into _m values ('m1', (t->>'id')::uuid); insert into _mq values ('m1', t->>'qr_code');
  t := public.restaurant_create_table(r, 'mg-2', 2); insert into _m values ('m2', (t->>'id')::uuid); insert into _mq values ('m2', t->>'qr_code');
  t := public.restaurant_create_table(r, 'mg-3', 2); insert into _m values ('m3', (t->>'id')::uuid); insert into _mq values ('m3', t->>'qr_code');
  t := public.restaurant_create_table(r, 'mg-4', 2); insert into _m values ('m4', (t->>'id')::uuid); insert into _mq values ('m4', t->>'qr_code');

  -- 1/2/3. Capacidade efetiva = soma do grupo; o garçom não reorganiza; a junção é auditada.
  insert into _mr values ('a single table has its own seats as effective capacity',
    private.table_effective_seats(pg_temp.id('m1')) = 2);
  perform pg_temp.act(pg_temp.id('waiter'));
  insert into _mr values ('a waiter cannot merge tables',
    pg_temp.state_of(format($f$select public.restaurant_merge_tables(%L, array[%L]::uuid[])$f$, pg_temp.id('m1'), pg_temp.id('m2'))) = '42501');
  perform pg_temp.act(owner_id);
  res := public.restaurant_merge_tables(pg_temp.id('m1'), array[pg_temp.id('m2')]);
  insert into _mr values ('merge sums the seats, mirrors status and is audited with the actor',
    (res->>'effectiveSeats')::int = 4
    and private.table_effective_seats(pg_temp.id('m2')) = 4
    and (select merged_into_id from public.tables where id = pg_temp.id('m2')) = pg_temp.id('m1')
    and exists (select 1 from public.audit_logs where action = 'table.merged' and entity_id = pg_temp.id('m1')
                and user_id = owner_id and reason like 'juncao_mesas%'));

  -- 4. Mesa filha não pode ser principal de outra junção (um nível só).
  insert into _mr values ('a child table cannot be the main of another merge',
    pg_temp.state_of(format($f$select public.restaurant_merge_tables(%L, array[%L]::uuid[])$f$, pg_temp.id('m2'), pg_temp.id('m3'))) = 'P0014');

  -- 5. Grupo de 4 numa junção de 4 lugares abre direto (sem pedido), pelo QR da mesa FILHA.
  perform pg_temp.act(pg_temp.id('host'));
  res := public.customer_check_in(pg_temp.qr('m2'), 'casual_dining', 4);
  sid := (res->>'tableSessionId')::uuid;
  insert into _mr values ('the QR of a child table opens the session of the main table',
    sid is not null and (select table_id from public.table_sessions where id = sid) = pg_temp.id('m1')
    and (public.customer_resolve_service_qr(pg_temp.qr('m2'))->>'seats')::int = 4);

  -- 6. Quem escaneia a principal entra na MESMA sessão (uma conta por grupo).
  perform pg_temp.act(pg_temp.id('mate'));
  res := public.customer_check_in(pg_temp.qr('m1'), 'casual_dining', 1);
  insert into _mr values ('scanning the main table joins the same session',
    (res->>'tableSessionId')::uuid = sid
    and (select count(*) from public.table_sessions where table_id in (pg_temp.id('m1'), pg_temp.id('m2')) and status = 'active') = 1);

  -- 7. Separar abaixo da ocupação é recusado (P0015).
  perform pg_temp.act(owner_id);
  insert into _mr values ('unmerging below the group size is refused',
    pg_temp.state_of(format($f$select public.restaurant_unmerge_tables(%L)$f$, pg_temp.id('m1'))) = 'P0015');

  -- 8. Fechar a conta termina a junção (filha vai para o status de pós-uso).
  update public.table_sessions set status = 'ended' where id = sid;
  insert into _mr values ('closing the session ends the merge',
    (select merged_into_id is null and status = 'cleaning' from public.tables where id = pg_temp.id('m2')));

  -- 9/10. Pedido de abertura acima da mesa resolvido com juncao_mesas, e o cliente abre na principal.
  update public.tables set status = 'available' where id in (pg_temp.id('m1'), pg_temp.id('m2'));
  perform pg_temp.act(pg_temp.id('big'));
  res := public.customer_check_in(pg_temp.qr('m3'), 'casual_dining', 4);
  req := (res->>'capacityRequestId')::uuid;
  perform pg_temp.act(owner_id);
  resolved := public.restaurant_resolve_capacity_request(req, 'approve', 'juncao_mesas', 'une com a 4', array[pg_temp.id('m4')]);
  insert into _mr values ('a join decision merges the tables and approves the request in one step',
    resolved->>'status' = 'approved'
    and (select merged_into_id from public.tables where id = pg_temp.id('m4')) = pg_temp.id('m3')
    and exists (select 1 from public.audit_logs where action = 'capacity_request.approved' and entity_id = req));
  perform pg_temp.act(pg_temp.id('big'));
  res := public.customer_check_in_approved(req);
  insert into _mr values ('the approved customer opens the table on the merged group',
    (res->>'tableSessionId') is not null
    and (select declared_party_size from public.table_sessions where id = (res->>'tableSessionId')::uuid) = 4);
end $$;

select ok(ok, label) from _mr order by label;
select * from finish();
rollback;
