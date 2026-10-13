-- Fine Dining no QR (regra de produto de 2026-10-13, complementa o ADR-016):
-- grupo da reserva/fila (sem pergunta), grupo maior que a mesa barrado (P0011),
-- convidado aceito da reserva entra na sessão do titular, e QR de mesa em restaurante
-- só de retirada recusado com motivo próprio (P0012).
begin;
select plan(6);

create temp table _f (k text primary key, v uuid);
create temp table _fq (k text primary key, v text);
create temp table _fr (label text primary key, ok boolean not null);

create function pg_temp.act(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.id(p_key text) returns uuid language sql as $$ select v from _f where k = p_key; $$;
create function pg_temp.qr(p_key text) returns text language sql as $$ select v from _fq where k = p_key; $$;

do $$
declare
  r uuid := 'c1000000-0000-4000-8000-000000000002';
  owner_id uuid := 'c1000000-0000-4000-8000-000000000001';
  u text; t jsonb; res jsonb; sid uuid; resv uuid;
begin
  foreach u in array array['host','guest','big','solo'] loop
    insert into _f values (u, gen_random_uuid());
    insert into auth.users(id, email) values (pg_temp.id(u), u || '@fine-qr.test');
    insert into public.profiles(id) values (pg_temp.id(u)) on conflict do nothing;
  end loop;

  update public.restaurants set opening_hours = (
    select jsonb_object_agg(d, jsonb_build_object('closed', false,
      'shifts', jsonb_build_array(jsonb_build_object('open', '00:00', 'close', '23:59'))))
    from unnest(array['sunday','monday','tuesday','wednesday','thursday','friday','saturday']) d
  ) where id = r;
  -- O modelo que o resolve devolve vem de restaurants.service_type: aqui o restaurante é Fine de verdade.
  update public.restaurants set service_type = 'fine_dining' where id = r;
  update public.restaurant_model_configs
  set service_models = array['fine_dining']::public.noowe_service_model[],
      queue_as_primary_entry = false,
      reservation_enabled = true, queue_enabled = true, enforce_table_capacity = true
  where restaurant_id = r;

  perform pg_temp.act(owner_id);
  t := public.restaurant_create_table(r, 'fine-a', 4);
  insert into _fq values ('a', t->>'qr_code');
  t := public.restaurant_create_table(r, 'fine-b', 4);
  insert into _fq values ('b', t->>'qr_code');

  -- 1. Titular com reserva de 3: o grupo vem da reserva, não do que o app mandar.
  insert into public.reservations(restaurant_id, customer_id, reservation_time, party_size, status, service_model)
  values (r, pg_temp.id('host'), now(), 3, 'confirmed', 'fine_dining') returning id into resv;
  insert into public.reservation_guests(reservation_id, guest_user_id, status, is_host, invited_at, has_arrived)
  values (resv, pg_temp.id('guest'), 'accepted', false, now(), false);

  insert into _fr values ('resolve tells the app not to ask party size in fine dining',
    (public.customer_resolve_service_qr(pg_temp.qr('a'))->>'asksPartySize')::boolean = false);

  perform pg_temp.act(pg_temp.id('host'));
  res := public.customer_check_in(pg_temp.qr('a'), 'fine_dining', 9);
  sid := (res->>'tableSessionId')::uuid;
  insert into _fr values ('fine party size comes from the reservation',
    sid is not null and (select declared_party_size from public.table_sessions where id = sid) = 3);

  -- 2. Convidado aceito da reserva entra na mesma sessão (o titular já fez check-in: reserva seated).
  perform pg_temp.act(pg_temp.id('guest'));
  res := public.customer_check_in(pg_temp.qr('a'), 'fine_dining', null);
  insert into _fr values ('accepted reservation guest joins the host session',
    (res->>'tableSessionId')::uuid = sid);

  -- 3. Sem reserva nem fila: continua barrado.
  perform pg_temp.act(pg_temp.id('solo'));
  begin
    perform public.customer_check_in(pg_temp.qr('b'), 'fine_dining', 2);
    insert into _fr values ('fine walk-in is still rejected', false);
  exception when sqlstate 'P0005' then
    insert into _fr values ('fine walk-in is still rejected', true);
  end;

  -- 4. Reserva maior que a mesa: barrado até a recepção ajustar, sem solicitação de cadeira extra.
  insert into public.reservations(restaurant_id, customer_id, reservation_time, party_size, status, service_model)
  values (r, pg_temp.id('big'), now(), 6, 'confirmed', 'fine_dining');
  perform pg_temp.act(pg_temp.id('big'));
  begin
    perform public.customer_check_in(pg_temp.qr('b'), 'fine_dining', 2);
    insert into _fr values ('fine group above seats needs the table adjusted first', false);
  exception when sqlstate 'P0011' then
    insert into _fr values ('fine group above seats needs the table adjusted first',
      not exists (select 1 from public.capacity_requests where requested_user_id = pg_temp.id('big')));
  end;

  -- 5. Restaurante só de retirada: QR de mesa recusado com motivo próprio.
  update public.restaurant_model_configs
  set service_models = array['quick_service']::public.noowe_service_model[]
  where restaurant_id = r;
  begin
    perform public.customer_resolve_service_qr(pg_temp.qr('b'));
    insert into _fr values ('table qr of a pickup-only restaurant is refused', false);
  exception when sqlstate 'P0012' then
    insert into _fr values ('table qr of a pickup-only restaurant is refused', true);
  end;
end $$;

select ok(ok, label) from _fr order by label;
select * from finish();
rollback;
