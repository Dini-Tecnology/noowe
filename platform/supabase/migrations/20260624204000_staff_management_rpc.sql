-- Staff Management RPCs
-- Covers: list staff, invite (upsert role), update role, deactivate

-- ─── get staff list ───────────────────────────────────────────────────────────
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
      'user_id', p.id,
      'full_name', p.full_name,
      'email', p.email,
      'phone', p.phone,
      'avatar_url', p.avatar_url,
      'role', ur.role,
      'is_active', ur.is_active,
      'created_at', ur.created_at,
      'updated_at', ur.updated_at
    ) order by ur.role, p.full_name
  ), '[]'::jsonb)
  into result
  from public.user_roles ur
  join public.profiles p on p.id = ur.user_id
  where ur.restaurant_id = p_restaurant_id
    and ur.is_active = true;

  return result;
end;
$$;

-- ─── add / update staff role ──────────────────────────────────────────────────
-- If a user_roles row already exists for (user_id, restaurant_id, role), reactivate it.
create or replace function public.restaurant_upsert_staff_role(
  p_restaurant_id uuid,
  p_user_id uuid,
  p_role text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_role public.user_roles_role_enum;
  v_result record;
begin
  perform private.require_restaurant_role(
    p_restaurant_id,
    array['owner','manager']::public.user_roles_role_enum[]
  );

  -- validate role value
  begin
    v_role := p_role::public.user_roles_role_enum;
  exception when invalid_text_representation then
    raise exception 'Invalid role: %', p_role using errcode = '22023';
  end;

  -- verify user exists
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'User not found' using errcode = 'P0002';
  end if;

  insert into public.user_roles(user_id, restaurant_id, role, is_active, created_at, updated_at)
  values(p_user_id, p_restaurant_id, v_role, true, now(), now())
  on conflict (user_id, restaurant_id, role)
  do update set is_active = true, updated_at = now()
  returning * into v_result;

  return to_jsonb(v_result);
end;
$$;

-- ─── deactivate staff role ────────────────────────────────────────────────────
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
  if v_role.user_id = auth.uid() and v_role.role = 'owner' then
    raise exception 'Cannot remove your own owner role' using errcode = '23514';
  end if;

  update public.user_roles
  set is_active = false, updated_at = now()
  where id = p_role_id
  returning * into v_updated;

  return to_jsonb(v_updated);
end;
$$;

-- ─── look up user by email (for invite flow) ──────────────────────────────────
create or replace function public.restaurant_find_user_by_email(
  p_email text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_profile record;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select p.id, p.full_name, p.email, p.avatar_url
  into v_profile
  from public.profiles p
  where lower(p.email) = lower(trim(p_email))
  limit 1;

  if v_profile.id is null then
    return null;
  end if;

  return jsonb_build_object(
    'id', v_profile.id,
    'full_name', v_profile.full_name,
    'email', v_profile.email,
    'avatar_url', v_profile.avatar_url
  );
end;
$$;

revoke all on function public.restaurant_get_staff(uuid) from public;
revoke all on function public.restaurant_upsert_staff_role(uuid, uuid, text) from public;
revoke all on function public.restaurant_deactivate_staff(uuid) from public;
revoke all on function public.restaurant_find_user_by_email(text) from public;

grant execute on function public.restaurant_get_staff(uuid) to authenticated, service_role;
grant execute on function public.restaurant_upsert_staff_role(uuid, uuid, text) to authenticated, service_role;
grant execute on function public.restaurant_deactivate_staff(uuid) to authenticated, service_role;
grant execute on function public.restaurant_find_user_by_email(text) to authenticated, service_role;
