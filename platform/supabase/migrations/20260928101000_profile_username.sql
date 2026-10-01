-- G2b / ADR-011 — @username único por usuário.
--
-- O username é o identificador público usado para convidar alguém para a mesa.
-- Regras (ADR-011):
--   * guardado já normalizado (minúsculas, [a-z0-9] e hífen simples entre blocos,
--     3 a 30 caracteres).  Como só existe a forma normalizada, um UNIQUE simples é
--     unicidade sem diferenciar maiúsculas;
--   * gerado uma vez a partir do nome (ou do e-mail) e estável: não acompanha
--     mudanças posteriores do nome;
--   * só muda pela RPC `customer_set_my_username`.  A política
--     `profiles_update_own` e o grant de UPDATE na tabela deixariam o cliente
--     gravar qualquer coisa via REST, por isso a guarda é um trigger no banco.

create extension if not exists unaccent with schema extensions;

-- ---------------------------------------------------------------------------
-- Palavras reservadas.  Fica em `private`: fora do PostgREST e da varredura de RLS.
-- ---------------------------------------------------------------------------
create table if not exists private.reserved_usernames (
  username text primary key
);

insert into private.reserved_usernames (username) values
  ('admin'), ('administrador'), ('root'), ('noowe'), ('suporte'), ('support'),
  ('ajuda'), ('help'), ('sistema'), ('system'), ('staff'), ('equipe'),
  ('garcom'), ('maitre'), ('gerente'), ('restaurante'), ('oficial'), ('api'),
  ('me'), ('eu'), ('null'), ('undefined'), ('anonimo'), ('convidado'),
  ('cliente'), ('usuario'), ('moderador'), ('seguranca'), ('financeiro')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Formato.  Os limites (3..30) são de formato do identificador, não regra de
-- negócio parametrizável — por isso vivem na CHECK constraint, documentados no ADR.
-- ---------------------------------------------------------------------------
create or replace function private.username_is_valid_format(p_username text)
returns boolean
language sql
immutable
as $$
  select p_username is not null
    and char_length(p_username) between 3 and 30
    and p_username ~ '^[a-z0-9]+(-[a-z0-9]+)*$';
$$;

create or replace function private.username_is_reserved(p_username text)
returns boolean
language sql
stable
security definer
set search_path = private, pg_temp
as $$
  select exists (select 1 from private.reserved_usernames r where r.username = p_username);
$$;

-- O que o usuário digita: aceita "@Bruno de Castro " e devolve "bruno-de-castro".
create or replace function private.normalize_username_input(p_input text)
returns text
language sql
stable
set search_path = extensions, pg_temp
as $$
  select nullif(
    regexp_replace(
      regexp_replace(
        lower(extensions.unaccent('extensions.unaccent'::regdictionary,
          regexp_replace(btrim(coalesce(p_input, '')), '^@+', ''))),
        '[\s_.]+', '-', 'g'),
      '-{2,}', '-', 'g'),
    '');
$$;

-- Slug de um nome livre: tudo que não for [a-z0-9] vira hífen.
create or replace function private.slugify_username(p_source text)
returns text
language plpgsql
stable
set search_path = extensions, pg_temp
as $$
declare
  v text;
begin
  v := lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(p_source, '')));
  v := regexp_replace(v, '[^a-z0-9]+', '-', 'g');
  v := btrim(v, '-');
  v := left(v, 30);
  v := rtrim(v, '-');
  return nullif(v, '');
end;
$$;

