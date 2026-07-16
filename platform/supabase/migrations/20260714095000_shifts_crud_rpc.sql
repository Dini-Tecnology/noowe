-- Escalas (staff shift scheduling) CRUD over the existing but unused
-- public.shifts table (only restaurant_get_active_shift_count read from it before).
create index if not exists idx_shifts_restaurant_date
  on public.shifts(restaurant_id, date);

create or replace function public.restaurant_get_shifts(
  p_restaurant_id uuid,
  p_from timestamptz default null,
  p_to   timestamptz default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_from timestamptz := coalesce(p_from, date_trunc('week', current_date)::timestamptz);
  v_to   timestamptz := coalesce(p_to, (date_trunc('week', current_date) + interval '7 days')::timestamptz);
  result jsonb;
begin
  perform private.require_restaurant_role(
    p_restaurant_id,
    array['owner','manager']::public.user_roles_role_enum[]
  );

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', s.id,
      'staff_id', s.staff_id,
      'staff_name', p.full_name,
      'date', s.date,
      'start_time', s.start_time,
      'end_time', s.end_time,
      'role', s.role,
      'status', s.status,
      'notes', s.notes
    ) order by s.date asc, s.start_time asc
  ), '[]'::jsonb)
  into result
  from public.shifts s
  join public.profiles p on p.id = s.staff_id
  where s.restaurant_id = p_restaurant_id
    and s.date >= v_from
    and s.date < v_to;

  return result;
end;
$$;

create or replace function public.restaurant_create_shift(
  p_restaurant_id uuid,
  p_staff_id uuid,
  p_date timestamptz,
  p_start_time text,
  p_end_time text,
  p_role text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_shift record;
begin
  perform private.require_restaurant_role(
    p_restaurant_id,
    array['owner','manager']::public.user_roles_role_enum[]
  );

  if not exists (
    select 1 from public.user_roles
    where user_id = p_staff_id and restaurant_id = p_restaurant_id and is_active = true
  ) then
    raise exception 'Staff member not found for this restaurant' using errcode = 'P0002';
  end if;

  insert into public.shifts(
    staff_id, restaurant_id, date, start_time, end_time, role, status,
    is_overtime, notes, created_at, updated_at
  )
  values (
    p_staff_id, p_restaurant_id, p_date, p_start_time, p_end_time, p_role, 'scheduled',
    false, p_notes, now(), now()
  )
  returning * into v_shift;

  return to_jsonb(v_shift);
end;
$$;

create or replace function public.restaurant_update_shift(
  p_shift_id uuid,
  p_date timestamptz default null,
  p_start_time text default null,
  p_end_time text default null,
  p_role text default null,
  p_status text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_shift record;
  v_updated record;
begin
  select * into v_shift from public.shifts where id = p_shift_id;
  if v_shift.id is null then
    raise exception 'Shift not found' using errcode = 'P0002';
  end if;

  perform private.require_restaurant_role(
    v_shift.restaurant_id,
    array['owner','manager']::public.user_roles_role_enum[]
  );

  if p_status is not null and p_status not in ('scheduled', 'in_progress', 'completed', 'cancelled', 'no_show') then
    raise exception 'Invalid status: %', p_status using errcode = '22023';
  end if;

  update public.shifts
  set
    date       = coalesce(p_date, date),
    start_time = coalesce(p_start_time, start_time),
    end_time   = coalesce(p_end_time, end_time),
    role       = coalesce(p_role, role),
    status     = coalesce(p_status, status),
    notes      = coalesce(p_notes, notes),
    updated_at = now()
  where id = p_shift_id
  returning * into v_updated;

  return to_jsonb(v_updated);
end;
$$;

create or replace function public.restaurant_delete_shift(
  p_shift_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_shift record;
begin
  select * into v_shift from public.shifts where id = p_shift_id;
  if v_shift.id is null then
    raise exception 'Shift not found' using errcode = 'P0002';
  end if;

  perform private.require_restaurant_role(
    v_shift.restaurant_id,
    array['owner','manager']::public.user_roles_role_enum[]
  );

  delete from public.shifts where id = p_shift_id;

  return jsonb_build_object('id', p_shift_id, 'deleted', true);
end;
$$;

revoke all on function public.restaurant_get_shifts(uuid, timestamptz, timestamptz) from public;
revoke all on function public.restaurant_create_shift(uuid, uuid, timestamptz, text, text, text, text) from public;
revoke all on function public.restaurant_update_shift(uuid, timestamptz, text, text, text, text, text) from public;
revoke all on function public.restaurant_delete_shift(uuid) from public;

grant execute on function public.restaurant_get_shifts(uuid, timestamptz, timestamptz) to authenticated, service_role;
grant execute on function public.restaurant_create_shift(uuid, uuid, timestamptz, text, text, text, text) to authenticated, service_role;
grant execute on function public.restaurant_update_shift(uuid, timestamptz, text, text, text, text, text) to authenticated, service_role;
grant execute on function public.restaurant_delete_shift(uuid) to authenticated, service_role;
