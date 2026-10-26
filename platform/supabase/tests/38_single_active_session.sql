-- G4 / ADR-021 — uma comanda ativa por cliente.
-- QR de outra mesa, fila e convite são recusados com P0016; reescanear a mesma mesa devolve a mesma sessão.
begin;
select plan(1);
do $$
declare
  r uuid := 'c1000000-0000-4000-8000-000000000002';
  owner_id uuid := 'c1000000-0000-4000-8000-000000000001';
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
  t1 jsonb; t2 jsonb; visit jsonb; sid uuid; sid2 uuid; menu uuid; o uuid; st text;
begin
  insert into auth.users(id,email) values (a,a||'@single.test'),(b,b||'@single.test');
  insert into public.profiles(id) values (a),(b) on conflict do nothing;
  create or replace function private.restaurant_is_open_now(p_restaurant_id uuid)
  returns boolean language sql as $f$ select true $f$;
  update public.restaurants set is_active = true, service_type = 'casual_dining',
    settings = coalesce(settings, '{}'::jsonb) #- '{customer_experience}',
    service_config = coalesce(service_config, '{}'::jsonb) #- '{feature_overrides}' where id = r;
  select id into menu from public.menu_items where restaurant_id = r limit 1;

  perform set_config('request.jwt.claims', jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
  t1 := public.restaurant_create_table(r, 'single-'||a, 4);
  t2 := public.restaurant_create_table(r, 'single-'||b, 4);

  -- 1. Reescanear a MESMA mesa devolve a mesma comanda.
  perform set_config('request.jwt.claims', jsonb_build_object('sub',a,'role','authenticated')::text,true);
  visit := public.customer_open_table_session(t1->>'qr_code');
  sid := (visit->>'tableSessionId')::uuid;
  assert (public.customer_open_table_session(t1->>'qr_code')->>'tableSessionId')::uuid = sid, 'mesma mesa devolve a mesma sessão';

  -- 2. QR de outra mesa é recusado, mesmo sem consumo, e o cliente continua na primeira.
  begin
    perform public.customer_open_table_session(t2->>'qr_code');
    raise exception 'QR de outra mesa foi aceito com comanda ativa';
  exception when sqlstate 'P0016' then null; end;
  assert exists (select 1 from public.table_session_participants where table_session_id = sid and user_id = a),
    'continua na comanda original';
  assert not exists (select 1 from public.table_sessions s join public.tables t on t.id = s.table_id
    where t.table_number = 'single-'||b and s.status = 'active'), 'a outra mesa não abriu';

  -- 3. Fila: bloqueada com comanda ativa.
  begin
    perform public.customer_join_waitlist(r, 2, 'qualquer', false);
    raise exception 'fila aceita com comanda ativa';
  exception when sqlstate 'P0016' then null; end;

  -- 4. Convite por link/código: bloqueado quando já há comanda em outra mesa.
  perform set_config('request.jwt.claims', jsonb_build_object('sub',b,'role','authenticated')::text,true);
  sid2 := (public.customer_open_table_session(t2->>'qr_code')->>'tableSessionId')::uuid;
  perform set_config('request.jwt.claims', jsonb_build_object('sub',a,'role','authenticated')::text,true);
  begin
    perform private.assert_single_active_session(a, (select table_id from public.table_sessions where id = sid2));
    raise exception 'assert não bloqueou';
  exception when sqlstate 'P0016' then null; end;

  -- 5. Sem consumo, ele sai e a porta reabre.
  perform public.customer_leave_table_session(sid);
  perform set_config('request.jwt.claims', jsonb_build_object('sub',a,'role','authenticated')::text,true);
  assert (public.customer_join_waitlist(r, 2, 'qualquer', false)).id is not null, 'sem comanda ativa a fila volta a aceitar';

  -- 6. Nenhuma sessão é encerrada por inatividade ao escanear.
  update public.table_sessions set last_activity = now() - interval '48 hours' where id = sid2;
  perform set_config('request.jwt.claims', jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub',a,'role','authenticated')::text,true);
  delete from public.waitlist_entries where customer_id = a;
  begin
    perform public.customer_open_table_session(t2->>'qr_code');
  exception when others then null; end;
  assert (select status from public.table_sessions where id = sid2) = 'active', 'comanda parada nunca encerra por tempo';
end $$;
select pass('uma comanda ativa por cliente: QR, fila e convite recusam (P0016); sem encerramento por tempo');
select * from finish();
rollback;
