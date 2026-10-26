-- Status ao vivo passa a dizer quantas mesas estão livres de fato.
--
-- `tablesOccupied` conta só `occupied`; mesa `reserved` ou `cleaning` também não recebe
-- ninguém pelo QR. O app usa `tablesAvailable` para desativar o "Escanear QR" e mandar o
-- cliente para a fila virtual quando não há nenhuma mesa livre.
create or replace function private.restaurant_live_status(p_restaurant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_time_zone constant text := 'America/Sao_Paulo';
  v_hours_status jsonb;
  v_is_open boolean;
  v_closes_at text;
  v_opens_at text;
  v_hours jsonb;
  v_groups_waiting integer;
  v_manual_avg numeric;
  v_estimated_wait integer;
  v_tables_total integer;
  v_tables_occupied integer;
  v_tables_available integer;
  v_occupancy_ratio numeric;
  v_occupancy_level text;
begin
  select coalesce(r.opening_hours, '{}'::jsonb) into v_hours
  from public.restaurants r where r.id = p_restaurant_id and r.is_active;
  if not found then return null; end if;

  v_hours_status := private.opening_hours_status(v_hours, now() at time zone v_time_zone);
  v_is_open := (v_hours_status->>'isOpen')::boolean;
  v_opens_at := v_hours_status->>'opensAt';
  v_closes_at := v_hours_status->>'closesAt';

  select count(*) into v_groups_waiting
    from public.waitlist_entries
    where restaurant_id = p_restaurant_id and status = 'waiting';

  select avg(estimated_wait_minutes) into v_manual_avg
    from public.waitlist_entries
    where restaurant_id = p_restaurant_id and status = 'waiting' and estimated_wait_minutes is not null;

  select count(*),
         count(*) filter (where status = 'occupied'),
         count(*) filter (where status = 'available')
    into v_tables_total, v_tables_occupied, v_tables_available
    from public.tables
    where restaurant_id = p_restaurant_id;

  v_occupancy_ratio := case when coalesce(v_tables_total, 0) = 0 then null
    else v_tables_occupied::numeric / v_tables_total end;

  -- With no manual estimate, wait grows with both the queue and how full the
  -- room already is — an empty room seats a walk-in immediately.
  v_estimated_wait := coalesce(
    ceil(v_manual_avg)::integer,
    case
      when v_groups_waiting = 0 and coalesce(v_occupancy_ratio, 0) < 0.75 then 0
      else least(90, greatest(5, v_groups_waiting * 8 + round(coalesce(v_occupancy_ratio, 0) * 20)::integer))
    end
  );

  v_occupancy_level := case
    when v_occupancy_ratio is null then 'indisponivel'
    when v_occupancy_ratio >= 0.75 then 'alta'
    when v_occupancy_ratio >= 0.4 then 'media'
    else 'baixa'
  end;

  return jsonb_build_object(
    'restaurantId', p_restaurant_id,
    'isOpen', v_is_open,
    'opensAt', v_opens_at,
    'closesAt', v_closes_at,
    'groupsWaiting', v_groups_waiting,
    'estimatedWaitMinutes', v_estimated_wait,
    'occupancyLevel', v_occupancy_level,
    'occupancyRatio', v_occupancy_ratio,
    'occupancyPercent', case when v_occupancy_ratio is null then null else round(v_occupancy_ratio * 100)::integer end,
    'tablesTotal', v_tables_total,
    'tablesOccupied', v_tables_occupied,
    'tablesAvailable', v_tables_available
  );
end $$;
