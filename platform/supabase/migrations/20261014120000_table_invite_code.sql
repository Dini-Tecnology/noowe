-- ADR-019: código de convite de 6 dígitos (Casual), além do link e do QR no celular do anfitrião.
-- O código só entra por service_join_table_by_code (Edge Function join-table-by-code), com limite de
-- tentativas por usuário e por IP. O banco guarda só o HMAC do código (6 dígitos em sha256 puro seriam
-- reversíveis em 10^6 tentativas). O convite expira por TTL, por revogação e ao fechar a conta.

-- Configuração (CLAUDE.md: valor de regra vive em configuração, não no código).
create table if not exists private.app_settings (
  key text primary key,
  value integer not null check (value > 0)
);
insert into private.app_settings(key, value) values
  ('guest_code_max_attempts', 5),
  ('guest_code_attempt_window_min', 15)
on conflict (key) do nothing;
alter table private.app_settings enable row level security;
revoke all on private.app_settings from public, anon, authenticated;

create table if not exists private.app_secrets (
  key text primary key,
  value text not null
);
insert into private.app_secrets(key, value)
values ('guest_code_pepper', encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (key) do nothing;
alter table private.app_secrets enable row level security;
revoke all on private.app_secrets from public, anon, authenticated;

alter table public.restaurant_model_configs
  add column if not exists guest_link_max_uses integer check (guest_link_max_uses is null or guest_link_max_uses > 0);

alter table public.table_session_invites
  add column if not exists short_code_hash text,
  add column if not exists uses integer not null default 0,
  add column if not exists max_uses integer check (max_uses is null or max_uses > 0);
create unique index if not exists uq_table_session_invites_active_code
  on public.table_session_invites (short_code_hash) where short_code_hash is not null and revoked_at is null;

create table if not exists private.table_invite_code_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  ip_hash text,
  ok boolean not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_table_invite_code_attempts_user on private.table_invite_code_attempts (user_id, created_at desc);
alter table private.table_invite_code_attempts enable row level security;
revoke all on private.table_invite_code_attempts from public, anon, authenticated;

create or replace function private.guest_code_hash(p_code text)
returns text language sql stable security definer
set search_path = public, private, extensions, pg_temp as $$
  select encode(hmac(p_code, (select value from private.app_secrets where key = 'guest_code_pepper'), 'sha256'), 'hex')
$$;
revoke all on function private.guest_code_hash(text) from public, anon, authenticated;

create or replace function private.new_guest_code()
returns text language plpgsql volatile security definer
set search_path = public, private, extensions, pg_temp as $$
declare v_code text; v_try integer := 0;
begin
  loop
    v_code := lpad(((('x' || encode(gen_random_bytes(4), 'hex'))::bit(32)::bigint) % 1000000)::text, 6, '0');
    exit when not exists (
      select 1 from public.table_session_invites i
      where i.short_code_hash = private.guest_code_hash(v_code) and i.revoked_at is null and i.expires_at > now());
    v_try := v_try + 1;
    if v_try > 30 then raise exception 'Não foi possível gerar o código de convite' using errcode = 'P0001'; end if;
  end loop;
  return v_code;
end $$;
revoke all on function private.new_guest_code() from public, anon, authenticated;

-- Criação: agora devolve link, código e validade (antes só o link).
drop function if exists public.customer_create_table_invite(uuid);
create function public.customer_create_table_invite(p_table_session_id uuid)
returns jsonb language plpgsql security definer
set search_path = public, private, extensions, pg_temp as $$
declare v_raw text := encode(gen_random_bytes(24), 'hex'); v_hash text; v_ttl integer; v_max integer;
  v_code text; v_expires timestamptz; v_session public.table_sessions;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select s.* into v_session from public.table_sessions s where s.id = p_table_session_id and s.status = 'active'
    and private.is_table_session_participant(s.id);
  if v_session.id is null then raise exception 'Table session not accessible' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.restaurant_model_policies where restaurant_id = v_session.restaurant_id
    and service_model = v_session.service_model and guest_link_enabled) then
    raise exception 'Convite por link indisponível neste modelo' using errcode = '23514'; end if;
  select guest_link_ttl_min, guest_link_max_uses into v_ttl, v_max
    from public.restaurant_model_configs where restaurant_id = v_session.restaurant_id;
  v_hash := encode(sha256(v_raw::bytea), 'hex');
  v_code := private.new_guest_code();
  v_expires := now() + make_interval(mins => v_ttl);
  insert into public.table_session_invites(table_session_id, token, token_hash, short_code_hash, created_by, expires_at, max_uses)
    values (p_table_session_id, v_hash, v_hash, private.guest_code_hash(v_code), auth.uid(), v_expires, v_max);
  return jsonb_build_object('url', 'https://noowebr.com/t/invite/' || v_raw, 'code', v_code, 'expiresAt', v_expires);
end $$;
revoke all on function public.customer_create_table_invite(uuid) from public, anon;
grant execute on function public.customer_create_table_invite(uuid) to authenticated;

-- Entrada na sessão por um convite válido (token ou código): capacidade, solicitação ao maître e participante.
create or replace function private.join_by_invite(p_invite_id uuid, p_user uuid)
returns jsonb language plpgsql security definer
set search_path = public, private, pg_temp as $$
declare v_invite public.table_session_invites; v_session public.table_sessions; v_table public.tables;
  v_occupied integer; v_request_id uuid; v_ttl integer; v_is_participant boolean;
