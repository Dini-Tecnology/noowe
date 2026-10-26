-- G4 / ADR-021 — porta Reserva: check-in 5 min antes até a tolerância; depois a reserva expira.
begin;
select plan(1);
do $$
declare
  r uuid := 'c1000000-0000-4000-8000-000000000002';
  owner_id uuid := 'c1000000-0000-4000-8000-000000000001';
  a uuid := gen_random_uuid();
  t jsonb; tid uuid; res uuid; st text; v_lead integer; v_tol integer; w record;
begin
  insert into auth.users(id,email) values (a,a||'@resv.test');
  insert into public.profiles(id) values (a) on conflict do nothing;
  create or replace function private.restaurant_is_open_now(p_restaurant_id uuid)
  returns boolean language sql as $f$ select true $f$;
  insert into public.restaurant_model_configs(restaurant_id, service_models) values (r, '{casual_dining}') on conflict (restaurant_id) do nothing;
  update public.restaurant_model_configs set reservation_check_in_lead_min = 5, reservation_no_show_min = 15 where restaurant_id = r;

  perform set_config('request.jwt.claims', jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
  t := public.restaurant_create_table(r, 'resv-'||a, 4);

  -- Janela calculada a partir da configuração.
  select * into w from private.reservation_check_in_window(r, '2026-10-25 20:00+00');
  assert w.opens_at = '2026-10-25 19:55+00' and w.closes_at = '2026-10-25 20:15+00', 'janela: -5 min / +tolerância';

  -- 1. Antes da janela: check-in recusado.
  insert into public.reservations(restaurant_id, customer_id, reservation_time, party_size, status)
  values (r, a, now() + interval '2 hours', 2, 'confirmed') returning id into res;
  perform set_config('request.jwt.claims', jsonb_build_object('sub',a,'role','authenticated')::text,true);
  begin
    perform public.customer_reservation_check_in(res);
    raise exception 'check-in antes da janela foi aceito';
  exception when sqlstate 'P0001' then null; end;

  -- 2. Dentro da janela: registra a chegada.
  update public.reservations set reservation_time = now() + interval '3 minutes' where id = res;
  assert (public.customer_reservation_check_in(res)->>'reservationId')::uuid = res, 'check-in dentro da janela';
  assert (select checked_in_at from public.reservations where id = res) is not null, 'chegada registrada';

  -- 3. Passada a tolerância: a leitura expira a reserva (no_show).
  update public.reservations set reservation_time = now() - interval '20 minutes', checked_in_at = null where id = res;
  assert jsonb_array_length(public.customer_list_reservations()) >= 1, 'lista devolve as reservas';
  assert (select status::text from public.reservations where id = res) = 'no_show', 'expira depois da tolerância';

  -- 4. Reserva expirada não faz check-in.
  begin
    perform public.customer_reservation_check_in(res);
    raise exception 'check-in de reserva expirada foi aceito';
  exception when sqlstate 'P0001' then null; end;

  -- 5. Com comanda ativa em outra mesa, o check-in também é recusado.
  insert into public.reservations(restaurant_id, customer_id, reservation_time, party_size, status)
  values (r, a, now() + interval '1 minute', 2, 'confirmed') returning id into res;
  perform public.customer_open_table_session(t->>'qr_code');
  begin
    perform public.customer_reservation_check_in(res);
    raise exception 'check-in aceito com comanda ativa';
  exception when sqlstate 'P0016' then null; end;
end $$;
select pass('reserva: janela de check-in, expiração preguiçosa e uma comanda por cliente');
select * from finish();
rollback;
