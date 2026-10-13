-- ADR-018 — troca de mesa: move sessão, pedidos e solicitações; audita e avisa; QR antigo devolve a
-- visita atual; pedidos de abertura e de entrada resolvidos com troca_de_mesa; mesa da reserva.
begin;
select plan(11);

create temp table _w (k text primary key, v uuid);
create temp table _wq (k text primary key, v text);
create temp table _wr (label text primary key, ok boolean not null);

create function pg_temp.act(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.id(p_key text) returns uuid language sql as $$ select v from _w where k = p_key; $$;
create function pg_temp.qr(p_key text) returns text language sql as $$ select v from _wq where k = p_key; $$;
create function pg_temp.state_of(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ok'; exception when others then return sqlstate; end $$;

do $$
declare
  r uuid := 'c1000000-0000-4000-8000-000000000002';
  owner_id uuid := 'c1000000-0000-4000-8000-000000000001';
  u text; t jsonb; res jsonb; sid uuid; req uuid; resolved jsonb; sid2 uuid; resv uuid;
begin
  foreach u in array array['waiter','host','guest','big','host2','buyer'] loop
    insert into _w values (u, gen_random_uuid());
    insert into auth.users(id, email) values (pg_temp.id(u), u || '@swap.test');
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
      enforce_table_capacity = true, capacity_request_ttl_min = 15, guest_link_enabled = true,
      capacity_override_roles = array['maitre','manager']::public.user_roles_role_enum[]
  where restaurant_id = r;
  delete from public.waitlist_entries where restaurant_id = r and status = 'waiting';

  perform pg_temp.act(owner_id);
  t := public.restaurant_create_table(r, 'sw-s1', 2); insert into _w values ('s1', (t->>'id')::uuid); insert into _wq values ('s1', t->>'qr_code');
  t := public.restaurant_create_table(r, 'sw-s2', 2); insert into _w values ('s2', (t->>'id')::uuid); insert into _wq values ('s2', t->>'qr_code');
  t := public.restaurant_create_table(r, 'sw-b1', 6); insert into _w values ('b1', (t->>'id')::uuid); insert into _wq values ('b1', t->>'qr_code');
  t := public.restaurant_create_table(r, 'sw-b2', 6); insert into _w values ('b2', (t->>'id')::uuid); insert into _wq values ('b2', t->>'qr_code');
  t := public.restaurant_create_table(r, 'sw-b3', 6); insert into _w values ('b3', (t->>'id')::uuid); insert into _wq values ('b3', t->>'qr_code');

  -- Sessão do anfitrião na mesa pequena (2 pessoas).
  perform pg_temp.act(pg_temp.id('host'));
  res := public.customer_check_in(pg_temp.qr('s1'), 'casual_dining', 2);
  sid := (res->>'tableSessionId')::uuid;

  -- Recusas: o garçom não troca; destino ocupado e destino pequeno demais.
  perform pg_temp.act(pg_temp.id('waiter'));
  insert into _wr values ('a waiter cannot swap tables',
    pg_temp.state_of(format($f$select public.restaurant_move_table_session(%L, %L)$f$, sid, pg_temp.id('b1'))) = '42501');
  perform pg_temp.act(owner_id);
  update public.tables set status = 'occupied' where id = pg_temp.id('b2');
  insert into _wr values ('an occupied target is refused (P0014)',
    pg_temp.state_of(format($f$select public.restaurant_move_table_session(%L, %L)$f$, sid, pg_temp.id('b2'))) = 'P0014');
  update public.tables set status = 'available' where id = pg_temp.id('b2');
  update public.table_sessions set declared_party_size = 4 where id = sid;
  insert into _wr values ('a target too small for the group is refused (P0015)',
    pg_temp.state_of(format($f$select public.restaurant_move_table_session(%L, %L)$f$, sid, pg_temp.id('s2'))) = 'P0015');
  update public.table_sessions set declared_party_size = 2 where id = sid;

  -- Troca válida.
  res := public.restaurant_move_table_session(sid, pg_temp.id('b1'), 'mesa maior');
  insert into _wr values ('swap moves the session, frees the source for cleaning and occupies the target',
    (select table_id = pg_temp.id('b1') and previous_table_id = pg_temp.id('s1') from public.table_sessions where id = sid)
    and (select status from public.tables where id = pg_temp.id('s1')) = 'cleaning'
    and (select status from public.tables where id = pg_temp.id('b1')) = 'occupied');
  insert into _wr values ('swap is audited and every participant is told the new table',
    exists (select 1 from public.audit_logs where action = 'table_session.moved' and entity_id = sid and user_id = owner_id)
    and exists (select 1 from public.notifications n where n.user_id = pg_temp.id('host')
                and n.notification_type::text = 'table_moved' and n.related_id = sid));

  -- QR da mesa antiga devolve a visita atual, sem abrir outra sessão.
  perform pg_temp.act(pg_temp.id('host'));
  res := public.customer_check_in(pg_temp.qr('s1'), 'casual_dining', 2);
  insert into _wr values ('the old QR returns the current visit after a swap',
    (res->>'tableMoved')::boolean and (res->>'tableSessionId')::uuid = sid
    and (select count(*) from public.table_sessions where table_id = pg_temp.id('s1') and status = 'active') = 0);

  -- Pedido de abertura (grupo de 5 numa mesa de 2) resolvido com troca_de_mesa.
  perform pg_temp.act(pg_temp.id('big'));
  res := public.customer_check_in(pg_temp.qr('s2'), 'casual_dining', 5);
  req := (res->>'capacityRequestId')::uuid;
  perform pg_temp.act(owner_id);
  insert into _wr values ('swap without a target table is invalid input (22023)',
    pg_temp.state_of(format($f$select public.restaurant_resolve_capacity_request(%L, 'approve', 'troca_de_mesa', null)$f$, req)) = '22023');
  insert into _wr values ('tables with another reason are invalid input (22023)',
    pg_temp.state_of(format($f$select public.restaurant_resolve_capacity_request(%L, 'approve', 'cadeira_extra', null, array[%L]::uuid[])$f$, req, pg_temp.id('b2'))) = '22023');
  resolved := public.restaurant_resolve_capacity_request(req, 'approve', 'troca_de_mesa', 'mesa maior', array[pg_temp.id('b2')]);
  perform pg_temp.act(pg_temp.id('big'));
  res := public.customer_check_in_approved(req);
  insert into _wr values ('an open request approved with a swap opens on the target table',
    resolved->>'status' = 'approved'
    and (select table_id from public.table_sessions where id = (res->>'tableSessionId')::uuid) = pg_temp.id('b2')
    and (select status from public.tables where id = pg_temp.id('s2')) = 'available');

  -- Mesa da reserva: grupo maior que a mesa pede junção antes; mesa que cabe é atribuída.
  insert into public.reservations(restaurant_id, customer_id, reservation_time, party_size, status, service_model)
    values (r, pg_temp.id('buyer'), now() + interval '1 hour', 4, 'confirmed', 'casual_dining') returning id into resv;
  perform pg_temp.act(owner_id);
  insert into _wr values ('a reservation does not take a table that is too small',
    pg_temp.state_of(format($f$select public.restaurant_assign_reservation_table(%L, %L)$f$, resv, pg_temp.id('s2'))) = 'P0015');
  perform public.restaurant_assign_reservation_table(resv, pg_temp.id('b3'));
  insert into _wr values ('assigning a table marks it reserved and audits',
    (select table_id from public.reservations where id = resv) = pg_temp.id('b3')
    and (select status from public.tables where id = pg_temp.id('b3')) = 'reserved'
    and exists (select 1 from public.audit_logs where action = 'reservation.table_assigned' and entity_id = resv));
end $$;

select ok(ok, label) from _wr order by label;
select * from finish();
rollback;