-- Gera um username livre a partir de uma semente (nome ou e-mail).
-- Colisão vira base-2, base-3, …; depois de muitas tentativas, sufixo aleatório.
create or replace function private.generate_unique_username(p_seed text, p_user_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_base text := private.slugify_username(p_seed);
  v_candidate text;
  v_suffix text;
  v_n integer := 1;
begin
  if v_base is null or char_length(v_base) < 3 or private.username_is_reserved(v_base) then
    v_base := 'usuario';
  end if;

  -- Serializa gerações concorrentes da mesma base (dois cadastros "Bruno" ao
  -- mesmo tempo não disputam o mesmo sufixo e derrubam um dos inserts).
  perform pg_advisory_xact_lock(hashtext('noowe.username:' || v_base));

  v_candidate := case when v_base = 'usuario' then null else v_base end;
  loop
    if v_candidate is not null
       and private.username_is_valid_format(v_candidate)
       and not private.username_is_reserved(v_candidate)
       and not exists (
         select 1 from public.profiles p
         where p.username = v_candidate and p.id is distinct from p_user_id
       ) then
      return v_candidate;
    end if;

    v_n := v_n + 1;
    if v_base = 'usuario' or v_n > 50 then
      v_suffix := '-' || substr(md5(coalesce(p_user_id::text, '') || clock_timestamp()::text || random()::text), 1, 6);
    else
      v_suffix := '-' || v_n;
    end if;
    v_candidate := rtrim(left(v_base, 30 - char_length(v_suffix)), '-') || v_suffix;
  end loop;
end;
$$;

revoke all on function private.username_is_valid_format(text) from public;
revoke all on function private.username_is_reserved(text) from public;
revoke all on function private.normalize_username_input(text) from public;
revoke all on function private.slugify_username(text) from public;
revoke all on function private.generate_unique_username(text, uuid) from public;

-- ---------------------------------------------------------------------------
-- Coluna, geração automática e guarda.
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists username text;

-- BEFORE INSERT em profiles, e não só no trigger de auth: cobre o cadastro
-- (private.sync_auth_user_to_app_profile) e qualquer outro caminho de insert.
create or replace function private.profiles_assign_username()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if new.username is null then
    new.username := private.generate_unique_username(
      coalesce(nullif(btrim(new.full_name), ''), split_part(coalesce(new.email, ''), '@', 1)),
      new.id
    );
  else
    new.username := private.normalize_username_input(new.username);
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_assign_username on public.profiles;
create trigger profiles_assign_username
before insert on public.profiles
for each row execute function private.profiles_assign_username();

-- Dentro de RPC security definer o current_user é o dono da função; via REST é
-- `authenticated`/`anon`.  Assim o UPDATE direto é recusado e a RPC passa.
create or replace function private.profiles_guard_username()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.username is distinct from old.username
     and current_user in ('authenticated', 'anon') then
    raise exception 'Use customer_set_my_username para alterar o @' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_username on public.profiles;
create trigger profiles_guard_username
before update of username on public.profiles
for each row execute function private.profiles_guard_username();

-- Backfill: contas mais antigas primeiro, para ficarem com o slug limpo.
do $$
declare
  r record;
begin
  for r in
    select id, full_name, email from public.profiles
    where username is null
    order by created_at, id
  loop
    update public.profiles
    set username = private.generate_unique_username(
      coalesce(nullif(btrim(r.full_name), ''), split_part(coalesce(r.email, ''), '@', 1)),
      r.id
    )
    where id = r.id;
  end loop;
end;
$$;

alter table public.profiles alter column username set not null;

alter table public.profiles drop constraint if exists profiles_username_format;
alter table public.profiles add constraint profiles_username_format
  check (char_length(username) between 3 and 30 and username ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

alter table public.profiles drop constraint if exists profiles_username_key;
alter table public.profiles add constraint profiles_username_key unique (username);

-- Busca por prefixo (`like 'bru%'`) independe da collation do banco.
create index if not exists idx_profiles_username_prefix
  on public.profiles (username text_pattern_ops);

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------
create or replace function private.username_unavailable_reason(p_username text, p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select case
    when not private.username_is_valid_format(p_username) then 'invalid_format'
    when exists (select 1 from public.profiles p where p.id = p_user_id and p.username = p_username) then 'current'
    when private.username_is_reserved(p_username) then 'reserved'
    when exists (select 1 from public.profiles p where p.username = p_username) then 'taken'
    else null
  end;
$$;
revoke all on function private.username_unavailable_reason(text, uuid) from public;

create or replace function public.customer_check_username_availability(p_username text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_normalized text := private.normalize_username_input(p_username);
  v_reason text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  v_reason := private.username_unavailable_reason(v_normalized, auth.uid());
  return jsonb_build_object(
    'normalized', v_normalized,
    'available', v_reason is null or v_reason = 'current',
    'reason', v_reason
  );
end;
$$;

create or replace function public.customer_set_my_username(p_username text)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_normalized text := private.normalize_username_input(p_username);
  v_reason text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  v_reason := private.username_unavailable_reason(v_normalized, auth.uid());
  if v_reason = 'invalid_format' then
    raise exception 'Use de 3 a 30 caracteres: letras minúsculas, números e hífen'
      using errcode = '22023';
  elsif v_reason = 'reserved' then
    raise exception 'Esse @ é reservado' using errcode = '22023';
  elsif v_reason = 'taken' then
    raise exception 'Esse @ já está em uso' using errcode = '23505';
  elsif v_reason = 'current' then
    return jsonb_build_object('username', v_normalized, 'changed', false);
  end if;

  begin
    update public.profiles set username = v_normalized, updated_at = now()
    where id = auth.uid();
  exception when unique_violation then
    raise exception 'Esse @ já está em uso' using errcode = '23505';
  end;

  if not found then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;

  return jsonb_build_object('username', v_normalized, 'changed', true);
end;
$$;

revoke all on function public.customer_check_username_availability(text) from public;
revoke all on function public.customer_set_my_username(text) from public;
grant execute on function public.customer_check_username_availability(text) to authenticated;
grant execute on function public.customer_set_my_username(text) to authenticated;

comment on column public.profiles.username is
  'Identificador público único (ADR-011). Normalizado; alterável só por customer_set_my_username.';
