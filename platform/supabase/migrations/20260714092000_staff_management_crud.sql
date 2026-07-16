-- Staff CRUD follow-up.
-- Bug fix: restaurant_get_staff returned the role row's primary key as
-- "role_id" while the mobile app read `member.id` for React list keys,
-- so every rendered row had id === undefined ("missing key" warning).
-- Also: the RPC hard-filtered `is_active = true`, so inactive staff could
-- never be listed/reactivated from the app.
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
      'id', ur.id,
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
  where ur.restaurant_id = p_restaurant_id;

  return result;
end;
$$;

-- ─── reactivate staff role ─────────────────────────────────────────────────────
create or replace function public.restaurant_reactivate_staff(
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

  update public.user_roles
  set is_active = true, updated_at = now()
  where id = p_role_id
  returning * into v_updated;

  return to_jsonb(v_updated);
end;
$$;

-- ─── update staff role (change which role a member has) ───────────────────────
create or replace function public.restaurant_update_staff_role(
  p_role_id uuid,
  p_role text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_role record;
  v_new_role public.user_roles_role_enum;
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

  begin
    v_new_role := p_role::public.user_roles_role_enum;
  exception when invalid_text_representation then
    raise exception 'Invalid role: %', p_role using errcode = '22023';
  end;

  if v_role.user_id = auth.uid() and v_role.role = 'owner' and v_new_role <> 'owner' then
    raise exception 'Cannot change your own owner role' using errcode = '23514';
  end if;

  begin
    update public.user_roles
    set role = v_new_role, updated_at = now()
    where id = p_role_id
    returning * into v_updated;
  exception when unique_violation then
    -- a row for (user, restaurant, new role) already exists: reactivate it
    -- and drop the old row instead of violating the unique constraint.
    update public.user_roles
    set is_active = true, updated_at = now()
    where user_id = v_role.user_id and restaurant_id = v_role.restaurant_id and role = v_new_role
    returning * into v_updated;

    delete from public.user_roles where id = p_role_id;
  end;

  return to_jsonb(v_updated);
end;
$$;

-- ─── hard delete a staff role ───────────────────────────────────────────────────
create or replace function public.restaurant_remove_staff_role(
  p_role_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_role record;
begin
  select * into v_role from public.user_roles where id = p_role_id;
  if v_role.id is null then
    raise exception 'Staff role not found' using errcode = 'P0002';
  end if;

  perform private.require_restaurant_role(
    v_role.restaurant_id,
    array['owner','manager']::public.user_roles_role_enum[]
  );

  if v_role.user_id = auth.uid() and v_role.role = 'owner' then
    raise exception 'Cannot remove your own owner role' using errcode = '23514';
  end if;

  delete from public.user_roles where id = p_role_id;

  return jsonb_build_object('id', p_role_id, 'deleted', true);
end;
$$;

-- ─── look up user by email, with linkage info for the invite flow ─────────────
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
  v_existing_elsewhere record;
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

  select r.name into v_existing_elsewhere
  from public.user_roles ur
  join public.restaurants r on r.id = ur.restaurant_id
  where ur.user_id = v_profile.id
    and ur.restaurant_id <> p_restaurant_id
    and ur.is_active = true
  limit 1;

  return jsonb_build_object(
    'id', v_profile.id,
    'full_name', v_profile.full_name,
    'email', v_profile.email,
    'avatar_url', v_profile.avatar_url,
    'already_in_this_restaurant', v_existing_here.id is not null,
    'existing_role', v_existing_here.role,
    'linked_to_other_restaurant', v_existing_elsewhere.name
  );
end;
$$;

-- superseded by the (uuid, text) overload above
drop function if exists public.restaurant_find_user_by_email(text);

revoke all on function public.restaurant_get_staff(uuid) from public;
revoke all on function public.restaurant_reactivate_staff(uuid) from public;
revoke all on function public.restaurant_update_staff_role(uuid, text) from public;
revoke all on function public.restaurant_remove_staff_role(uuid) from public;
revoke all on function public.restaurant_find_user_by_email(uuid, text) from public;

grant execute on function public.restaurant_get_staff(uuid) to authenticated, service_role;
grant execute on function public.restaurant_reactivate_staff(uuid) to authenticated, service_role;
grant execute on function public.restaurant_update_staff_role(uuid, text) to authenticated, service_role;
grant execute on function public.restaurant_remove_staff_role(uuid) to authenticated, service_role;
grant execute on function public.restaurant_find_user_by_email(uuid, text) to authenticated, service_role;
