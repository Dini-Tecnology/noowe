-- Vários donos por restaurante e um dono com vários restaurantes (rodada de validação de 29/09).
--
-- O banco nunca impediu isso (user_roles é único por usuário+restaurante+papel); as travas
-- estavam no app, na edge function e em create_my_restaurant, que devolvia o restaurante
-- que o dono já tinha em vez de criar outro. Esta migration:
--
--   1. deixa o dono atribuir o papel 'owner' (can_manage_user_role / can_manage_profile_role);
--   2. garante, por trigger em user_roles — vale para RPC, RLS e qualquer escrita —, que
--        · só um dono (ou admin do app) concede ou revoga 'owner'. Hoje um gerente consegue,
--          porque as RPCs de equipe são security definer e só pedem owner|manager;
--        · o restaurante nunca fica sem dono ativo;
--        · restaurants.owner_id e o papel de dono em profile_roles acompanham a saída de um dono;
--        · conceder/revogar dono deixa rastro em audit_logs na mesma transação (invariante 8);
--   3. faz create_my_restaurant criar um restaurante novo a cada chamada, com idempotência por
--      p_request_id (invariante 10) em vez de "devolve o primeiro restaurante do dono";
--   4. deixa qualquer dono apagar o restaurante (a política só olhava restaurants.owner_id).
--
-- Os guardas só valem em escrita direta (pg_trigger_depth() = 1): remoções em cascata (restaurante
-- apagado, conta apagada) e o trigger que cria o papel de dono no restaurante novo ficam de fora.

-- ── 1. O dono pode atribuir 'owner' ──────────────────────────────────────────
create or replace function private.can_manage_user_role(
  target_role public.user_roles_role_enum, target_restaurant_id uuid
) returns boolean language sql stable security definer
set search_path = public, private as $$
  select
    private.has_any_app_role(array['admin'])
    or (
      target_restaurant_id is not null
      and target_role = any (array['owner', 'manager', 'waiter', 'barman', 'chef', 'cook', 'maitre']::public.user_roles_role_enum[])
      and private.has_restaurant_role(target_restaurant_id, array['owner']::public.user_roles_role_enum[])
    )
    or (
      target_restaurant_id is not null
      and target_role = any (array['waiter', 'barman', 'chef', 'cook', 'maitre']::public.user_roles_role_enum[])
      and private.has_restaurant_role(target_restaurant_id, array['manager']::public.user_roles_role_enum[])
    );
$$;

create or replace function private.can_manage_profile_role(target_role text, target_restaurant_id uuid)
returns boolean language sql stable security definer
set search_path = public, private as $$
  select
    private.has_any_app_role(array['admin'])
    or (
      target_restaurant_id is not null
      and target_role = any (array['owner', 'manager', 'waiter', 'barman', 'chef', 'cook', 'maitre'])
      and private.has_restaurant_role(target_restaurant_id, array['owner']::public.user_roles_role_enum[])
    )
    or (
      target_restaurant_id is not null
      and target_role = any (array['waiter', 'barman', 'chef', 'cook', 'maitre'])
      and private.has_restaurant_role(target_restaurant_id, array['manager']::public.user_roles_role_enum[])
    );
$$;

-- ── 2. Guardas de dono em user_roles ─────────────────────────────────────────
-- "Mudança de dono": papel owner criado, apagado, ou que mudou de papel/ativação.
create or replace function private.user_roles_owner_change_kind(p_op text, p_old public.user_roles, p_new public.user_roles)
returns text language sql immutable
set search_path = public as $$
  select case
    when p_op = 'INSERT' then case when p_new.role = 'owner' and p_new.is_active then 'granted' end
    when p_op = 'DELETE' then case when p_old.role = 'owner' and p_old.is_active then 'revoked' end
    else case
      when (p_old.role = 'owner' and p_old.is_active) and not (p_new.role = 'owner' and p_new.is_active) then 'revoked'
      when not (p_old.role = 'owner' and p_old.is_active) and (p_new.role = 'owner' and p_new.is_active) then 'granted'
    end
  end
$$;

