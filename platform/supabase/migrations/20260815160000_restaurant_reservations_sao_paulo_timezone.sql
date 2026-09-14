-- Keep restaurant reservation calendar filters aligned with the customer app.
-- Reservations are stored as timestamptz, but their business date is the
-- America/Sao_Paulo calendar date rather than the UTC date.

create or replace function public.restaurant_get_reservations(
  p_restaurant_id uuid,
  p_date date default null,
  p_status text[] default null,
  p_limit integer default 100
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $$
declare
  result jsonb;
  v_time_zone constant text := 'America/Sao_Paulo';
  v_date date := coalesce(p_date, (now() at time zone v_time_zone)::date);
  v_start timestamptz := v_date::timestamp at time zone v_time_zone;
  v_end timestamptz := (v_date + 1)::timestamp at time zone v_time_zone;
begin
  perform private.require_restaurant_role(
    p_restaurant_id,
    array['owner','manager','maitre']::public.user_roles_role_enum[]
  );

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', r.id,
      'restaurant_id', r.restaurant_id,
      'customer_id', r.customer_id,
      'table_id', r.table_id,
      'table_number', t.table_number,
      'reservation_time', r.reservation_time,
      'party_size', r.party_size,
      'status', r.status,
      'special_requests', r.special_requests,
      'notes', r.notes,
      'created_at', r.created_at,
      'updated_at', r.updated_at,
      'customer', jsonb_build_object(
        'id', p.id,
        'full_name', p.full_name,
        'email', p.email,
        'phone', p.phone,
        'avatar_url', p.avatar_url
      )
    ) order by r.reservation_time asc
  ), '[]'::jsonb)
  into result
  from public.reservations r
  left join public.profiles p on p.id = r.customer_id
  left join public.tables t on t.id = r.table_id
  where r.restaurant_id = p_restaurant_id
    and (
      p_date is null
      or (r.reservation_time >= v_start and r.reservation_time < v_end)
    )
    and (p_status is null or r.status::text = any(p_status))
  limit greatest(1, least(coalesce(p_limit, 100), 300));

  return result;
end;
$$;

revoke all on function public.restaurant_get_reservations(uuid, date, text[], integer) from public;
grant execute on function public.restaurant_get_reservations(uuid, date, text[], integer)
  to authenticated, service_role;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'reservations'
    )
  then
    execute 'alter publication supabase_realtime add table public.reservations';
  end if;
end;
$$;
