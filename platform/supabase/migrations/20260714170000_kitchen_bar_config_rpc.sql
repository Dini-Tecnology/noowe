-- Kitchen & Bar config: station CRUD + richer KDS config fields.
-- Also supports ConfigKitchenScreen in the restaurant mobile app.

alter table public.cook_stations
  add column if not exists description text,
  add column if not exists kds_label text;

alter table public.cook_stations
  alter column type set default 'kitchen',
  alter column late_threshold_minutes set default 15,
  alter column display_order set default 0,
  alter column is_active set default true,
  alter column created_at set default now(),
  alter column updated_at set default now();

alter table public.kds_brain_configs
  add column if not exists kds_screens numeric,
  add column if not exists default_prep_minutes numeric,
  add column if not exists auto_routing boolean,
  add column if not exists priority_alerts boolean,
  add column if not exists fire_order_enabled boolean,
  add column if not exists batch_cooking boolean;

alter table public.kds_brain_configs
  alter column kds_screens set default 2,
  alter column default_prep_minutes set default 15,
  alter column auto_routing set default true,
  alter column priority_alerts set default true,
  alter column fire_order_enabled set default true,
  alter column batch_cooking set default false;

update public.kds_brain_configs
set
  kds_screens = coalesce(kds_screens, 2),
  default_prep_minutes = coalesce(default_prep_minutes, course_gap_minutes, 15),
  auto_routing = coalesce(auto_routing, true),
  priority_alerts = coalesce(priority_alerts, sound_enabled, true),
  fire_order_enabled = coalesce(fire_order_enabled, true),
  batch_cooking = coalesce(batch_cooking, false);

-- ─── list stations (active only, with prep metadata) ─────────────────────────
create or replace function public.restaurant_get_cook_stations(
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
  perform private.require_restaurant_role(p_restaurant_id);

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', cs.id,
      'name', cs.name,
      'station_type', coalesce(cs.station_type, cs.type, 'kitchen'),
      'display_color', cs.display_color,
      'is_active', cs.is_active,
      'printer_ip', cs.printer_ip,
      'display_name', coalesce(cs.display_name, cs.name),
      'description', cs.description,
      'kds_label', cs.kds_label,
      'late_threshold_minutes', cs.late_threshold_minutes,
      'display_order', cs.display_order
    ) order by cs.display_order, cs.name
  ), '[]'::jsonb)
  into result
  from public.cook_stations cs
  where cs.restaurant_id = p_restaurant_id
    and cs.is_active = true;

  return result;
end;
$$;

