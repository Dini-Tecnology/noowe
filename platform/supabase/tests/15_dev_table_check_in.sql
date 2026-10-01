-- The "Mesa teste" shortcut must skip only the reservation/waitlist gate, only
-- while private.dev_flags.simulate_table_scan is on, and never loosen the real
-- customer_check_in.
begin;
select plan(4);

create temp table dev_check_in_results(label text primary key, ok boolean not null);

do $$
declare
  r uuid := 'c1000000-0000-4000-8000-000000000002';
  owner_id uuid := 'c1000000-0000-4000-8000-000000000001';
  customer_id uuid := gen_random_uuid();
  picked jsonb;
  resolved jsonb;
  model public.noowe_service_model;
  visit jsonb;
begin
  insert into auth.users(id, email) values (customer_id, customer_id || '@dev-check-in.test');
  insert into public.profiles(id) values (customer_id) on conflict do nothing;

  perform set_config('request.jwt.claims', jsonb_build_object('sub', owner_id, 'role', 'authenticated')::text, true);
  perform public.restaurant_create_table(r, 'dev-check-in-' || customer_id, 4);

  update private.dev_flags set enabled = true, updated_at = now() where key = 'simulate_table_scan';

  -- O check-in real só abre com o restaurante aberto; aqui o foco é a exigência de reserva.
  update public.restaurants set opening_hours = (
    select jsonb_object_agg(d, jsonb_build_object('closed', false,
      'shifts', jsonb_build_array(jsonb_build_object('open', '00:00', 'close', '23:59'))))
    from unnest(array['sunday','monday','tuesday','wednesday','thursday','friday','saturday']) d
  ) where id = r;

  perform set_config('request.jwt.claims', jsonb_build_object('sub', customer_id, 'role', 'authenticated')::text, true);
  picked := public.customer_dev_pick_table_qr(r);
  resolved := public.customer_resolve_service_qr(picked->>'qrCodeData');
  model := (resolved->>'serviceModel')::public.noowe_service_model;

  begin
    perform public.customer_check_in(picked->>'qrCodeData', model);
    insert into dev_check_in_results values ('real check-in still requires a booking', false);
  exception when sqlstate 'P0005' then
    insert into dev_check_in_results values ('real check-in still requires a booking', true);
  end;

  update private.dev_flags set enabled = false, updated_at = now() where key = 'simulate_table_scan';
  begin
    perform public.customer_dev_check_in(picked->>'qrCodeData', model);
    insert into dev_check_in_results values ('dev check-in is gated by the flag', false);
  exception when sqlstate '42501' then
    insert into dev_check_in_results values ('dev check-in is gated by the flag', true);
  end;

  update private.dev_flags set enabled = true, updated_at = now() where key = 'simulate_table_scan';
  visit := public.customer_dev_check_in(picked->>'qrCodeData', model);
  insert into dev_check_in_results values (
    'dev check-in opens a comanda without a booking',
    (visit->>'tableSessionId') is not null and (visit->>'restaurantId')::uuid = r
  );
  insert into dev_check_in_results values (
    'dev check-in records the service model on the session',
    exists (
      select 1 from public.table_sessions s
      where s.id = (visit->>'tableSessionId')::uuid and s.service_model = model
    )
  );
end $$;

select ok(ok, label) from dev_check_in_results order by label;
select * from finish();
rollback;
