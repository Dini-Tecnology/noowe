-- O3, critério 2 (ADR-025): as permissões são a soma das funções. O servidor já somava (toda checagem é um EXISTS); o que
-- faltava era o app enxergar todas, a função principal e um jeito de dar mais de uma função à mesma pessoa.

alter table public.user_roles add column is_primary boolean not null default false;
create unique index user_roles_one_primary on public.user_roles(user_id, restaurant_id) where is_primary;

-- Do mais para o menos poderoso, a mesma ordem de pickRestaurantRole.ts no app.
create or replace function private.role_precedence(p_role text)
returns integer language sql immutable as $$
  select coalesce(array_position(array['owner','manager','maitre','chef','barman','cook','waiter'], p_role), 99)
$$;
revoke all on function private.role_precedence(text) from public, anon, authenticated;

-- As mesmas três fontes de private.has_restaurant_role.
create or replace function private.user_effective_roles(p_restaurant uuid, p_user uuid default auth.uid())
returns text[] language sql stable security definer set search_path = public, private, pg_temp as $$
  select coalesce(array_agg(x.role order by private.role_precedence(x.role)), '{}')
  from (
    select ur.role::text as role from public.user_roles ur
      where ur.restaurant_id = p_restaurant and ur.user_id = p_user and ur.is_active
    union
    select pr.role_key from public.profile_roles pr
      where pr.restaurant_id = p_restaurant and pr.user_id = p_user and pr.is_active
    union
    select 'owner' from public.restaurants r where r.id = p_restaurant and r.owner_id = p_user
  ) x
$$;
revoke all on function private.user_effective_roles(uuid, uuid) from public, anon, authenticated;

-- A função principal só define a tela de abertura, nunca o que a pessoa pode fazer.
create or replace function private.user_primary_role(p_restaurant uuid, p_user uuid default auth.uid())
returns text language sql stable security definer set search_path = public, private, pg_temp as $$
  select coalesce(
    (select ur.role::text from public.user_roles ur
      where ur.restaurant_id = p_restaurant and ur.user_id = p_user and ur.is_active and ur.is_primary),
    (private.user_effective_roles(p_restaurant, p_user))[1])
$$;
revoke all on function private.user_primary_role(uuid, uuid) from public, anon, authenticated;

