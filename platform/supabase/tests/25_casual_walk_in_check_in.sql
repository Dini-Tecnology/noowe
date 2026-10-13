-- ADR-016 — Casual Dining abre a mesa pelo QR sem reserva; Fine continua exigindo.
-- Invariantes 3 (uma sessão por mesa), 7 (estouro nunca silencioso), 8 (rastro).
begin;
select plan(11);

create temp table _w (k text primary key, v uuid);
create temp table _res (label text primary key, ok boolean not null);
create temp table _qr (k text primary key, v text);

create function pg_temp.act(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.id(p_key text) returns uuid language sql as $$ select v from _w where k = p_key; $$;

do $$
declare
  r uuid := 'c1000000-0000-4000-8000-000000000002';
  owner_id uuid := 'c1000000-0000-4000-8000-000000000001';
  u text; t jsonb; res jsonb; sid uuid; req uuid; again jsonb;
begin
  foreach u in array array['host','mate','late','big','wait','queued'] loop
    insert into _w values (u, gen_random_uuid());
    insert into auth.users(id, email) values (pg_temp.id(u), u || '@walkin.test');
    insert into public.profiles(id) values (pg_temp.id(u)) on conflict do nothing;
  end loop;

  update public.restaurants set opening_hours = (
    select jsonb_object_agg(d, jsonb_build_object('closed', false,
      'shifts', jsonb_build_array(jsonb_build_object('open', '00:00', 'close', '23:59'))))
    from unnest(array['sunday','monday','tuesday','wednesday','thursday','friday','saturday']) d
  ) where id = r;
  update public.restaurant_model_configs
  set service_models = array['fine_dining','casual_dining']::public.noowe_service_model[],
      reservation_enabled = true, queue_enabled = true, enforce_table_capacity = true,
      capacity_request_ttl_min = 15
  where restaurant_id = r;
  delete from public.waitlist_entries where restaurant_id = r and status = 'waiting';

  perform pg_temp.act(owner_id);
  t := public.restaurant_create_table(r, 'walkin-a', 4);
  insert into _qr values ('a', t->>'qr_code');
  t := public.restaurant_create_table(r, 'walkin-b', 2);
  insert into _qr values ('b', t->>'qr_code');
  t := public.restaurant_create_table(r, 'walkin-c', 4);
  insert into _qr values ('c', t->>'qr_code');
  insert into _w values ('table_a', (select id from public.tables where restaurant_id = r and table_number = 'walkin-a'));

  -- 1. Casual sem reserva/fila, grupo cabe: abre; o primeiro vira host.
  perform pg_temp.act(pg_temp.id('host'));
  res := public.customer_check_in((select v from _qr where k = 'a'), 'casual_dining', 2);
  sid := (res->>'tableSessionId')::uuid;
  insert into _res values ('casual opens without booking and host is first scanner',
    sid is not null and exists (select 1 from public.table_session_participants
      where table_session_id = sid and user_id = pg_temp.id('host') and is_host));
  insert into _res values ('declared party size is stored',
    (select declared_party_size from public.table_sessions where id = sid) = 2);

  -- 2. Segundo scan entra na MESMA sessão.
  perform pg_temp.act(pg_temp.id('mate'));
  res := public.customer_check_in((select v from _qr where k = 'a'), 'casual_dining', 2);
  insert into _res values ('second scanner joins the existing session',
    (res->>'tableSessionId')::uuid = sid
    and (select count(*) from public.table_sessions where table_id = pg_temp.id('table_a') and status = 'active') = 1);

  -- 3. Fine sem reserva continua barrado.
  perform pg_temp.act(pg_temp.id('late'));
  begin
    perform public.customer_check_in((select v from _qr where k = 'c'), 'fine_dining', 2);
    insert into _res values ('fine dining without booking is still rejected', false);
  exception when sqlstate 'P0005' then
    insert into _res values ('fine dining without booking is still rejected', true);
  end;

  -- 4. Grupo maior que a mesa vira solicitação de abertura; a mesa não abre.
  perform pg_temp.act(pg_temp.id('big'));
  res := public.customer_check_in((select v from _qr where k = 'b'), 'casual_dining', 5);
  req := (res->>'capacityRequestId')::uuid;
  insert into _w values ('req_big', req);
  insert into _res values ('party above seats becomes a pending open request',
    res->>'status' = 'awaiting_capacity' and res->>'requestKind' = 'open' and res->>'reason' = 'capacity'
    and not exists (select 1 from public.table_sessions s join public.tables tb on tb.id = s.table_id
      where tb.restaurant_id = r and tb.table_number = 'walkin-b' and s.status = 'active')
    and exists (select 1 from public.audit_logs where action = 'capacity_request.created' and entity_id = req));

  -- 5. O maître libera; o cliente abre a mesa e a liberação é de uso único.
  perform pg_temp.act(owner_id);
  perform public.restaurant_resolve_capacity_request(req, 'approve', 'cadeira_extra');
  insert into _res values ('approving an open request notifies the customer',
    exists (select 1 from public.notifications n where n.user_id = pg_temp.id('big')
      and n.notification_type::text = 'table_open_approved' and n.related_id = req));
  perform pg_temp.act(pg_temp.id('big'));
  res := public.customer_check_in_approved(req);
  insert into _res values ('approved open request opens the table and is audited',
    (res->>'tableSessionId') is not null
    and exists (select 1 from public.audit_logs where action = 'capacity_request.approved' and entity_id = req)
    and (select declared_party_size from public.table_sessions where id = (res->>'tableSessionId')::uuid) = 5);
  begin
    perform public.customer_check_in_approved(req);
    insert into _res values ('approval is single use', false);
  exception when sqlstate '23514' then
    insert into _res values ('approval is single use', true);
  end;

  -- 6. Fila ativa: walk-in sem entrada vira solicitação; quem foi chamado passa.
  insert into public.waitlist_entries(restaurant_id, customer_id, party_size, status, customer_name, position)
  values (r, pg_temp.id('queued'), 2, 'waiting', 'Fila', 1);
  perform pg_temp.act(pg_temp.id('wait'));
  res := public.customer_check_in((select v from _qr where k = 'c'), 'casual_dining', 2);
  insert into _res values ('active queue turns a walk-in opening into a maitre request',
    res->>'status' = 'awaiting_capacity' and res->>'reason' = 'queue_active');

  -- 7. Recusa do maître: grava a decisão e avisa o cliente.
  perform pg_temp.act(owner_id);
  perform public.restaurant_resolve_capacity_request((res->>'capacityRequestId')::uuid, 'reject', 'recusado');
  insert into _res values ('rejecting an open request notifies the customer',
    exists (select 1 from public.notifications n where n.user_id = pg_temp.id('wait')
      and n.notification_type::text = 'table_open_update' and n.related_id = (res->>'capacityRequestId')::uuid)
    and exists (select 1 from public.audit_logs where action = 'capacity_request.rejected'
      and entity_id = (res->>'capacityRequestId')::uuid));
  insert into _res values ('notification enums have the new labels',
    (select count(*) from pg_enum e join pg_type t on t.oid = e.enumtypid
      where (t.typname = 'notifications_notification_type_enum'
             and e.enumlabel in ('table_open_approved','table_open_update','table_moved','staff_table_check_in','capacity_request_pending'))
         or (t.typname = 'notifications_related_type_enum' and e.enumlabel in ('capacity_request','table'))) = 7);
end $$;

select ok(ok, label) from _res order by label;
select * from finish();
rollback;
