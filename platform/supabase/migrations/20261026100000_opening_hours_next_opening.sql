-- Restaurante fechado hoje (ou sem mais turnos hoje): o status passa a trazer a PRÓXIMA abertura,
-- nos 7 dias seguintes, com `opensInDays` (0 = hoje, 1 = amanhã...) e `opensWeekday` (0 = domingo).
-- Antes só olhava os turnos de hoje e devolvia vazio, e o app mostrava "Fechado" sem horário.
create or replace function private.opening_hours_status(p_hours jsonb, p_local_now timestamp without time zone)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_weekdays constant text[] := array['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  v_now_time time := p_local_now::time;
  v_dow integer := extract(dow from p_local_now)::int;
  v_shift jsonb;
  v_open time;
  v_close time;
  v_is_open boolean := false;
  v_closes_at text;
  v_opens_at text;
  v_opens_in_days integer;
  v_opens_weekday integer;
  v_day_open time;
  v_d integer;
begin
  -- Turnos de hoje, em ordem de abertura.
  for v_shift in
    select value from jsonb_array_elements(
      private.opening_hours_day_shifts(p_hours -> v_weekdays[v_dow + 1]))
    order by value->>'open'
  loop
    v_open := (v_shift->>'open')::time;
    v_close := (v_shift->>'close')::time;
    if v_close > v_open then
      if v_now_time >= v_open and v_now_time < v_close then
        v_is_open := true; v_closes_at := to_char(v_close, 'HH24:MI');
      end if;
    elsif v_now_time >= v_open then
      -- Fecha depois da meia-noite: o turno de hoje vai até o horário de amanhã.
      v_is_open := true; v_closes_at := to_char(v_close, 'HH24:MI');
    end if;
    if v_opens_at is null and v_open > v_now_time then
      v_opens_at := to_char(v_open, 'HH24:MI');
      v_opens_in_days := 0;
      v_opens_weekday := v_dow;
    end if;
  end loop;

  -- Ainda dentro do turno de ontem que passou da meia-noite (ex.: 19:00–01:00).
  if not v_is_open then
    for v_shift in
      select value from jsonb_array_elements(
        private.opening_hours_day_shifts(p_hours -> v_weekdays[((v_dow + 6) % 7) + 1]))
    loop
      v_open := (v_shift->>'open')::time;
      v_close := (v_shift->>'close')::time;
      if v_close <= v_open and v_now_time < v_close then
        v_is_open := true; v_closes_at := to_char(v_close, 'HH24:MI');
      end if;
    end loop;
  end if;

  -- Fechado e sem mais turnos hoje: a próxima abertura é no primeiro dia seguinte que tiver turno.
  if not v_is_open and v_opens_at is null then
    for v_d in 1 .. 7 loop
      select min((value->>'open')::time) into v_day_open
      from jsonb_array_elements(
        private.opening_hours_day_shifts(p_hours -> v_weekdays[((v_dow + v_d) % 7) + 1]));
      if v_day_open is not null then
        v_opens_at := to_char(v_day_open, 'HH24:MI');
        v_opens_in_days := v_d;
        v_opens_weekday := (v_dow + v_d) % 7;
        exit;
      end if;
    end loop;
  end if;

  return jsonb_build_object('isOpen', v_is_open,
    'opensAt', case when v_is_open then null else v_opens_at end,
    'opensInDays', case when v_is_open then null else v_opens_in_days end,
    'opensWeekday', case when v_is_open then null else v_opens_weekday end,
    'closesAt', case when v_is_open then v_closes_at else null end);
end $$;

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
    'opensInDays', v_hours_status->'opensInDays',
    'opensWeekday', v_hours_status->'opensWeekday',
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
