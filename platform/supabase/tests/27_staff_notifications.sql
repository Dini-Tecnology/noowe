-- Aviso à equipe: garçom no check-in do Fine (senão maître/gerente) e quem decide sobre
-- lotação é avisado de cada solicitação nova. O Casual não avisa o garçom no check-in.
begin;
select plan(5);

create temp table _s (k text primary key, v uuid);
create temp table _sq (k text primary key, v text);
create temp table _sr (label text primary key, ok boolean not null);

create function pg_temp.act(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.id(p_key text) returns uuid language sql as $$ select v from _s where k = p_key; $$;
create function pg_temp.qr(p_key text) returns text language sql as $$ select v from _sq where k = p_key; $$;
create function pg_temp.notified(p_user text, p_type text, p_related uuid) returns integer language sql as $$
  select count(*)::integer from public.notifications n
   where n.user_id = pg_temp.id(p_user) and n.notification_type::text = p_type and n.related_id = p_related;
$$;

do $$
declare
  r uuid := 'c1000000-0000-4000-8000-000000000002';
  owner_id uuid := 'c1000000-0000-4000-8000-000000000001';
  u text; t jsonb; res jsonb; fa uuid; fb uuid; ca uuid; req uuid;
begin
  foreach u in array array['maitre','waiter','custa','custb','custc','custd'] loop
    insert into _s values (u, gen_random_uuid());
    insert into auth.users(id, email) values (pg_temp.id(u), u || '@staff-notif.test');
    insert into public.profiles(id) values (pg_temp.id(u)) on conflict do nothing;
  end loop;
  insert into public.user_roles(user_id, restaurant_id, role) values
    (pg_temp.id('maitre'), r, 'maitre'), (pg_temp.id('waiter'), r, 'waiter');

  update public.restaurants set opening_hours = (
    select jsonb_object_agg(d, jsonb_build_object('closed', false,
      'shifts', jsonb_build_array(jsonb_build_object('open', '00:00', 'close', '23:59'))))
    from unnest(array['sunday','monday','tuesday','wednesday','thursday','friday','saturday']) d
  ) where id = r;
  update public.restaurant_model_configs
  set service_models = array['fine_dining']::public.noowe_service_model[],
      queue_as_primary_entry = false,
      reservation_enabled = true, queue_enabled = true, enforce_table_capacity = true,
      capacity_override_roles = array['maitre','manager']::public.user_roles_role_enum[]
  where restaurant_id = r;

  perform pg_temp.act(owner_id);
  t := public.restaurant_create_table(r, 'sn-fa', 4); insert into _sq values ('fa', t->>'qr_code'); fa := (t->>'id')::uuid;
  t := public.restaurant_create_table(r, 'sn-fb', 4); insert into _sq values ('fb', t->>'qr_code'); fb := (t->>'id')::uuid;
  update public.tables set assigned_waiter_id = pg_temp.id('waiter') where id = fa;

  insert into public.reservations(restaurant_id, customer_id, reservation_time, party_size, status, service_model) values
    (r, pg_temp.id('custa'), now(), 2, 'confirmed', 'fine_dining'), (r, pg_temp.id('custb'), now(), 2, 'confirmed', 'fine_dining');

  -- 1. Fine, mesa com garçom atribuído: só o garçom é avisado.
  perform pg_temp.act(pg_temp.id('custa'));
  perform public.customer_check_in(pg_temp.qr('fa'), 'fine_dining', null);
  insert into _sr values ('fine check-in notifies the assigned waiter only',
    pg_temp.notified('waiter', 'staff_table_check_in', fa) = 1
    and pg_temp.notified('maitre', 'staff_table_check_in', fa) = 0);

  -- 2. Fine, mesa sem garçom: cai para maître/gerente.
  perform pg_temp.act(pg_temp.id('custb'));
  perform public.customer_check_in(pg_temp.qr('fb'), 'fine_dining', null);
  insert into _sr values ('fine check-in without a waiter falls back to the maitre',
    pg_temp.notified('maitre', 'staff_table_check_in', fb) = 1
    and pg_temp.notified('waiter', 'staff_table_check_in', fb) = 0);

  -- 3/4. Casual: grupo acima da mesa vira solicitação, e o maître é avisado; o garçom não.
  update public.restaurant_model_configs
  set service_models = array['casual_dining']::public.noowe_service_model[],
      queue_as_primary_entry = true
  where restaurant_id = r;
  perform pg_temp.act(owner_id);
  t := public.restaurant_create_table(r, 'sn-ca', 2); insert into _sq values ('ca', t->>'qr_code'); ca := (t->>'id')::uuid;
  t := public.restaurant_create_table(r, 'sn-cb', 4); insert into _sq values ('cb', t->>'qr_code');
  perform pg_temp.act(pg_temp.id('custc'));
  res := public.customer_check_in(pg_temp.qr('ca'), 'casual_dining', 5);
  req := (res->>'capacityRequestId')::uuid;
  insert into _sr values ('a new capacity request notifies who decides, not the waiter',
    res->>'status' = 'awaiting_capacity'
    and pg_temp.notified('maitre', 'capacity_request_pending', req) = 1
    and pg_temp.notified('waiter', 'capacity_request_pending', req) = 0);

  -- Renovar o mesmo pedido (upsert) não avisa de novo.
  res := public.customer_check_in(pg_temp.qr('ca'), 'casual_dining', 5);
  insert into _sr values ('renewing the same request does not notify again',
    pg_temp.notified('maitre', 'capacity_request_pending', req) = 1);

  -- 5. Casual abre normal e não gera aviso de check-in ao garçom.
  perform pg_temp.act(pg_temp.id('custd'));
  res := public.customer_check_in(pg_temp.qr('cb'), 'casual_dining', 2);
  insert into _sr values ('casual check-in does not notify staff',
    (res->>'tableSessionId') is not null
    and not exists (select 1 from public.notifications n where n.notification_type::text = 'staff_table_check_in'
      and n.related_id = (select id from public.tables where restaurant_id = r and table_number = 'sn-cb')));
end $$;

select ok(ok, label) from _sr order by label;
select * from finish();
rollback;