-- ─── create station ──────────────────────────────────────────────────────────
create or replace function public.restaurant_create_cook_station(
  p_restaurant_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_name text := nullif(trim(coalesce(p_payload->>'name', '')), '');
  v_type text := coalesce(nullif(trim(p_payload->>'station_type'), ''), 'kitchen');
  v_row record;
  v_order numeric;
begin
  perform private.require_restaurant_role(
    p_restaurant_id,
    array['owner','manager','chef']::public.user_roles_role_enum[]
  );

  if v_name is null then
    raise exception 'Station name is required' using errcode = '22023';
  end if;

  select coalesce(max(display_order), 0) + 1
  into v_order
  from public.cook_stations
  where restaurant_id = p_restaurant_id;

  insert into public.cook_stations (
    restaurant_id,
    name,
    type,
    station_type,
    display_color,
    display_name,
    description,
    kds_label,
    late_threshold_minutes,
    display_order,
    is_active,
    created_at,
    updated_at
  )
  values (
    p_restaurant_id,
    v_name,
    v_type,
    v_type,
    nullif(trim(coalesce(p_payload->>'display_color', '')), ''),
    coalesce(nullif(trim(p_payload->>'display_name'), ''), v_name),
    nullif(trim(coalesce(p_payload->>'description', '')), ''),
    nullif(trim(coalesce(p_payload->>'kds_label', '')), ''),
    coalesce((p_payload->>'late_threshold_minutes')::numeric, 15),
    coalesce((p_payload->>'display_order')::numeric, v_order),
    true,
    now(),
    now()
  )
  returning * into v_row;

  return jsonb_build_object(
    'id', v_row.id,
    'name', v_row.name,
    'station_type', coalesce(v_row.station_type, v_row.type, 'kitchen'),
    'display_color', v_row.display_color,
    'is_active', v_row.is_active,
    'printer_ip', v_row.printer_ip,
    'display_name', coalesce(v_row.display_name, v_row.name),
    'description', v_row.description,
    'kds_label', v_row.kds_label,
    'late_threshold_minutes', v_row.late_threshold_minutes,
    'display_order', v_row.display_order
  );
end;
$$;

-- ─── update station ──────────────────────────────────────────────────────────
create or replace function public.restaurant_update_cook_station(
  p_station_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_existing record;
  v_row record;
  v_type text;
begin
  select * into v_existing from public.cook_stations where id = p_station_id;
  if v_existing.id is null then
    raise exception 'Station not found' using errcode = 'P0002';
  end if;

  perform private.require_restaurant_role(
    v_existing.restaurant_id,
    array['owner','manager','chef']::public.user_roles_role_enum[]
  );

  v_type := coalesce(
    nullif(trim(p_payload->>'station_type'), ''),
    v_existing.station_type,
    v_existing.type,
    'kitchen'
  );

  update public.cook_stations
  set
    name = coalesce(nullif(trim(p_payload->>'name'), ''), name),
    type = v_type,
    station_type = v_type,
    display_color = case
      when p_payload ? 'display_color' then nullif(trim(p_payload->>'display_color'), '')
      else display_color
    end,
    display_name = coalesce(nullif(trim(p_payload->>'display_name'), ''), display_name, name),
    description = case
      when p_payload ? 'description' then nullif(trim(p_payload->>'description'), '')
      else description
    end,
    kds_label = case
      when p_payload ? 'kds_label' then nullif(trim(p_payload->>'kds_label'), '')
      else kds_label
    end,
    late_threshold_minutes = coalesce(
      (p_payload->>'late_threshold_minutes')::numeric,
      late_threshold_minutes
    ),
    display_order = coalesce((p_payload->>'display_order')::numeric, display_order),
    updated_at = now()
  where id = p_station_id
  returning * into v_row;

  return jsonb_build_object(
    'id', v_row.id,
    'name', v_row.name,
    'station_type', coalesce(v_row.station_type, v_row.type, 'kitchen'),
    'display_color', v_row.display_color,
    'is_active', v_row.is_active,
    'printer_ip', v_row.printer_ip,
    'display_name', coalesce(v_row.display_name, v_row.name),
    'description', v_row.description,
    'kds_label', v_row.kds_label,
    'late_threshold_minutes', v_row.late_threshold_minutes,
    'display_order', v_row.display_order
  );
end;
$$;

-- ─── soft-delete station ─────────────────────────────────────────────────────
create or replace function public.restaurant_delete_cook_station(
  p_station_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_existing record;
  v_row record;
begin
  select * into v_existing from public.cook_stations where id = p_station_id;
  if v_existing.id is null then
    raise exception 'Station not found' using errcode = 'P0002';
  end if;

  perform private.require_restaurant_role(
    v_existing.restaurant_id,
    array['owner','manager','chef']::public.user_roles_role_enum[]
  );

  update public.cook_stations
  set is_active = false, updated_at = now()
  where id = p_station_id
  returning * into v_row;

  return jsonb_build_object('id', v_row.id, 'deleted', true);
end;
$$;

-- ─── get/update KDS config (extended) ────────────────────────────────────────
create or replace function public.restaurant_get_kds_config(
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
  perform private.require_restaurant_role(p_restaurant_id);

  select to_jsonb(k)
  into result
  from public.kds_brain_configs k
  where k.restaurant_id = p_restaurant_id
  limit 1;

  return coalesce(result, jsonb_build_object(
    'restaurant_id', p_restaurant_id,
    'course_gap_mode', 'time',
    'course_gap_minutes', 5,
    'delivery_buffer_minutes', 10,
    'auto_accept_delivery', false,
    'sound_enabled', true,
    'sound_volume', 0.8,
    'kds_screens', 2,
    'default_prep_minutes', 15,
    'auto_routing', true,
    'priority_alerts', true,
    'fire_order_enabled', true,
    'batch_cooking', false
  ));
end;
$$;

create or replace function public.restaurant_update_kds_config(
  p_restaurant_id uuid,
  p_config jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_result record;
begin
  perform private.require_restaurant_role(
    p_restaurant_id,
    array['owner','manager','chef']::public.user_roles_role_enum[]
  );

  insert into public.kds_brain_configs(
    restaurant_id,
    course_gap_mode,
    course_gap_minutes,
    delivery_buffer_minutes,
    auto_accept_delivery,
    sound_enabled,
    sound_volume,
    kds_screens,
    default_prep_minutes,
    auto_routing,
    priority_alerts,
    fire_order_enabled,
    batch_cooking,
    created_at,
    updated_at
  )
  values (
    p_restaurant_id,
    'time',
    5,
    10,
    false,
    true,
    0.8,
    2,
    15,
    true,
    true,
    true,
    false,
    now(),
    now()
  )
  on conflict (restaurant_id) do nothing;

  update public.kds_brain_configs
  set
    course_gap_mode = coalesce(p_config->>'course_gap_mode', course_gap_mode),
    course_gap_minutes = coalesce((p_config->>'course_gap_minutes')::numeric, course_gap_minutes),
    delivery_buffer_minutes = coalesce((p_config->>'delivery_buffer_minutes')::numeric, delivery_buffer_minutes),
    auto_accept_delivery = coalesce((p_config->>'auto_accept_delivery')::boolean, auto_accept_delivery),
    sound_enabled = coalesce((p_config->>'sound_enabled')::boolean, sound_enabled),
    sound_volume = coalesce((p_config->>'sound_volume')::numeric, sound_volume),
    kds_screens = coalesce((p_config->>'kds_screens')::numeric, kds_screens),
    default_prep_minutes = coalesce((p_config->>'default_prep_minutes')::numeric, default_prep_minutes),
    auto_routing = coalesce((p_config->>'auto_routing')::boolean, auto_routing),
    priority_alerts = coalesce((p_config->>'priority_alerts')::boolean, priority_alerts),
    fire_order_enabled = coalesce((p_config->>'fire_order_enabled')::boolean, fire_order_enabled),
    batch_cooking = coalesce((p_config->>'batch_cooking')::boolean, batch_cooking),
    updated_at = now()
  where restaurant_id = p_restaurant_id
  returning * into v_result;

  return to_jsonb(v_result);
end;
$$;

revoke all on function public.restaurant_create_cook_station(uuid, jsonb) from public;
revoke all on function public.restaurant_update_cook_station(uuid, jsonb) from public;
revoke all on function public.restaurant_delete_cook_station(uuid) from public;

grant execute on function public.restaurant_create_cook_station(uuid, jsonb) to authenticated, service_role;
grant execute on function public.restaurant_update_cook_station(uuid, jsonb) to authenticated, service_role;
grant execute on function public.restaurant_delete_cook_station(uuid) to authenticated, service_role;
grant execute on function public.restaurant_get_cook_stations(uuid) to authenticated, service_role;
grant execute on function public.restaurant_get_kds_config(uuid) to authenticated, service_role;
grant execute on function public.restaurant_update_kds_config(uuid, jsonb) to authenticated, service_role;
