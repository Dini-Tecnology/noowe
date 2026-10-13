-- ADR-019 — código de convite de 6 dígitos: entra na mesma sessão, guarda só o HMAC, respeita
-- validade, max_uses, capacidade, fecha com a conta e bloqueia força bruta.
begin;
select plan(10);

create temp table _c (k text primary key, v uuid);
create temp table _cq (k text primary key, v text);
create temp table _cr (label text primary key, ok boolean not null);

create function pg_temp.act(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.id(p_key text) returns uuid language sql as $$ select v from _c where k = p_key; $$;
create function pg_temp.state_of(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ok'; exception when others then return sqlstate; end $$;
create function pg_temp.join_code(p_user text, p_code text) returns text language plpgsql as $$
begin
  perform public.service_join_table_by_code(pg_temp.id(p_user), p_code, 'ip-test');
  return 'ok';
exception when others then return sqlstate; end $$;

do $$
declare
  r uuid := 'c1000000-0000-4000-8000-000000000002';
  owner_id uuid := 'c1000000-0000-4000-8000-000000000001';
  u text; t jsonb; res jsonb; sid uuid; sid2 uuid; inv jsonb; code1 text; code2 text; i integer; st text;
begin
  foreach u in array array['host','host2','ga','gb','gc','gd','ge','brute'] loop
    insert into _c values (u, gen_random_uuid());
    insert into auth.users(id, email) values (pg_temp.id(u), u || '@invite-code.test');
    insert into public.profiles(id) values (pg_temp.id(u)) on conflict do nothing;
  end loop;

  update public.restaurants set opening_hours = (
    select jsonb_object_agg(d, jsonb_build_object('closed', false,
      'shifts', jsonb_build_array(jsonb_build_object('open', '00:00', 'close', '23:59'))))
    from unnest(array['sunday','monday','tuesday','wednesday','thursday','friday','saturday']) d
  ) where id = r;
  update public.restaurant_model_configs
  set service_models = array['casual_dining']::public.noowe_service_model[],
      queue_as_primary_entry = true, reservation_enabled = true, queue_enabled = true,
      enforce_table_capacity = true, guest_link_enabled = true, guest_link_max_uses = null,
      guest_link_ttl_min = 180
  where restaurant_id = r;
  delete from public.waitlist_entries where restaurant_id = r and status = 'waiting';

  perform pg_temp.act(owner_id);
  t := public.restaurant_create_table(r, 'ic-a', 6); insert into _cq values ('a', t->>'qr_code');
  t := public.restaurant_create_table(r, 'ic-b', 2); insert into _cq values ('b', t->>'qr_code');

  -- Sessão do anfitrião e convite.
  perform pg_temp.act(pg_temp.id('host'));
  res := public.customer_check_in((select v from _cq where k = 'a'), 'casual_dining', 2);
  sid := (res->>'tableSessionId')::uuid;
  inv := public.customer_create_table_invite(sid);
  code1 := inv->>'code';
  insert into _cr values ('invite returns a link and a 6-digit code',
    code1 ~ '^\d{6}$' and inv->>'url' like 'https://noowebr.com/t/invite/%' and (inv->>'expiresAt') is not null);
  insert into _cr values ('only the code HMAC is stored',
    not exists (select 1 from public.table_session_invites where short_code_hash = code1)
    and exists (select 1 from public.table_session_invites where short_code_hash = private.guest_code_hash(code1)));

  -- Entrada pelo código.
  st := pg_temp.join_code('ga', code1);
  insert into _cr values ('a guest joins the same session by code and the use is counted',
    st = 'ok'
    and exists (select 1 from public.table_session_participants where table_session_id = sid and user_id = pg_temp.id('ga'))
    and (select uses from public.table_session_invites where short_code_hash = private.guest_code_hash(code1)) = 1);

  -- max_uses.
  update public.table_session_invites set max_uses = 1 where short_code_hash = private.guest_code_hash(code1);
  insert into _cr values ('max_uses blocks further guests', pg_temp.join_code('gb', code1) = 'P0001');
  update public.table_session_invites set max_uses = null where short_code_hash = private.guest_code_hash(code1);

  insert into _cr values ('a malformed code is rejected', pg_temp.join_code('gb', '12345') = '22023');

  -- Validade.
  update public.table_session_invites set expires_at = now() - interval '1 minute'
    where short_code_hash = private.guest_code_hash(code1);
  insert into _cr values ('an expired invite is refused', pg_temp.join_code('gb', code1) = 'P0001');
  update public.table_session_invites set expires_at = now() + interval '1 hour'
    where short_code_hash = private.guest_code_hash(code1);

  -- Força bruta: 5 erros bloqueiam o usuário, mesmo com o código certo; outro usuário não é afetado.
  for i in 1..5 loop
    st := pg_temp.join_code('brute', lpad(((code1::integer + i) % 1000000)::text, 6, '0'));
  end loop;
  insert into _cr values ('five wrong codes lock the user, even with the right code',
    pg_temp.join_code('brute', code1) = 'P0016');
  insert into _cr values ('the lock does not affect other users', pg_temp.join_code('gb', code1) = 'ok');

  -- Capacidade: mesa de 2 lugares, anfitrião + 1 convidado; o próximo vira solicitação.
  perform pg_temp.act(pg_temp.id('host2'));
  res := public.customer_check_in((select v from _cq where k = 'b'), 'casual_dining', 1);
  sid2 := (res->>'tableSessionId')::uuid;
  code2 := (public.customer_create_table_invite(sid2))->>'code';
  perform public.service_join_table_by_code(pg_temp.id('gc'), code2, 'ip-test');
  res := public.service_join_table_by_code(pg_temp.id('gd'), code2, 'ip-test');
  insert into _cr values ('a guest above capacity becomes a pending request, not a silent entry',
    res->>'status' = 'awaiting_capacity'
    and not exists (select 1 from public.table_session_participants where table_session_id = sid2 and user_id = pg_temp.id('gd')));

  -- Fechar a conta revoga o convite.
  update public.table_sessions set status = 'ended' where id = sid;
  insert into _cr values ('closing the session revokes the invite',
    (select revoked_at is not null from public.table_session_invites where short_code_hash = private.guest_code_hash(code1))
    and pg_temp.join_code('ge', code1) = 'P0001');
end $$;

select ok(ok, label) from _cr order by label;
select * from finish();
rollback;
