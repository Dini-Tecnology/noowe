-- Live queue stats for the customer waitlist screen: groups currently waiting,
-- an estimated wait time, and the restaurant's current table occupancy level.
-- Public read (matches the anon/authenticated read access already granted on
-- public.restaurants) — no customer-specific data is exposed.
create or replace function public.customer_waitlist_stats(p_restaurant_id uuid)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_groups_waiting integer;
  v_manual_avg numeric;
  v_estimated_wait integer;
  v_tables_total integer;
  v_tables_occupied integer;
  v_occupancy_ratio numeric;
  v_occupancy_level text;
begin
  select count(*) into v_groups_waiting
    from public.waitlist_entries
    where restaurant_id = p_restaurant_id and status = 'waiting';

  select avg(estimated_wait_minutes) into v_manual_avg
    from public.waitlist_entries
    where restaurant_id = p_restaurant_id and status = 'waiting' and estimated_wait_minutes is not null;

  v_estimated_wait := coalesce(
    ceil(v_manual_avg)::integer,
    least(90, greatest(5, v_groups_waiting * 8))
  );

  select count(*), count(*) filter (where status = 'occupied')
    into v_tables_total, v_tables_occupied
    from public.tables
    where restaurant_id = p_restaurant_id;

  v_occupancy_ratio := case when coalesce(v_tables_total, 0) = 0 then null
    else v_tables_occupied::numeric / v_tables_total end;

  v_occupancy_level := case
    when v_occupancy_ratio is null then 'indisponivel'
    when v_occupancy_ratio >= 0.75 then 'alta'
    when v_occupancy_ratio >= 0.4 then 'media'
    else 'baixa'
  end;

  return jsonb_build_object(
    'restaurantId', p_restaurant_id,
    'groupsWaiting', v_groups_waiting,
    'estimatedWaitMinutes', v_estimated_wait,
    'occupancyLevel', v_occupancy_level,
    'occupancyRatio', v_occupancy_ratio
  );
end $$;

revoke all on function public.customer_waitlist_stats(uuid) from public;
grant execute on function public.customer_waitlist_stats(uuid) to anon, authenticated;
