-- G4 / ADR-021 — encerramento manual: motivo obrigatório, auditoria na mesma transação, mesa liberada, cliente avisado.
begin;
select plan(1);
do $$
declare
  r uuid := 'c1000000-0000-4000-8000-000000000002';
  owner_id uuid := 'c1000000-0000-4000-8000-000000000001';
  a uuid := gen_random_uuid();
  t jsonb; sid uuid; tid uuid;
begin
  insert into auth.users(id,email) values (a,a||'@close.test');
  insert into public.profiles(id) values (a) on conflict do nothing;
  perform set_config('request.jwt.claims', jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
  t := public.restaurant_create_table(r, 'close-'||a, 4);
  perform set_config('request.jwt.claims', jsonb_build_object('sub',a,'role','authenticated')::text,true);
  sid := (public.customer_open_table_session(t->>'qr_code')->>'tableSessionId')::uuid;
  select table_id into tid from public.table_sessions where id = sid;

  perform set_config('request.jwt.claims', jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
  begin
    perform public.restaurant_close_table_session(sid, '   ');
    raise exception 'encerrou sem motivo';
  exception when sqlstate '22023' then null; end;
  assert (select status from public.table_sessions where id = sid) = 'active', 'sem motivo a sessão continua ativa';

  perform public.restaurant_close_table_session(sid, 'cliente pagou na maquininha');
  assert (select status from public.table_sessions where id = sid) = 'ended'
    and (select ended_at from public.table_sessions where id = sid) is not null, 'encerrada com ended_at';
  assert (select status from public.tables where id = tid) = 'cleaning', 'mesa vai para limpeza';
  assert exists (select 1 from public.audit_logs where action = 'table_session.closed_manual'
    and entity_id = sid and reason = 'cliente pagou na maquininha'), 'auditoria com motivo';
  assert exists (select 1 from public.notifications n where n.user_id = a
    and n.notification_type::text = 'table_session_closed' and n.related_id = sid), 'cliente é avisado';

  -- Abrir pela equipe não derruba sessão alheia.
  perform public.restaurant_open_table_session(tid, 'Walk-in', 2);
  begin
    perform public.restaurant_open_table_session(tid, 'Outro', 2);
    raise exception 'abriu por cima de sessão ativa';
  exception when sqlstate '23505' then null; end;
end $$;
select pass('encerramento manual: motivo, auditoria, mesa e aviso; staff não derruba sessão ativa');
select * from finish();
rollback;