create or replace function public.restaurant_get_my_roles(p_restaurant_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, private, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  return jsonb_build_object('roles', to_jsonb(private.user_effective_roles(p_restaurant_id)),
    'primary', private.user_primary_role(p_restaurant_id));
end $$;
revoke all on function public.restaurant_get_my_roles(uuid) from public, anon;
grant execute on function public.restaurant_get_my_roles(uuid) to authenticated;

-- Define todas as funções de uma pessoa de uma vez: ou tudo vale, ou nada. Cada linha alterada passa por
-- private.user_roles_grant_guard, então a regra de quem concede o quê segue valendo aqui.
create or replace function public.restaurant_set_staff_roles(p_restaurant_id uuid, p_user_id uuid, p_roles text[], p_primary text)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_role text; v_cast public.user_roles_role_enum; v_previous text;
begin
  perform private.require_restaurant_role(p_restaurant_id, array['owner','manager']::public.user_roles_role_enum[]);
  if coalesce(array_length(p_roles, 1), 0) = 0 then
    raise exception 'Escolha ao menos uma função' using errcode = '22023';
  end if;
  if p_primary is null or not p_primary = any(p_roles) then
    raise exception 'A função principal precisa estar entre as funções da pessoa' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'User not found' using errcode = 'P0002';
  end if;
  -- Trava a pessoa nesta unidade: duas edições ao mesmo tempo não misturam funções.
  perform 1 from public.user_roles where user_id = p_user_id and restaurant_id = p_restaurant_id for update;
  if p_user_id = auth.uid() and not 'owner' = any(p_roles) and exists (
      select 1 from public.user_roles where user_id = p_user_id and restaurant_id = p_restaurant_id and role = 'owner' and is_active) then
    raise exception 'Cannot remove your own owner role' using errcode = '23514';
  end if;

  v_previous := private.user_primary_role(p_restaurant_id, p_user_id);
  update public.user_roles set is_primary = false
    where user_id = p_user_id and restaurant_id = p_restaurant_id and is_primary;
  update public.user_roles set is_active = false, updated_at = now()
    where user_id = p_user_id and restaurant_id = p_restaurant_id and is_active and not role::text = any(p_roles);
  foreach v_role in array p_roles loop
    begin
      v_cast := v_role::public.user_roles_role_enum;
    exception when invalid_text_representation then
      raise exception 'Invalid role: %', v_role using errcode = '22023';
    end;
    insert into public.user_roles(user_id, restaurant_id, role, is_active, is_primary, created_at, updated_at)
    values (p_user_id, p_restaurant_id, v_cast, true, v_role = p_primary, now(), now())
    on conflict (user_id, restaurant_id, role)
    do update set is_active = true, is_primary = excluded.is_primary, updated_at = now();
  end loop;

  if v_previous is distinct from p_primary then
    if not private.can_manage_user_role(p_primary::public.user_roles_role_enum, p_restaurant_id) then
      raise exception 'Você não pode definir esta função como principal' using errcode = '42501';
    end if;
    perform private.log_audit(p_restaurant_id, 'staff_primary_changed', 'user_roles', p_user_id, 'Função principal alterada',
      jsonb_build_object('primary', v_previous), jsonb_build_object('primary', p_primary));
  end if;
  return jsonb_build_object('roles', to_jsonb(private.user_effective_roles(p_restaurant_id, p_user_id)),
    'primary', private.user_primary_role(p_restaurant_id, p_user_id));
end $$;
revoke all on function public.restaurant_set_staff_roles(uuid, uuid, text[], text) from public, anon;
grant execute on function public.restaurant_set_staff_roles(uuid, uuid, text[], text) to authenticated;

create or replace function public.restaurant_find_user_by_email(
  p_restaurant_id uuid,
  p_email text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, auth, pg_temp
as $$
declare
  v_profile record;
  v_existing_here record;
  v_works_elsewhere boolean;
begin
  perform private.require_restaurant_role(
    p_restaurant_id,
    array['owner','manager']::public.user_roles_role_enum[]
  );

  select p.id, p.full_name, p.email, p.avatar_url
  into v_profile
  from public.profiles p
  where lower(p.email) = lower(trim(p_email))
  limit 1;

  if v_profile.id is null then
    return null;
  end if;

  select ur.id, ur.role into v_existing_here
  from public.user_roles ur
  where ur.user_id = v_profile.id
    and ur.restaurant_id = p_restaurant_id
    and ur.is_active = true
  limit 1;

  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = v_profile.id
      and ur.restaurant_id <> p_restaurant_id
      and ur.is_active = true
  ) into v_works_elsewhere;

  return jsonb_build_object(
    'id', v_profile.id,
    'full_name', v_profile.full_name,
    'email', v_profile.email,
    'avatar_url', v_profile.avatar_url,
    'already_in_this_restaurant', v_existing_here.id is not null,
    'existing_role', v_existing_here.role,
    'existing_roles', to_jsonb(array(select ur.role::text from public.user_roles ur
      where ur.user_id = v_profile.id and ur.restaurant_id = p_restaurant_id and ur.is_active
      order by private.role_precedence(ur.role::text))),
    'primary_role', case when v_existing_here.id is not null then private.user_primary_role(p_restaurant_id, v_profile.id) end,
    'works_in_other_restaurant', v_works_elsewhere,
    'linked_to_other_restaurant', null
  );
end;
$$;

create or replace function public.restaurant_deactivate_staff(
  p_role_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_role record;
  v_updated record;
begin
  select * into v_role from public.user_roles where id = p_role_id;
  if v_role.id is null then
    raise exception 'Staff role not found' using errcode = 'P0002';
  end if;

  perform private.require_restaurant_role(
    v_role.restaurant_id,
    array['owner','manager']::public.user_roles_role_enum[]
  );

  -- prevent owner from removing themselves
  if v_role.user_id = auth.uid() and exists (select 1 from public.user_roles o
      where o.user_id = v_role.user_id and o.restaurant_id = v_role.restaurant_id and o.role = 'owner' and o.is_active) then
    raise exception 'Cannot remove your own owner role' using errcode = '23514';
  end if;

  -- Inativar vale para a pessoa inteira nesta unidade; tirar uma função só é na edição.
  update public.user_roles
  set is_active = false, updated_at = now()
  where user_id = v_role.user_id and restaurant_id = v_role.restaurant_id and is_active;
  select * into v_updated from public.user_roles where id = p_role_id;

  return to_jsonb(v_updated);
end;
$$;

create or replace function public.restaurant_get_staff(
  p_restaurant_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $$
declare
  result jsonb;
begin
  perform private.require_restaurant_role(
    p_restaurant_id,
    array['owner','manager']::public.user_roles_role_enum[]
  );

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'role_id', ur.id,
      'id', ur.id,
      'user_id', p.id,
      'full_name', p.full_name,
      'email', p.email,
      'phone', p.phone,
      'avatar_url', p.avatar_url,
      'role', ur.role,
      'is_primary', ur.is_primary,
      'is_active', ur.is_active,
      'shift', case when current_shift.id is null then null else jsonb_build_object(
        'id', current_shift.id,
        'start_time', current_shift.start_time,
        'end_time', current_shift.end_time,
        'status', current_shift.status
      ) end,
      'sales_value', coalesce(performance.sales_value, 0),
      'tips_value', coalesce(performance.tips_value, 0),
      'operational_status', case
        when not ur.is_active then 'inactive'
        when current_shift.status = 'in_progress' then 'on_shift'
        when current_shift.id is not null then 'scheduled'
        else 'active'
      end,
      'created_at', ur.created_at,
      'updated_at', ur.updated_at
    ) order by ur.is_active desc, ur.role, p.full_name
  ), '[]'::jsonb)
  into result
  from public.user_roles ur
  join public.profiles p on p.id = ur.user_id
  left join lateral (
    select s.id, s.start_time, s.end_time, s.status
    from public.shifts s
    where s.restaurant_id = p_restaurant_id
      and s.staff_id = ur.user_id
      and s.date >= (private.restaurant_day_start() at time zone private.restaurant_time_zone())::date
      and s.date < (private.restaurant_day_start() at time zone private.restaurant_time_zone())::date + 1
      and s.status not in ('cancelled', 'no_show')
    order by case when s.status = 'in_progress' then 0 else 1 end, s.start_time
    limit 1
  ) current_shift on true
  left join lateral (
    select
      (select coalesce(sum(o.total_amount), 0)
       from public.orders o
       where o.restaurant_id = p_restaurant_id
         and o.waiter_id = ur.user_id
         and o.created_at >= date_trunc('day', now())
         and o.created_at < date_trunc('day', now()) + interval '1 day'
         and private.counts_as_revenue(o.status::text, o.payment_status::text)) as sales_value,
      (select coalesce(sum(tp.amount), 0)
       from public.tips tp
       where tp.restaurant_id = p_restaurant_id
         and tp.staff_id = ur.user_id
         and tp.created_at >= date_trunc('day', now())
         and tp.created_at < date_trunc('day', now()) + interval '1 day'
         and tp.status not in ('cancelled', 'refunded')) as tips_value
  ) performance on true
  where ur.restaurant_id = p_restaurant_id;

  return result;
end;
$$;