create or replace function private.user_roles_owner_guard()
returns trigger language plpgsql security definer
set search_path = public, private, pg_temp as $$
declare
  v_kind text;
  v_restaurant uuid;
begin
  -- Cascata (restaurante ou conta apagados), bootstrap do restaurante novo e escrita sem
  -- usuário (migration, service role) não passam por aqui.
  if pg_trigger_depth() > 1 or auth.uid() is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  v_kind := private.user_roles_owner_change_kind(
    tg_op,
    case when tg_op = 'INSERT' then null else old end,
    case when tg_op = 'DELETE' then null else new end);
  if v_kind is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  v_restaurant := case when tg_op = 'DELETE' then old.restaurant_id else new.restaurant_id end;

  -- Só dono (ou admin do app) concede ou revoga 'owner'.
  if not (private.has_any_app_role(array['admin'])
          or private.has_restaurant_role(v_restaurant, array['owner']::public.user_roles_role_enum[])) then
    raise exception 'Somente um dono pode conceder ou remover o papel de dono' using errcode = '42501';
  end if;

  -- O restaurante nunca fica sem dono ativo.
  if v_kind = 'revoked'
     and exists (select 1 from public.restaurants r where r.id = v_restaurant)
     and not exists (
       select 1 from public.user_roles o
       where o.restaurant_id = v_restaurant and o.role = 'owner' and o.is_active and o.id <> old.id
     ) then
    raise exception 'O restaurante precisa manter pelo menos um dono ativo' using errcode = '23514';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end $$;

create or replace function private.user_roles_owner_after()
returns trigger language plpgsql security definer
set search_path = public, private, pg_temp as $$
declare
  v_kind text;
  v_restaurant uuid := case when tg_op = 'DELETE' then old.restaurant_id else new.restaurant_id end;
  v_row public.user_roles := case when tg_op = 'DELETE' then old else new end;
begin
  if pg_trigger_depth() > 1 or auth.uid() is null then return null; end if;

  v_kind := private.user_roles_owner_change_kind(
    tg_op,
    case when tg_op = 'INSERT' then null else old end,
    case when tg_op = 'DELETE' then null else new end);
  if v_kind is null then return null; end if;

  -- O dono registrado em restaurants.owner_id saiu: passa para outro dono ativo (o mais antigo).
  if v_kind = 'revoked' then
    update public.restaurants r
      set owner_id = (
        select o.user_id from public.user_roles o
        where o.restaurant_id = v_restaurant and o.role = 'owner' and o.is_active
        order by o.created_at, o.id limit 1)
      where r.id = v_restaurant and r.owner_id = old.user_id
        and exists (select 1 from public.user_roles o
                    where o.restaurant_id = v_restaurant and o.role = 'owner' and o.is_active);
  end if;

  -- has_restaurant_role também lê profile_roles (o papel de dono do cadastro original mora lá):
  -- sem isto, quem perdeu o papel em user_roles continuaria com acesso de dono.
  if v_kind = 'revoked' then
    update public.profile_roles
      set is_active = false, updated_at = now()
      where user_id = old.user_id and restaurant_id = v_restaurant and role_key = 'owner' and is_active;
  end if;

  perform private.log_audit(
    v_restaurant,
    case v_kind when 'granted' then 'owner_granted' else 'owner_revoked' end,
    'user_roles', v_row.id,
    case v_kind when 'granted' then 'Dono adicionado ao restaurante' else 'Dono removido do restaurante' end,
    case when tg_op = 'INSERT' then null else jsonb_build_object('user_id', old.user_id, 'role', old.role, 'is_active', old.is_active) end,
    case when tg_op = 'DELETE' then null else jsonb_build_object('user_id', new.user_id, 'role', new.role, 'is_active', new.is_active) end);
  return null;
end $$;

revoke all on function private.user_roles_owner_guard() from public, anon, authenticated;
revoke all on function private.user_roles_owner_after() from public, anon, authenticated;
revoke all on function private.user_roles_owner_change_kind(text, public.user_roles, public.user_roles) from public, anon, authenticated;

drop trigger if exists user_roles_owner_guard on public.user_roles;
create trigger user_roles_owner_guard
  before insert or update or delete on public.user_roles
  for each row execute function private.user_roles_owner_guard();

