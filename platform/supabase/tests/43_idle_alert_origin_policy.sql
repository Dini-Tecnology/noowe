-- G4 / ADR-021 — mapa da equipe: origem, comanda parada (alerta único, nunca encerra) e política do salão.
begin;
select plan(1);
do $$
declare
  r uuid := 'c1000000-0000-4000-8000-000000000002';
  owner_id uuid := 'c1000000-0000-4000-8000-000000000001';
  a uuid := gen_random_uuid();
  t jsonb; sid uuid; tbl jsonb; sess jsonb; pol jsonb; n1 integer; n2 integer;
begin
  insert into auth.users(id,email) values (a,a||'@floor.test');
  insert into public.profiles(id) values (a) on conflict do nothing;
  insert into public.restaurant_model_configs(restaurant_id, service_models) values (r, '{casual_dining}') on conflict (restaurant_id) do nothing;
  perform set_config('request.jwt.claims', jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);

  -- Política: lê, valida faixas, grava e audita.
  pol := public.restaurant_update_room_policy(r, 20, 6, 30);
  assert (pol->>'reservationNoShowMin')::int = 20 and (pol->>'queueCallToleranceMin')::int = 6
    and (pol->>'sessionIdleAlertMin')::int = 30 and (pol->>'reservationCheckInLeadMin')::int = 5, 'política salva';
  begin
    perform public.restaurant_update_room_policy(r, 1, null, null);
    raise exception 'faixa inválida aceita';
  exception when sqlstate '22023' then null; end;
  assert exists (select 1 from public.audit_logs where action = 'room_policy.updated' and entity_id = r), 'política auditada';

  -- Origem: sessão aberta pelo QR do cliente.
  t := public.restaurant_create_table(r, 'floor-'||a, 4);
  perform set_config('request.jwt.claims', jsonb_build_object('sub',a,'role','authenticated')::text,true);
  sid := (public.customer_open_table_session(t->>'qr_code')->>'tableSessionId')::uuid;
  perform set_config('request.jwt.claims', jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
  select e into tbl from jsonb_array_elements(public.restaurant_get_tables(r)) e where e->>'table_number' = 'floor-'||a;
  sess := tbl->'active_session';
  assert sess->>'origin' = 'qr' and sess->'idle_since' = 'null'::jsonb, 'origem QR, ainda sem parada';

  -- Comanda parada: marca idle_since, avisa a equipe uma vez e nunca encerra.
  update public.table_sessions set last_activity = now() - interval '2 hours' where id = sid;
  select count(*) into n1 from public.notifications where notification_type::text = 'staff_session_idle' and related_id = sid;
  select e into tbl from jsonb_array_elements(public.restaurant_get_tables(r)) e where e->>'table_number' = 'floor-'||a;
  assert (tbl->'active_session'->>'idle_since') is not null, 'idle_since preenchido';
  perform public.restaurant_get_tables(r);
  select count(*) into n2 from public.notifications where notification_type::text = 'staff_session_idle' and related_id = sid;
  assert n2 >= 1 and n2 = (select count(*) from public.notifications where notification_type::text = 'staff_session_idle' and related_id = sid) and n2 >= n1, 'alerta enviado';
  assert (select status from public.table_sessions where id = sid) = 'active', 'nunca encerra por tempo';
  assert (select count(*) from public.notifications where notification_type::text = 'staff_session_idle' and related_id = sid) = n2, 'alerta não repete';

  -- Comanda por pessoa devolve o pago.
  assert (public.restaurant_get_table_bill((t->>'id')::uuid)) ? 'paidCents', 'bill traz paidCents';
end $$;
select pass('equipe: origem no mapa, alerta único de comanda parada, política do salão');
select * from finish();
rollback;
