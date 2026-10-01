-- G2b / ADR-007 — aceite acima da lotação vira solicitação para a recepção.
-- Invariante 7 (nunca silencioso) e 8 (decisão auditada na mesma transação).
begin;
select plan(9);

create temp table _cap (k text primary key, v uuid);

create function pg_temp.act(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.id(p_key text) returns uuid language sql as $$
  select v from _cap where k = p_key;
$$;
create function pg_temp.state_of(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlstate;
end $$;
-- Convida e aceita; devolve o resultado do aceite.
create function pg_temp.invite_and_accept(p_guest text) returns jsonb language plpgsql as $$
declare inv jsonb;
begin
  perform pg_temp.act(pg_temp.id('host'));
  inv := public.customer_send_table_user_invite(pg_temp.id('sid'), 'cap-' || p_guest);
  insert into _cap values ('inv_' || p_guest, (inv->>'id')::uuid) on conflict (k) do update set v = excluded.v;
  perform pg_temp.act(pg_temp.id(p_guest));
  return public.customer_accept_table_user_invite((inv->>'id')::uuid);
end $$;

do $$
declare
  r uuid := 'c1000000-0000-4000-8000-000000000002';
  owner_id uuid := 'c1000000-0000-4000-8000-000000000001';
  other_r uuid;
  u record; t jsonb; visit jsonb;
begin
  for u in select * from (values ('host'), ('g1'), ('g2'), ('g3'), ('g4'), ('g5'), ('g6'),
                                 ('maitre'), ('waiter'), ('outsider')) x(name)
  loop
    insert into _cap values (u.name, gen_random_uuid());
    insert into auth.users(id, email) values (pg_temp.id(u.name), u.name || '@cap.test');
    insert into public.profiles(id) values (pg_temp.id(u.name)) on conflict do nothing;
    update public.profiles set username = 'cap-' || u.name where id = pg_temp.id(u.name);
  end loop;

  select id into other_r from public.restaurants where id <> r and is_active limit 1;
  insert into public.user_roles(user_id, restaurant_id, role) values
    (pg_temp.id('maitre'), r, 'maitre'),
    (pg_temp.id('waiter'), r, 'waiter');
  -- Gerente de OUTRO restaurante (quando o seed tiver um); sem papel em r de qualquer forma.
  if other_r is not null then
    insert into public.user_roles(user_id, restaurant_id, role) values (pg_temp.id('outsider'), other_r, 'manager');
  end if;

  update public.restaurant_model_configs
  set user_invite_enabled = true, enforce_table_capacity = true, capacity_request_ttl_min = 15,
      capacity_override_roles = array['maitre', 'manager']::public.user_roles_role_enum[]
  where restaurant_id = r;

  perform pg_temp.act(owner_id);
  t := public.restaurant_create_table(r, 'test-cap-1', 2);

  perform pg_temp.act(pg_temp.id('host'));
  visit := public.customer_open_table_session(t->>'qr_code');
  insert into _cap values ('sid', (visit->>'tableSessionId')::uuid), ('table', (t->>'id')::uuid);
  -- Acompanhante sem conta ocupa assento: host + acompanhante = 2 = lotação.
  perform public.customer_add_table_companion((visit->>'tableSessionId')::uuid, 'Vovó', false, null, null);
end $$;

-- 1. Estouro vira solicitação, nunca recusa muda nem aprovação automática.
do $$
declare res jsonb; req public.capacity_requests;
begin
  res := pg_temp.invite_and_accept('g1');
  assert res->>'status' = 'awaiting_capacity', 'aceite acima da lotação fica aguardando a recepção';
  assert not exists (select 1 from public.table_session_participants
                     where table_session_id = pg_temp.id('sid') and user_id = pg_temp.id('g1')),
    'não entra sem decisão';
  select * into req from public.capacity_requests where id = (res->>'capacityRequestId')::uuid;
  assert req.status = 'pending' and req.occupied_seats_at_request = 2 and req.capacity_at_request = 2,
    'solicitação registra ocupação (acompanhante conta) e lotação';
  assert req.expires_at between now() + interval '14 minutes' and now() + interval '16 minutes', 'TTL da configuração';
  assert exists (select 1 from public.audit_logs where action = 'capacity_request.created' and entity_id = req.id
                 and user_id = pg_temp.id('g1') and reason = 'lotacao_excedida'), 'criação auditada';
  insert into _cap values ('req_g1', req.id);

  res := public.customer_accept_table_user_invite(pg_temp.id('inv_g1'));
  assert res->>'status' = 'awaiting_capacity' and (res->>'idempotentReplay')::boolean, 'aceite repetido não cria outra solicitação';
  assert (select count(*) from public.capacity_requests where table_session_id = pg_temp.id('sid')) = 1, 'uma solicitação só';
  assert public.customer_list_incoming_table_invites() @> '[{"status":"awaiting_capacity"}]',
    'convidado vê que está aguardando';
end $$;
select pass('estouro vira solicitacao pendente e auditada');

-- 2. Quem vê e quem decide.
do $$
declare lst jsonb;
begin
  perform pg_temp.act(pg_temp.id('waiter'));
  lst := public.restaurant_list_capacity_requests('c1000000-0000-4000-8000-000000000002');
  assert lst @> jsonb_build_array(jsonb_build_object('id', pg_temp.id('req_g1'), 'canDecide', false)),
    'garçom vê sem poder decidir';
  assert pg_temp.state_of(format($f$select public.restaurant_resolve_capacity_request(%L, 'approve', 'cadeira_extra')$f$,
    pg_temp.id('req_g1'))) = '42501', 'garçom não decide';

  perform pg_temp.act(pg_temp.id('outsider'));
  assert pg_temp.state_of($f$select public.restaurant_list_capacity_requests('c1000000-0000-4000-8000-000000000002')$f$) = '42501',
    'equipe de outro restaurante não lista';
  assert pg_temp.state_of(format($f$select public.restaurant_resolve_capacity_request(%L, 'approve', 'cadeira_extra')$f$,
    pg_temp.id('req_g1'))) = '42501', 'equipe de outro restaurante não decide';

  perform pg_temp.act(pg_temp.id('g1'));
  assert pg_temp.state_of(format($f$select public.restaurant_resolve_capacity_request(%L, 'approve', 'cadeira_extra')$f$,
    pg_temp.id('req_g1'))) = '42501', 'convidado não se aprova';

  perform pg_temp.act(pg_temp.id('maitre'));
  lst := public.restaurant_list_capacity_requests('c1000000-0000-4000-8000-000000000002');
  assert lst @> jsonb_build_array(jsonb_build_object('id', pg_temp.id('req_g1'), 'canDecide', true,
    'requestedUser', jsonb_build_object('username', 'cap-g1'), 'invitedBy', jsonb_build_object('username', 'cap-host'))),
    'maitre vê e pode decidir, com quem pediu e quem convidou';
  assert pg_temp.state_of(format($f$select public.restaurant_resolve_capacity_request(%L, 'approve', 'recusado')$f$,
    pg_temp.id('req_g1'))) = '22023', 'aprovação exige motivo de aprovação';
  assert pg_temp.state_of(format($f$select public.restaurant_resolve_capacity_request(%L, 'approve', 'troca_de_mesa')$f$,
    pg_temp.id('req_g1'))) = '22023', 'troca de mesa fica para G2';
  assert pg_temp.state_of(format($f$select public.restaurant_resolve_capacity_request(%L, 'reject', 'cadeira_extra')$f$,
    pg_temp.id('req_g1'))) = '22023', 'recusa usa o motivo recusado';
end $$;
select pass('visibilidade e papeis de decisao lidos da configuracao');

-- 3. Aprovação.
do $$
declare res jsonb;
begin
  perform pg_temp.act(pg_temp.id('maitre'));
  res := public.restaurant_resolve_capacity_request(pg_temp.id('req_g1'), 'approve', 'cadeira_extra', ' cadeira da mesa 5 ');
  assert res->>'status' = 'approved', 'aprovada';
  assert exists (select 1 from public.table_session_participants
                 where table_session_id = pg_temp.id('sid') and user_id = pg_temp.id('g1')), 'convidado entra na mesa';
  assert (select status::text from public.table_session_user_invites where id = pg_temp.id('inv_g1')) = 'accepted',
    'convite aceito';
  assert exists (select 1 from public.audit_logs where action = 'capacity_request.approved'
                 and entity_id = pg_temp.id('req_g1') and user_id = pg_temp.id('maitre')
                 and reason = 'cadeira_extra: cadeira da mesa 5' and "before"->>'status' = 'pending'
                 and "after"->>'status' = 'approved'),
    'invariante 8: autor, motivo, antes/depois';
  assert exists (select 1 from public.notifications where user_id = pg_temp.id('g1') and title = 'Entrada liberada'),
    'convidado avisado';
  assert exists (select 1 from public.notifications where user_id = pg_temp.id('host')
                 and notification_type = 'table_invite_update'), 'quem convidou avisado';

  assert (public.restaurant_resolve_capacity_request(pg_temp.id('req_g1'), 'approve', 'cadeira_extra')->>'idempotentReplay')::boolean,
    'aprovar de novo é idempotente';
  assert pg_temp.state_of(format($f$select public.restaurant_resolve_capacity_request(%L, 'reject', 'recusado')$f$,
    pg_temp.id('req_g1'))) = '23514', 'decisão contrária depois de resolvida';

  perform pg_temp.act(pg_temp.id('g1'));
  assert (public.customer_get_active_visit()->>'tableSessionId')::uuid = pg_temp.id('sid'), 'visita ativa após aprovação';
end $$;
select pass('aprovacao: entra, auditoria, avisos, idempotencia');

-- 4. Recusa.
do $$
declare res jsonb; req uuid;
begin
  res := pg_temp.invite_and_accept('g2');
  assert res->>'status' = 'awaiting_capacity', 'mesa continua cheia';
  req := (res->>'capacityRequestId')::uuid;
  perform pg_temp.act(pg_temp.id('maitre'));
  res := public.restaurant_resolve_capacity_request(req, 'reject', 'recusado', 'sem cadeira');
  assert res->>'status' = 'rejected', 'recusada';
  assert (select status::text from public.table_session_user_invites where id = pg_temp.id('inv_g2')) = 'capacity_rejected',
    'convite recusado pela recepção (distinto de recusa do convidado)';
  assert not exists (select 1 from public.table_session_participants
                     where table_session_id = pg_temp.id('sid') and user_id = pg_temp.id('g2')), 'não entra';
  assert exists (select 1 from public.audit_logs where action = 'capacity_request.rejected' and entity_id = req
                 and reason = 'recusado: sem cadeira'), 'recusa auditada';
  assert exists (select 1 from public.notifications where user_id = pg_temp.id('g2') and title = 'Mesa sem lugar'),
    'convidado avisado da recusa';
end $$;
select pass('recusa pela recepcao');

-- 5. Convidado desiste enquanto espera.
do $$
declare res jsonb; req uuid;
begin
  res := pg_temp.invite_and_accept('g3');
  req := (res->>'capacityRequestId')::uuid;
  res := public.customer_decline_table_user_invite(pg_temp.id('inv_g3'));
  assert res->>'status' = 'declined', 'convidado desiste';
  assert (select status::text from public.capacity_requests where id = req) = 'cancelled', 'solicitação cancelada junto';
end $$;
select pass('desistencia cancela a solicitacao');

-- 6. TTL da solicitação.
do $$
declare res jsonb; req uuid;
begin
  res := pg_temp.invite_and_accept('g4');
  req := (res->>'capacityRequestId')::uuid;
  update public.capacity_requests set expires_at = now() - interval '1 minute' where id = req;
  perform pg_temp.act(pg_temp.id('maitre'));
  res := public.restaurant_resolve_capacity_request(req, 'approve', 'cadeira_extra');
  assert res->>'status' = 'expired', 'solicitação vencida não é aprovada';
  assert (select status::text || '/' || closed_reason from public.table_session_user_invites where id = pg_temp.id('inv_g4'))
    = 'expired/capacity_ttl', 'convite expira junto';
  assert not exists (select 1 from public.table_session_participants
                     where table_session_id = pg_temp.id('sid') and user_id = pg_temp.id('g4')), 'não entra';
end $$;
select pass('ttl da solicitacao');

-- 7. Lotação não imposta pela configuração.
do $$
declare res jsonb;
begin
  update public.restaurant_model_configs set enforce_table_capacity = false
  where restaurant_id = 'c1000000-0000-4000-8000-000000000002';
  res := pg_temp.invite_and_accept('g5');
  assert res->>'status' = 'accepted', 'sem imposição de lotação entra direto';
  update public.restaurant_model_configs set enforce_table_capacity = true
  where restaurant_id = 'c1000000-0000-4000-8000-000000000002';
end $$;
select pass('enforce_table_capacity desligado');

-- 8. Sessão encerrada com solicitação pendente.
do $$
declare res jsonb; req uuid;
begin
  res := pg_temp.invite_and_accept('g6');
  req := (res->>'capacityRequestId')::uuid;
  update public.table_sessions set status = 'ended', ended_at = now() where id = pg_temp.id('sid');
  assert (select status::text from public.capacity_requests where id = req) = 'expired', 'solicitação expira';
  assert (select status::text || '/' || closed_reason from public.table_session_user_invites where id = pg_temp.id('inv_g6'))
    = 'expired/session_closed', 'convite expira';
end $$;
select pass('sessao encerrada expira solicitacao');

-- 9. Capabilities expõem o recurso só para modelos com mesa.
do $$
declare
  r uuid := 'c1000000-0000-4000-8000-000000000002';
  m public.noowe_service_model;
  caps jsonb;
begin
  select service_models[1] into m from public.restaurant_model_configs where restaurant_id = r;
  caps := public.get_restaurant_model_capabilities(r, m);
  assert (caps->'capabilities'->>'userInvite')::boolean = (caps->'capabilities'->>'tableSession')::boolean,
    'userInvite acompanha modelos com mesa';
  assert caps->'capabilities' ? 'userInvite', 'chave userInvite presente';
  assert caps->'policies' ? 'userInviteTtlMin' and caps->'policies' ? 'userSearchMinChars'
    and caps->'policies' ? 'capacityRequestTtlMin', 'policies do convite presentes';
end $$;
select pass('capabilities expoem userInvite e policies');

select * from finish();
rollback;
