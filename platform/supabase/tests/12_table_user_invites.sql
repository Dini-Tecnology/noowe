-- G2b / ADR-011 — convite para a mesa por @username, com aceite.
-- Cenários de quem convida e de quem recebe, contra as RPCs reais.
begin;
select plan(10);

create temp table _g2b (k text primary key, v uuid);

-- Troca o usuário "logado" (só a claim; o papel continua postgres para os fixtures).
create function pg_temp.act(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.id(p_key text) returns uuid language sql as $$
  select v from _g2b where k = p_key;
$$;
-- Executa um comando e devolve o SQLSTATE levantado (ou 'ok').
create function pg_temp.state_of(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlstate;
end $$;

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
do $$
declare
  r uuid := 'c1000000-0000-4000-8000-000000000002';
  owner_id uuid := 'c1000000-0000-4000-8000-000000000001';
  u record;
  t1 jsonb; t2 jsonb; visit jsonb;
begin
  for u in select * from (values
    ('ana'), ('beto'), ('bia'), ('caio'), ('dan'), ('eva'), ('fabio'), ('gil')) x(name)
  loop
    insert into _g2b values (u.name, gen_random_uuid());
    insert into auth.users(id, email) values (pg_temp.id(u.name), u.name || '@g2b.test');
    insert into public.profiles(id) values (pg_temp.id(u.name)) on conflict do nothing;
    update public.profiles set username = 'g2b-' || u.name, full_name = initcap(u.name) || ' Teste'
    where id = pg_temp.id(u.name);
  end loop;
  -- eva: conta inativa; fabio: sem papel customer (não aparecem na busca).
  update public.profiles set is_active = false where id = pg_temp.id('eva');
  delete from public.profile_roles where user_id = pg_temp.id('fabio');

  update public.restaurant_model_configs
  set user_invite_enabled = true, enforce_table_capacity = true,
      user_invite_redecline_cooldown_min = 60, user_search_min_chars = 3, user_search_limit = 10,
      user_invite_max_pending_per_session = 10, user_invite_max_per_inviter_hour = 20
  where restaurant_id = r;

  perform pg_temp.act(owner_id);
  t1 := public.restaurant_create_table(r, 'test-g2b-1', 6);
  t2 := public.restaurant_create_table(r, 'test-g2b-2', 4);
  insert into _g2b values ('t1', (t1->>'id')::uuid), ('t2', (t2->>'id')::uuid);

  perform pg_temp.act(pg_temp.id('ana'));
  visit := public.customer_open_table_session(t1->>'qr_code');
  insert into _g2b values ('sid', (visit->>'tableSessionId')::uuid);

  -- QR da mesa 2 guardado como texto numa tabela auxiliar.
  create temp table _qr (k text primary key, v text);
  insert into _qr values ('t2', t2->>'qr_code');
end $$;

-- ---------------------------------------------------------------------------
-- 1. Busca
-- ---------------------------------------------------------------------------
do $$
declare
  sid uuid := pg_temp.id('sid');
  res jsonb;
begin
  perform pg_temp.act(pg_temp.id('caio'));
  assert pg_temp.state_of(format('select public.customer_search_users_for_table(%L, %L)', sid, 'g2b-')) = 'P0001',
    'quem não está na mesa não busca';

  perform pg_temp.act(pg_temp.id('ana'));
  assert pg_temp.state_of(format('select public.customer_search_users_for_table(%L, %L)', sid, 'g2')) = '22023',
    'busca abaixo do mínimo configurado é recusada';
  assert pg_temp.state_of(format('select public.customer_search_users_for_table(%L, %L)', sid, 'g2b%')) = '22023',
    'caractere fora do formato é recusado (sem curinga)';

  res := public.customer_search_users_for_table(sid, '@G2B-');
  assert not res @> '[{"username":"g2b-ana"}]', 'busca exclui o próprio usuário';
  assert not res @> '[{"username":"g2b-eva"}]', 'busca exclui conta inativa';
  assert not res @> '[{"username":"g2b-fabio"}]', 'busca exclui conta sem papel customer';
  assert res @> '[{"username":"g2b-beto","inviteState":"invitable","displayName":"Beto T."}]',
    'resultado traz @, nome curto e estado';
  assert not exists (select 1 from jsonb_array_elements(res) e where e ? 'email' or e ? 'phone'),
    'busca não expõe e-mail nem telefone';

  res := public.customer_search_users_for_table(sid, 'g2b-b');
  assert jsonb_array_length(res) = 2, 'prefixo g2b-b casa beto e bia';

  update public.restaurant_model_configs set user_search_limit = 1
  where restaurant_id = 'c1000000-0000-4000-8000-000000000002';
  assert jsonb_array_length(public.customer_search_users_for_table(sid, 'g2b-')) = 1, 'limite configurado';
  update public.restaurant_model_configs set user_search_limit = 10
  where restaurant_id = 'c1000000-0000-4000-8000-000000000002';
end $$;
select pass('busca: participante, minimo, formato, exclusoes, privacidade e limite');

-- ---------------------------------------------------------------------------
-- 2. Envio
-- ---------------------------------------------------------------------------
do $$
declare
  sid uuid := pg_temp.id('sid');
  inv jsonb; replay jsonb;
begin
  perform pg_temp.act(pg_temp.id('ana'));
  assert pg_temp.state_of(format('select public.customer_send_table_user_invite(%L, %L)', sid, 'g2b-ana')) = '22023',
    'convidar a si mesmo';
  assert pg_temp.state_of(format('select public.customer_send_table_user_invite(%L, %L)', sid, 'g2b-naoexiste')) = 'P0002',
    '@ inexistente';
  assert pg_temp.state_of(format('select public.customer_send_table_user_invite(%L, %L)', sid, 'g2b-eva')) = 'P0002',
    'conta inativa não recebe convite (mesmo erro genérico)';

  perform pg_temp.act(pg_temp.id('caio'));
  assert pg_temp.state_of(format('select public.customer_send_table_user_invite(%L, %L)', sid, 'g2b-beto')) = 'P0001',
    'quem não está na mesa não convida';

  perform pg_temp.act(pg_temp.id('ana'));
  inv := public.customer_send_table_user_invite(sid, '@G2B-Beto');
  assert inv->>'status' = 'pending', 'convite nasce pendente';
  assert not (inv->>'idempotentReplay')::boolean, 'primeiro envio não é replay';
  assert (inv->'inviter'->>'username') = 'g2b-ana' and (inv->'invitee'->>'username') = 'g2b-beto', 'partes do convite';
  assert (inv->>'expiresAt')::timestamptz between now() + interval '29 minutes' and now() + interval '31 minutes',
    'expiração vem da configuração (30 min)';
  assert (inv->>'canCancel')::boolean, 'quem convidou pode cancelar';
  insert into _g2b values ('inv_beto', (inv->>'id')::uuid);

  replay := public.customer_send_table_user_invite(sid, 'g2b-beto');
  assert replay->>'id' = inv->>'id' and (replay->>'idempotentReplay')::boolean, 'reenvio devolve o mesmo convite';
  assert (select count(*) from public.table_session_user_invites where table_session_id = sid
          and invitee_id = pg_temp.id('beto')) = 1, 'reenvio não duplica';

  assert exists (
    select 1 from public.notifications n
    where n.user_id = pg_temp.id('beto') and n.notification_type = 'table_invite'
      and n.metadata->>'kind' = 'table_user_invite' and n.metadata->>'invite_id' = inv->>'id'
      and n.metadata->>'inviter_username' = 'g2b-ana'
      and n.message like '@g2b-ana te chamou para a mesa%'
  ), 'convidado recebe notificação (que dispara o push)';
  assert (select count(*) from public.notifications where user_id = pg_temp.id('beto')
          and metadata->>'invite_id' = inv->>'id') = 1, 'reenvio não duplica notificação';

  assert public.customer_search_users_for_table(sid, 'g2b-beto') @> '[{"username":"g2b-beto","inviteState":"invite_pending"}]',
    'busca mostra convite enviado';

  -- Recurso desligado no restaurante.
  update public.restaurant_model_configs set user_invite_enabled = false
  where restaurant_id = 'c1000000-0000-4000-8000-000000000002';
  assert pg_temp.state_of(format('select public.customer_send_table_user_invite(%L, %L)', sid, 'g2b-bia')) = 'P0009',
    'restaurante com convite por @ desligado';
  assert pg_temp.state_of(format('select public.customer_search_users_for_table(%L, %L)', sid, 'g2b-')) = 'P0009',
    'busca também respeita a flag';
  update public.restaurant_model_configs set user_invite_enabled = true
  where restaurant_id = 'c1000000-0000-4000-8000-000000000002';

  -- Limites (parametrizados).
  update public.restaurant_model_configs set user_invite_max_pending_per_session = 1
  where restaurant_id = 'c1000000-0000-4000-8000-000000000002';
  assert pg_temp.state_of(format('select public.customer_send_table_user_invite(%L, %L)', sid, 'g2b-bia')) = 'P0008',
    'limite de convites pendentes por mesa';
  update public.restaurant_model_configs set user_invite_max_pending_per_session = 10, user_invite_max_per_inviter_hour = 1
  where restaurant_id = 'c1000000-0000-4000-8000-000000000002';
  assert pg_temp.state_of(format('select public.customer_send_table_user_invite(%L, %L)', sid, 'g2b-bia')) = 'P0008',
    'limite de envios por hora';
  update public.restaurant_model_configs set user_invite_max_per_inviter_hour = 20
  where restaurant_id = 'c1000000-0000-4000-8000-000000000002';
end $$;
select pass('envio: si mesmo, inexistente, nao participante, idempotencia, notificacao, flag e limites');

-- ---------------------------------------------------------------------------
-- 3. Aceite
-- ---------------------------------------------------------------------------
do $$
declare
  sid uuid := pg_temp.id('sid');
  res jsonb;
begin
  perform pg_temp.act(pg_temp.id('caio'));
  assert pg_temp.state_of(format('select public.customer_accept_table_user_invite(%L)', pg_temp.id('inv_beto'))) = 'P0002',
    'terceiro não aceita convite alheio';
  assert pg_temp.state_of(format('select public.customer_decline_table_user_invite(%L)', pg_temp.id('inv_beto'))) = 'P0002',
    'terceiro não recusa convite alheio';

  perform pg_temp.act(pg_temp.id('beto'));
  assert public.customer_list_incoming_table_invites() @> jsonb_build_array(jsonb_build_object('id', pg_temp.id('inv_beto'), 'canRespond', true)),
    'convidado vê o convite pendente';

  res := public.customer_accept_table_user_invite(pg_temp.id('inv_beto'));
  assert res->>'status' = 'accepted', 'aceite entra na mesa';
  assert (res->'visit'->>'tableSessionId')::uuid = sid, 'visita devolvida é a sessão existente';
  assert exists (select 1 from public.table_session_participants where table_session_id = sid
                 and user_id = pg_temp.id('beto') and not is_host), 'convidado vira participante (não anfitrião)';
  assert (select count(*) from public.table_sessions where table_id = pg_temp.id('t1') and status = 'active') = 1,
    'invariante 3: uma sessão ativa por mesa';
  assert (public.customer_get_active_visit()->>'tableSessionId')::uuid = sid, 'visita ativa do convidado';

  res := public.customer_accept_table_user_invite(pg_temp.id('inv_beto'));
  assert res->>'status' = 'accepted' and (res->>'idempotentReplay')::boolean, 'aceite repetido é idempotente';
  assert (select count(*) from public.table_session_participants where table_session_id = sid
          and user_id = pg_temp.id('beto')) = 1, 'aceite repetido não duplica participante';
  assert public.customer_list_incoming_table_invites() = '[]'::jsonb, 'convite aceito sai da lista';

  assert exists (select 1 from public.notifications where user_id = pg_temp.id('ana')
                 and notification_type = 'table_invite_update' and metadata->>'invite_id' = pg_temp.id('inv_beto')::text),
    'quem convidou é avisado do aceite';
  assert exists (select 1 from public.audit_logs where action = 'table_session.participant_joined'
                 and entity_id = sid and user_id = pg_temp.id('beto')), 'entrada auditada';

  -- Qualquer participante com conta pode convidar.
  perform pg_temp.act(pg_temp.id('ana'));
  assert pg_temp.state_of(format('select public.customer_send_table_user_invite(%L, %L)', sid, 'g2b-beto')) = 'P0001',
    'quem já está na mesa não é convidado';
  assert public.customer_search_users_for_table(sid, 'g2b-beto') @> '[{"inviteState":"already_at_table"}]',
    'busca mostra já na mesa';
end $$;
select pass('aceite: dono do convite, mesma sessao, idempotencia, aviso e auditoria');

-- ---------------------------------------------------------------------------
-- 4. Recusa, carência, cancelamento
-- ---------------------------------------------------------------------------
do $$
declare
  sid uuid := pg_temp.id('sid');
  inv jsonb; res jsonb;
begin
  perform pg_temp.act(pg_temp.id('beto'));
  inv := public.customer_send_table_user_invite(sid, 'g2b-bia');
  assert inv->>'status' = 'pending', 'participante convidado também convida';

  perform pg_temp.act(pg_temp.id('bia'));
  res := public.customer_decline_table_user_invite((inv->>'id')::uuid);
  assert res->>'status' = 'declined', 'recusa';
  assert public.customer_decline_table_user_invite((inv->>'id')::uuid)->>'status' = 'declined', 'recusa repetida é idempotente';
  assert public.customer_accept_table_user_invite((inv->>'id')::uuid)->>'status' = 'declined', 'aceitar depois de recusar não entra';
  assert not exists (select 1 from public.table_session_participants where table_session_id = sid and user_id = pg_temp.id('bia')),
    'recusado não vira participante';
  assert exists (select 1 from public.notifications where user_id = pg_temp.id('beto')
                 and notification_type = 'table_invite_update' and metadata->>'invite_id' = inv->>'id'),
    'quem convidou é avisado da recusa';

  perform pg_temp.act(pg_temp.id('beto'));
  assert pg_temp.state_of(format('select public.customer_send_table_user_invite(%L, %L)', sid, 'g2b-bia')) = 'P0008',
    'carência depois de recusa';

  update public.restaurant_model_configs set user_invite_redecline_cooldown_min = 0
  where restaurant_id = 'c1000000-0000-4000-8000-000000000002';
  inv := public.customer_send_table_user_invite(sid, 'g2b-bia');
  assert inv->>'status' = 'pending', 'sem carência, pode convidar de novo';

  perform pg_temp.act(pg_temp.id('ana'));
  assert pg_temp.state_of(format('select public.customer_cancel_table_user_invite(%L)', inv->>'id')) = 'P0002',
    'só quem enviou cancela';

  perform pg_temp.act(pg_temp.id('beto'));
  res := public.customer_cancel_table_user_invite((inv->>'id')::uuid);
  assert res->>'status' = 'cancelled' and res->>'closedReason' = 'inviter_cancelled', 'cancelamento';
  assert public.customer_cancel_table_user_invite((inv->>'id')::uuid)->>'status' = 'cancelled', 'cancelamento idempotente';

  perform pg_temp.act(pg_temp.id('bia'));
  assert public.customer_accept_table_user_invite((inv->>'id')::uuid)->>'status' = 'cancelled', 'convite cancelado não entra';
  assert public.customer_list_incoming_table_invites() = '[]'::jsonb, 'cancelado sai da lista do convidado';
  assert public.customer_get_table_user_invites(array[(inv->>'id')::uuid]) @> '[{"status":"cancelled","canRespond":false}]',
    'estado final consultável para a tela de notificações';
end $$;
select pass('recusa, carencia, cancelamento e idempotencia');

-- ---------------------------------------------------------------------------
-- 5. Expiração preguiçosa
-- ---------------------------------------------------------------------------
do $$
declare
  sid uuid := pg_temp.id('sid');
  inv jsonb;
begin
  perform pg_temp.act(pg_temp.id('ana'));
  inv := public.customer_send_table_user_invite(sid, 'g2b-gil');
  update public.table_session_user_invites set expires_at = now() - interval '1 minute' where id = (inv->>'id')::uuid;

  perform pg_temp.act(pg_temp.id('gil'));
  assert public.customer_list_incoming_table_invites() = '[]'::jsonb, 'expirado não aparece como pendente';
  assert (select status::text || '/' || closed_reason from public.table_session_user_invites where id = (inv->>'id')::uuid)
    = 'expired/ttl', 'leitura grava a expiração';
  assert public.customer_accept_table_user_invite((inv->>'id')::uuid)->>'status' = 'expired', 'aceite de expirado';
  assert not exists (select 1 from public.table_session_participants where table_session_id = sid and user_id = pg_temp.id('gil')),
    'expirado não entra';

  -- Expiração no próprio aceite (sem leitura antes).
  perform pg_temp.act(pg_temp.id('ana'));
  inv := public.customer_send_table_user_invite(sid, 'g2b-gil');
  update public.table_session_user_invites set expires_at = now() - interval '1 second' where id = (inv->>'id')::uuid;
  perform pg_temp.act(pg_temp.id('gil'));
  assert public.customer_accept_table_user_invite((inv->>'id')::uuid)->>'status' = 'expired', 'aceite grava a expiração';
  assert (select status::text from public.table_session_user_invites where id = (inv->>'id')::uuid) = 'expired',
    'expiração persistida mesmo sem erro';
end $$;
select pass('expiracao preguicosa');

-- ---------------------------------------------------------------------------
-- 6. Convidado em outra mesa
-- ---------------------------------------------------------------------------
do $$
declare
  r uuid := 'c1000000-0000-4000-8000-000000000002';
  sid uuid := pg_temp.id('sid');
  sid2 uuid; visit jsonb; inv jsonb; res jsonb; menu uuid; o uuid;
begin
  select id into menu from public.menu_items where restaurant_id = r limit 1;

  perform pg_temp.act(pg_temp.id('caio'));
  visit := public.customer_open_table_session((select v from _qr where k = 't2'));
  sid2 := (visit->>'tableSessionId')::uuid;
  insert into public.orders(restaurant_id, customer_id, table_session_id) values (r, pg_temp.id('caio'), sid2) returning id into o;
  insert into public.order_items(order_id, menu_item_id, quantity, unit_price, total_price) values (o, menu, 1, 20, 20);

  perform pg_temp.act(pg_temp.id('ana'));
  inv := public.customer_send_table_user_invite(sid, 'g2b-caio');
  assert (inv->'invitee') is not null and not (inv::text like '%' || sid2::text || '%'),
    'quem convida não fica sabendo da outra mesa';

  perform pg_temp.act(pg_temp.id('caio'));
  assert pg_temp.state_of(format('select public.customer_accept_table_user_invite(%L)', inv->>'id')) = 'P0004',
    'com saldo em outra mesa não troca';
  assert (select status::text from public.table_session_user_invites where id = (inv->>'id')::uuid) = 'pending',
    'convite continua pendente para tentar depois';
  assert exists (select 1 from public.table_session_participants where table_session_id = sid2 and user_id = pg_temp.id('caio')),
    'continua na mesa antiga';

  -- Quitou (aqui: pedido cancelado) — agora troca de mesa.
  update public.orders set status = 'cancelled' where id = o;
  res := public.customer_accept_table_user_invite((inv->>'id')::uuid);
  assert res->>'status' = 'accepted', 'sem saldo aceita';
  assert not exists (select 1 from public.table_session_participants where table_session_id = sid2 and user_id = pg_temp.id('caio')),
    'saiu da mesa antiga';
  assert (public.customer_get_active_visit()->>'tableSessionId')::uuid = sid, 'visita ativa é a nova mesa';
end $$;
select pass('convidado em outra mesa: P0004 mantem pendente; sem saldo troca de mesa');

-- ---------------------------------------------------------------------------
-- 7. Quem convidou saiu / sessão encerrada / entrou por outro caminho
-- ---------------------------------------------------------------------------
do $$
declare
  sid uuid := pg_temp.id('sid');
  inv jsonb; inv2 jsonb;
begin
  perform pg_temp.act(pg_temp.id('beto'));
  inv := public.customer_send_table_user_invite(sid, 'g2b-dan');
  perform public.customer_leave_table_session(sid);
  assert (select status::text || '/' || closed_reason from public.table_session_user_invites where id = (inv->>'id')::uuid)
    = 'cancelled/inviter_left', 'quem convidou saiu: convite cai';
  perform pg_temp.act(pg_temp.id('dan'));
  assert public.customer_accept_table_user_invite((inv->>'id')::uuid)->>'status' = 'cancelled', 'e não pode mais ser aceito';

  -- Entrou pelo QR enquanto o convite estava pendente.
  perform pg_temp.act(pg_temp.id('ana'));
  inv := public.customer_send_table_user_invite(sid, 'g2b-dan');
  perform pg_temp.act(pg_temp.id('dan'));
  perform public.customer_open_table_session((select qr_code_data from public.table_qr_codes
    where table_id = pg_temp.id('t1') and is_active order by created_at desc limit 1));
  assert (select status::text || '/' || closed_reason from public.table_session_user_invites where id = (inv->>'id')::uuid)
    = 'accepted/joined_otherwise', 'entrar pelo QR resolve o convite da mesma mesa';

  -- Sessão encerrada.
  perform pg_temp.act(pg_temp.id('ana'));
  inv2 := public.customer_send_table_user_invite(sid, 'g2b-gil');
  update public.table_sessions set status = 'ended', ended_at = now() where id = sid;
  assert (select status::text || '/' || closed_reason from public.table_session_user_invites where id = (inv2->>'id')::uuid)
    = 'expired/session_closed', 'sessão encerrada expira convites';
  perform pg_temp.act(pg_temp.id('gil'));
  assert public.customer_accept_table_user_invite((inv2->>'id')::uuid)->>'status' = 'expired', 'aceite depois de encerrar';
  assert public.customer_get_active_visit() is null, 'não cria sessão nova';
end $$;
select pass('ciclo de vida: inviter saiu, entrou pelo QR, sessao encerrada');

-- ---------------------------------------------------------------------------
-- 8. RLS e privilégios
-- ---------------------------------------------------------------------------
do $$
declare
  inv uuid := pg_temp.id('inv_beto');
begin
  assert not has_table_privilege('authenticated', 'public.table_session_user_invites', 'INSERT'), 'sem insert direto';
  assert not has_table_privilege('authenticated', 'public.table_session_user_invites', 'UPDATE'), 'sem update direto';
  assert not has_table_privilege('authenticated', 'public.capacity_requests', 'INSERT'), 'sem insert direto em lotação';
  assert not has_function_privilege('anon', 'public.customer_send_table_user_invite(uuid,text)', 'EXECUTE'), 'anon não convida';
  assert not has_function_privilege('anon', 'public.customer_search_users_for_table(uuid,text)', 'EXECUTE'), 'anon não busca';
  assert (select relrowsecurity from pg_class where oid = 'public.table_session_user_invites'::regclass), 'RLS ligado';
  assert (select relrowsecurity from pg_class where oid = 'public.capacity_requests'::regclass), 'RLS ligado em lotação';
end $$;

select pass('privilegios: sem escrita direta, anon bloqueado, RLS ligado');

-- Visibilidade por RLS (papel authenticated de verdade).
create temp table _vis as select v as inv from _g2b where k = 'inv_beto';
grant select on _vis to authenticated;
create temp table _users as select k, v from _g2b where k in ('beto', 'ana', 'fabio');
grant select on _users to authenticated;

select _test.as_user((select v from _users where k = 'fabio'));
select is((select count(*)::integer from public.table_session_user_invites where id = (select inv from _vis)), 0,
  'estranho nao ve o convite');
reset role;
select _test.as_user((select v from _users where k = 'beto'));
select is((select count(*)::integer from public.table_session_user_invites where id = (select inv from _vis)), 1,
  'convidado ve o convite');
reset role;

select * from finish();
rollback;