drop trigger if exists user_roles_owner_after on public.user_roles;
create trigger user_roles_owner_after
  after insert or update or delete on public.user_roles
  for each row execute function private.user_roles_owner_after();

-- ── 3. Cada dono pode ter vários restaurantes ────────────────────────────────
alter table public.restaurants add column if not exists creation_request_id uuid;
create unique index if not exists uq_restaurants_owner_creation_request
  on public.restaurants (owner_id, creation_request_id) where creation_request_id is not null;
comment on column public.restaurants.creation_request_id is
  'Chave de idempotência de create_my_restaurant: reenviar a mesma criação devolve o mesmo restaurante.';

drop function if exists public.create_my_restaurant(text, text, text, text, text, text, text, text);

-- Última definição: 20260921120000_service_model_profile_parity.sql. Igual, exceto que não devolve
-- mais "o primeiro restaurante do dono": cada chamada cria um restaurante novo, e só a mesma
-- p_request_id devolve o mesmo.
create or replace function public.create_my_restaurant(
  p_name text,
  p_phone text,
  p_email text,
  p_city text default 'São Paulo',
  p_state text default 'SP',
  p_address text default 'Endereço a definir',
  p_zip_code text default '00000-000',
  p_service_type text default null,
  p_request_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_restaurant public.restaurants%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if nullif(trim(coalesce(p_name, '')), '') is null then
    raise exception 'Restaurant name is required' using errcode = '22023';
  end if;
  if nullif(trim(coalesce(p_phone, '')), '') is null then
    raise exception 'Restaurant phone is required' using errcode = '22023';
  end if;
  if nullif(trim(coalesce(p_email, '')), '') is null then
    raise exception 'Restaurant email is required' using errcode = '22023';
  end if;
  if p_service_type is null or p_service_type not in ('fine_dining', 'casual_dining', 'quick_service') then
    raise exception 'A supported service type is required' using errcode = '22023';
  end if;

  if p_request_id is not null then
    select * into v_restaurant from public.restaurants
      where owner_id = v_user_id and creation_request_id = p_request_id;
    if found then return to_jsonb(v_restaurant); end if;
  end if;

  begin
    insert into public.restaurants (
      owner_id, name, address, city, state, zip_code, phone, email,
      service_type, service_config, creation_request_id
    ) values (
      v_user_id,
      trim(p_name),
      coalesce(nullif(trim(p_address), ''), 'Endereço a definir'),
      coalesce(nullif(trim(p_city), ''), 'São Paulo'),
      coalesce(nullif(trim(p_state), ''), 'SP'),
      coalesce(nullif(trim(p_zip_code), ''), '00000-000'),
      trim(p_phone),
      lower(trim(p_email)),
      p_service_type,
      private.default_service_config(p_service_type),
      p_request_id
    )
    returning * into v_restaurant;
  exception when unique_violation then
    -- Duas chamadas simultâneas com a mesma chave: a segunda recebe o restaurante da primeira.
    select * into v_restaurant from public.restaurants
      where owner_id = v_user_id and creation_request_id = p_request_id;
    if found then return to_jsonb(v_restaurant); end if;
    raise;
  end;

  insert into public.restaurant_service_configs (
    restaurant_id, service_type, is_active, config_metadata, created_at, updated_at
  )
  select v_restaurant.id, p_service_type, true, jsonb_build_object('features', '{}'::jsonb), now(), now()
  where not exists (
    select 1 from public.restaurant_service_configs
    where restaurant_id = v_restaurant.id and service_type = p_service_type
  );

  return to_jsonb(v_restaurant);
end;
$$;

revoke all on function public.create_my_restaurant(text, text, text, text, text, text, text, text, uuid) from public;
grant execute on function public.create_my_restaurant(text, text, text, text, text, text, text, text, uuid) to authenticated;

-- ── 4. Qualquer dono apaga o restaurante ─────────────────────────────────────
drop policy if exists restaurants_delete_owner on public.restaurants;
create policy restaurants_delete_owner on public.restaurants
  for delete using (private.has_restaurant_role(id, array['owner']::public.user_roles_role_enum[]));