begin
  select * into v_invite from public.table_session_invites where id = p_invite_id for update;
  select * into v_session from public.table_sessions where id = v_invite.table_session_id and status = 'active' for update;
  if v_session.id is null then raise exception 'This table session has ended' using errcode = 'P0001'; end if;
  select * into v_table from public.tables where id = v_session.table_id;
  v_is_participant := exists (select 1 from public.table_session_participants
    where table_session_id = v_session.id and user_id = p_user);
  if not v_is_participant and v_invite.max_uses is not null and v_invite.uses >= v_invite.max_uses then
    raise exception 'Invalid or expired invitation' using errcode = 'P0001';
  end if;
  if (select enforce_table_capacity from public.restaurant_model_configs where restaurant_id = v_session.restaurant_id)
    and not v_is_participant then
    select coalesce(sum(seat_count), 0)::integer into v_occupied from public.table_session_participants where table_session_id = v_session.id;
    if v_occupied + 1 > v_table.seats then
      select capacity_request_ttl_min into v_ttl from public.restaurant_model_configs where restaurant_id = v_session.restaurant_id;
      insert into public.capacity_requests(restaurant_id, table_session_id, table_id, requested_user_id, source,
        seat_count, occupied_seats_at_request, capacity_at_request, expires_at)
      values (v_session.restaurant_id, v_session.id, v_session.table_id, p_user, 'guest_link', 1,
        v_occupied, v_table.seats::integer, now() + make_interval(mins => v_ttl))
      on conflict (table_session_id, requested_user_id) where status = 'pending'
      do update set expires_at = excluded.expires_at returning id into v_request_id;
      return jsonb_build_object('status', 'awaiting_capacity', 'capacityRequestId', v_request_id,
        'restaurantId', v_session.restaurant_id, 'tableId', v_session.table_id, 'serviceModel', v_session.service_model);
    end if;
  end if;
  perform private.join_table_session_participant(v_session.id, p_user, 1);
  if not v_is_participant then
    update public.table_session_invites set uses = uses + 1 where id = v_invite.id;
  end if;
  return jsonb_build_object('restaurantId', v_session.restaurant_id, 'tableId', v_session.table_id,
    'tableSessionId', v_session.id, 'tableNumber', v_table.table_number, 'serviceModel', v_session.service_model);
end $$;
revoke all on function private.join_by_invite(uuid, uuid) from public, anon, authenticated;

create or replace function public.customer_join_table_invite(p_token text)
returns jsonb language plpgsql security definer
set search_path = public, private, pg_temp as $$
declare v_invite public.table_session_invites;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select * into v_invite from public.table_session_invites where token_hash = encode(sha256(p_token::bytea), 'hex')
    and revoked_at is null and expires_at > now();
  if v_invite.id is null then raise exception 'Invalid or expired invitation' using errcode = 'P0001'; end if;
  return private.join_by_invite(v_invite.id, auth.uid());
end $$;

-- Entrada por código: só a Edge Function (service_role) chama, com o usuário já validado pelo JWT.
-- Código malformado: 22023. Código errado e bloqueio por tentativas DEVOLVEM {status:'invalid'|'locked'}
-- em vez de lançar erro: uma exceção desfaria o registro da tentativa e o limite nunca acumularia.
create or replace function public.service_join_table_by_code(p_user_id uuid, p_code text, p_ip_hash text default null)
returns jsonb language plpgsql security definer
set search_path = public, private, extensions, pg_temp as $$
declare v_max integer; v_window integer; v_failures integer; v_invite public.table_session_invites;
begin
  if p_user_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_code is null or p_code !~ '^\d{6}$' then raise exception 'Código inválido' using errcode = '22023'; end if;
  select value into v_max from private.app_settings where key = 'guest_code_max_attempts';
  select value into v_window from private.app_settings where key = 'guest_code_attempt_window_min';
  select count(*) into v_failures from private.table_invite_code_attempts a
    where a.user_id = p_user_id and not a.ok and a.created_at > now() - make_interval(mins => v_window);
  if v_failures >= v_max then return jsonb_build_object('status', 'locked'); end if;
  select * into v_invite from public.table_session_invites
    where short_code_hash = private.guest_code_hash(p_code) and revoked_at is null and expires_at > now()
      and (max_uses is null or uses < max_uses);
  insert into private.table_invite_code_attempts(user_id, ip_hash, ok) values (p_user_id, p_ip_hash, v_invite.id is not null);
  if v_invite.id is null then return jsonb_build_object('status', 'invalid'); end if;
  return private.join_by_invite(v_invite.id, p_user_id);
end $$;
revoke all on function public.service_join_table_by_code(uuid, text, text) from public, anon, authenticated;
grant execute on function public.service_join_table_by_code(uuid, text, text) to service_role;

-- Expira ao fechar a conta (spec §2.6): a sessão deixa de estar ativa, o convite deixa de valer.
create or replace function private.revoke_invites_on_session_close()
returns trigger language plpgsql security definer
set search_path = public, private, pg_temp as $$
begin
  update public.table_session_invites set revoked_at = now()
    where table_session_id = new.id and revoked_at is null;
  return new;
end $$;
revoke all on function private.revoke_invites_on_session_close() from public, anon, authenticated;
drop trigger if exists trg_table_sessions_revoke_invites on public.table_sessions;
create trigger trg_table_sessions_revoke_invites after update of status on public.table_sessions
for each row when (old.status = 'active' and new.status is distinct from 'active')
execute function private.revoke_invites_on_session_close();
