-- Horário de funcionamento com turnos (20260930140000):
--  * opening_hours é a única fonte lida por cliente/servidor; business_hours antigo é convertido;
--  * horário fora de HH:MM 24h e turnos sobrepostos são recusados no servidor;
--  * o status considera intervalo entre turnos e turno que passa da meia-noite;
--  * o check-in real de mesa é bloqueado com o restaurante fechado (P0010);
--    o atalho de mesa de teste continua funcionando.
begin;
select plan(16);

create temp table hours_results(label text primary key, ok boolean not null);

do $$
declare
  r uuid := 'c1000000-0000-4000-8000-000000000002';
  owner_id uuid := 'c1000000-0000-4000-8000-000000000001';
  customer_id uuid := gen_random_uuid();
  two_shifts constant jsonb := '{"monday":{"closed":false,"shifts":[{"open":"11:00","close":"14:00"},{"open":"19:00","close":"23:00"}]}}';
  crosses constant jsonb := '{"sunday":{"closed":false,"shifts":[{"open":"19:00","close":"02:00"}]}}';
  stored jsonb;
  picked jsonb;
  model public.noowe_service_model;
  visit jsonb;
begin
  -- 2026-09-28 é segunda-feira.
  insert into hours_results values ('aberto no primeiro turno',
    (private.opening_hours_status(two_shifts, '2026-09-28 12:00')->>'isOpen')::boolean
    and private.opening_hours_status(two_shifts, '2026-09-28 12:00')->>'closesAt' = '14:00');
  insert into hours_results values ('fechado no intervalo entre turnos, com a próxima abertura',
    not (private.opening_hours_status(two_shifts, '2026-09-28 16:00')->>'isOpen')::boolean
    and private.opening_hours_status(two_shifts, '2026-09-28 16:00')->>'opensAt' = '19:00');
  insert into hours_results values ('aberto no segundo turno',
    (private.opening_hours_status(two_shifts, '2026-09-28 20:00')->>'isOpen')::boolean);
  insert into hours_results values ('fechado depois do último turno',
    not (private.opening_hours_status(two_shifts, '2026-09-28 23:30')->>'isOpen')::boolean);
  insert into hours_results values ('turno de ontem que passa da meia-noite segue aberto',
    (private.opening_hours_status(crosses, '2026-09-28 01:00')->>'isOpen')::boolean
    and private.opening_hours_status(crosses, '2026-09-28 01:00')->>'closesAt' = '02:00');
  insert into hours_results values ('domingo marcado fechado fica fechado',
    not (private.opening_hours_status('{"sunday":{"closed":true,"shifts":[]}}', '2026-09-27 15:00')->>'isOpen')::boolean);
  insert into hours_results values ('formato antigo {open, close} continua sendo lido',
    (private.opening_hours_status('{"sunday":{"open":"12:00","close":"22:00"}}', '2026-09-27 15:00')->>'isOpen')::boolean);

  -- Trigger: o app antigo só grava business_hours (dias em português).
  perform set_config('request.jwt.claims', jsonb_build_object('sub', owner_id, 'role', 'authenticated')::text, true);
  perform public.restaurant_update_profile(r, jsonb_build_object('business_hours', jsonb_build_array(
    jsonb_build_object('day', 'Domingo', 'open', true, 'start', '15:00', 'end', '22:00'),
    jsonb_build_object('day', 'Segunda', 'open', false, 'start', '11:00', 'end', '23:00'))));
  select opening_hours into stored from public.restaurants where id = r;
  insert into hours_results values ('business_hours é convertido para opening_hours',
    stored #>> '{sunday,shifts,0,open}' = '15:00' and stored #>> '{sunday,shifts,0,close}' = '22:00'
    and (stored #>> '{monday,closed}')::boolean);

  -- Turnos novos gravados direto em opening_hours.
  perform public.restaurant_update_profile(r, jsonb_build_object('opening_hours', two_shifts));
  select opening_hours into stored from public.restaurants where id = r;
  insert into hours_results values ('dois turnos no mesmo dia são gravados',
    jsonb_array_length(stored #> '{monday,shifts}') = 2);

  begin
    perform public.restaurant_update_profile(r, jsonb_build_object('opening_hours',
      '{"monday":{"closed":false,"shifts":[{"open":"6700","close":"23:00"}]}}'::jsonb));
    insert into hours_results values ('horário 6700 é recusado', false);
  exception when sqlstate '22023' then
    insert into hours_results values ('horário 6700 é recusado', true);
  end;
  begin
    perform public.restaurant_update_profile(r, jsonb_build_object('opening_hours',
      '{"monday":{"closed":false,"shifts":[{"open":"11:00","close":"15:00"},{"open":"14:00","close":"23:00"}]}}'::jsonb));
    insert into hours_results values ('turnos sobrepostos são recusados', false);
  exception when sqlstate '22023' then
    insert into hours_results values ('turnos sobrepostos são recusados', true);
  end;
  begin
    perform public.restaurant_update_profile(r, jsonb_build_object('business_hours', jsonb_build_array(
      jsonb_build_object('day', 'Domingo', 'open', true, 'start', '25:00', 'end', '22:00'))));
    insert into hours_results values ('app antigo com hora inválida também é recusado', false);
  exception when sqlstate '22023' then
    insert into hours_results values ('app antigo com hora inválida também é recusado', true);
  end;

  -- Check-in de mesa com o restaurante fechado.
  insert into auth.users(id, email) values (customer_id, customer_id || '@opening-hours.test');
  insert into public.profiles(id) values (customer_id) on conflict do nothing;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', owner_id, 'role', 'authenticated')::text, true);
  perform public.restaurant_create_table(r, 'hours-' || customer_id, 4);
  update private.dev_flags set enabled = true, updated_at = now() where key = 'simulate_table_scan';
  update public.restaurants set opening_hours = '{"sunday":{"closed":true,"shifts":[]},"monday":{"closed":true,"shifts":[]},"tuesday":{"closed":true,"shifts":[]},"wednesday":{"closed":true,"shifts":[]},"thursday":{"closed":true,"shifts":[]},"friday":{"closed":true,"shifts":[]},"saturday":{"closed":true,"shifts":[]}}'
    where id = r;

  perform set_config('request.jwt.claims', jsonb_build_object('sub', customer_id, 'role', 'authenticated')::text, true);
  picked := public.customer_dev_pick_table_qr(r);
  model := (public.customer_resolve_service_qr(picked->>'qrCodeData')->>'serviceModel')::public.noowe_service_model;

  begin
    perform public.customer_check_in(picked->>'qrCodeData', model);
    insert into hours_results values ('check-in real com restaurante fechado é bloqueado', false);
  exception when sqlstate 'P0010' then
    insert into hours_results values ('check-in real com restaurante fechado é bloqueado', true);
  end;

  visit := public.customer_dev_check_in(picked->>'qrCodeData', model);
  insert into hours_results values ('atalho de mesa de teste não é bloqueado pelo horário',
    (visit->>'tableSessionId') is not null);

  insert into hours_results values ('status ao vivo do restaurante fechado devolve isOpen falso',
    not (private.restaurant_live_status(r)->>'isOpen')::boolean);
  insert into hours_results values ('entrar na fila continua bloqueado com restaurante fechado',
    not private.restaurant_is_open_now(r));
end $$;

select ok(ok, label) from hours_results order by label;
select * from finish();
rollback;
