-- O3, critério 6 (ADR-025): a escala registra pessoa, função, área e estação. Só a função que a pessoa tem pode ser escalada.
-- A área segue como texto, validada contra as seções das mesas: a tabela de áreas é da O5. Rotear por estação é da O7.
alter table public.shifts
  add column area text,
  add column station_id uuid references public.cook_stations(id) on delete set null;

-- Versões antigas do app ainda mandam o rótulo digitado: o conhecido vira a função, e o resto fica sem função.
create or replace function private.shift_role(p_role text)
returns text language sql immutable as $$
  select case lower(btrim(coalesce(p_role, '')))
    when 'owner' then 'owner' when 'dono' then 'owner'
    when 'manager' then 'manager' when 'gerente' then 'manager'
    when 'maitre' then 'maitre' when 'maître' then 'maitre'
    when 'chef' then 'chef'
    when 'barman' then 'barman'
    when 'cook' then 'cook' when 'cozinheiro' then 'cook'
    when 'waiter' then 'waiter' when 'garçom' then 'waiter' when 'garcom' then 'waiter'
  end
$$;
revoke all on function private.shift_role(text) from public, anon, authenticated;
update public.shifts set role = private.shift_role(role) where role is not null;

create or replace function private.assert_shift_assignment(p_restaurant uuid, p_staff uuid, p_role text, p_area text, p_station uuid)
returns void language plpgsql stable security definer set search_path = public, private, pg_temp as $$
begin
  if p_role is not null and not p_role = any(private.user_effective_roles(p_restaurant, p_staff)) then
    raise exception 'A pessoa não tem esta função' using errcode = '22023';
  end if;
  if nullif(btrim(p_area), '') is not null and not exists (
      select 1 from unnest(private.restaurant_sections(p_restaurant)) a
      where private.normalize_section_name(a) = private.normalize_section_name(p_area)) then
    raise exception 'Área não encontrada nas mesas do restaurante' using errcode = '22023';
  end if;
  if p_station is not null and not exists (
      select 1 from public.cook_stations c where c.id = p_station and c.restaurant_id = p_restaurant) then
    raise exception 'Estação não encontrada neste restaurante' using errcode = '22023';
  end if;
end $$;
revoke all on function private.assert_shift_assignment(uuid, uuid, text, text, uuid) from public, anon, authenticated;

create or replace function public.restaurant_get_shift_options(p_restaurant_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, private, pg_temp as $$
begin
  perform private.require_restaurant_role(p_restaurant_id, array['owner','manager']::public.user_roles_role_enum[]);
  return jsonb_build_object('areas', to_jsonb(private.restaurant_sections(p_restaurant_id)),
    'stations', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', coalesce(c.display_name, c.name)) order by c.display_order, c.name)
      from public.cook_stations c where c.restaurant_id = p_restaurant_id and c.is_active), '[]'::jsonb));
end $$;
revoke all on function public.restaurant_get_shift_options(uuid) from public, anon;
grant execute on function public.restaurant_get_shift_options(uuid) to authenticated, service_role;

drop function public.restaurant_create_shift(uuid, uuid, timestamptz, text, text, text, text);
drop function public.restaurant_update_shift(uuid, timestamptz, text, text, text, text, text);

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
      'area', s.area,
      'station_id', s.station_id,
      'station_name', coalesce(c.display_name, c.name),
      'status', s.status,
      'notes', s.notes
    ) order by s.date asc, s.start_time asc
  ), '[]'::jsonb)
  into result
  from public.shifts s
  join public.profiles p on p.id = s.staff_id
  left join public.cook_stations c on c.id = s.station_id
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
  p_notes text default null,
  p_area text default null,
  p_station_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_shift record;
  v_role text := private.shift_role(p_role);
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
  perform private.assert_shift_assignment(p_restaurant_id, p_staff_id, v_role, p_area, p_station_id);

  insert into public.shifts(
    staff_id, restaurant_id, date, start_time, end_time, role, area, station_id, status,
    is_overtime, notes, created_at, updated_at
  )
  values (
    p_staff_id, p_restaurant_id, p_date, p_start_time, p_end_time, v_role, nullif(btrim(p_area), ''), p_station_id, 'scheduled',
    false, p_notes, now(), now()
  )
  returning * into v_shift;

  return to_jsonb(v_shift);
end;
$$;

-- Campo nulo mantém o valor; área vazia e p_clear_station limpam.
create or replace function public.restaurant_update_shift(
  p_shift_id uuid,
  p_date timestamptz default null,
  p_start_time text default null,
  p_end_time text default null,
  p_role text default null,
  p_status text default null,
  p_notes text default null,
  p_area text default null,
  p_station_id uuid default null,
  p_clear_station boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_shift record;
  v_updated record;
  v_role text;
  v_area text;
  v_station uuid;
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

  v_role := coalesce(private.shift_role(p_role), v_shift.role);
  v_area := case when p_area is null then v_shift.area else nullif(btrim(p_area), '') end;
  v_station := case when p_clear_station then null else coalesce(p_station_id, v_shift.station_id) end;
  perform private.assert_shift_assignment(v_shift.restaurant_id, v_shift.staff_id, v_role, v_area, v_station);

  update public.shifts
  set
    date       = coalesce(p_date, date),
    start_time = coalesce(p_start_time, start_time),
    end_time   = coalesce(p_end_time, end_time),
    role       = v_role,
    area       = v_area,
    station_id = v_station,
    status     = coalesce(p_status, status),
    notes      = coalesce(p_notes, notes),
    updated_at = now()
  where id = p_shift_id
  returning * into v_updated;

  return to_jsonb(v_updated);
end;
$$;

revoke all on function public.restaurant_create_shift(uuid, uuid, timestamptz, text, text, text, text, text, uuid) from public, anon;
revoke all on function public.restaurant_update_shift(uuid, timestamptz, text, text, text, text, text, text, uuid, boolean) from public, anon;
grant execute on function public.restaurant_create_shift(uuid, uuid, timestamptz, text, text, text, text, text, uuid) to authenticated, service_role;
grant execute on function public.restaurant_update_shift(uuid, timestamptz, text, text, text, text, text, text, uuid, boolean) to authenticated, service_role;

create or replace function private.manager_on_shift(p_restaurant uuid)
returns boolean language sql stable security definer set search_path = public, private, pg_temp as $$
  with agora as (select (now() at time zone private.restaurant_time_zone()) as local)
  select exists (
    select 1 from public.shifts s, agora
    where s.restaurant_id = p_restaurant and s.status in ('scheduled', 'in_progress')
      and s.date::date in (agora.local::date, agora.local::date - 1)
      and private.shift_covers(s.date::date, s.start_time, s.end_time, agora.local)
      -- Vale a função escalada: Gerente e Garçom escalado como Garçom não conta. Sem função na escala, vale o que a pessoa é.
      and (s.role = 'manager' or (s.role is null and exists (select 1 from public.user_roles ur
        where ur.user_id = s.staff_id and ur.restaurant_id = p_restaurant and ur.role = 'manager' and ur.is_active)))
  )
$$;
