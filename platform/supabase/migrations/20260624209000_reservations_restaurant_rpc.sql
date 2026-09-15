-- Restaurant-side Reservations RPCs
-- Covers: list reservations for restaurant, update status, seat reservation

create index if not exists idx_reservations_restaurant_time
  on public.reservations(restaurant_id, reservation_time, status);

-- ─── get restaurant reservations ──────────────────────────────────────────────
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
  v_date date := coalesce(p_date, current_date);
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
  where r.restaurant_id = p_restaurant_id
    and (
      p_date is null
      or (r.reservation_time >= v_date::timestamptz
          and r.reservation_time < (v_date + 1)::timestamptz)
    )
    and (p_status is null or r.status::text = any(p_status))
  limit greatest(1, least(coalesce(p_limit, 100), 300));

  return result;
end;
$$;

-- ─── update reservation status ────────────────────────────────────────────────
create or replace function public.restaurant_update_reservation_status(
  p_reservation_id uuid,
  p_status text,
  p_table_id uuid default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_res record;
  v_updated record;
begin
  select * into v_res from public.reservations where id = p_reservation_id;
  if v_res.id is null then
    raise exception 'Reservation not found' using errcode = 'P0002';
  end if;

  perform private.require_restaurant_role(
    v_res.restaurant_id,
    array['owner','manager','maitre']::public.user_roles_role_enum[]
  );

  if p_status not in ('pending','confirmed','seated','completed','cancelled','no_show') then
    raise exception 'Invalid reservation status: %', p_status using errcode = '22023';
  end if;

  update public.reservations
  set
    status   = p_status::public.reservations_status_enum,
    table_id = coalesce(p_table_id, table_id),
    notes    = coalesce(p_notes, notes),
    updated_at = now()
  where id = p_reservation_id
  returning * into v_updated;

  -- if seated, mark table as occupied
  if p_status = 'seated' and v_updated.table_id is not null then
    update public.tables
    set status = 'occupied', occupied_since = now(), updated_at = now()
    where id = v_updated.table_id
      and restaurant_id = v_updated.restaurant_id;
  end if;

  return to_jsonb(v_updated);
end;
$$;

-- ─── waitlist (fila de espera) ────────────────────────────────────────────────
create or replace function public.restaurant_get_waitlist(
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
    array['owner','manager','maitre']::public.user_roles_role_enum[]
  );

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', we.id,
      'customer_name', we.customer_name,
      'customer_phone', we.customer_phone,
      'party_size', we.party_size,
      'preference', we.preference,
      'has_kids', we.has_kids,
      'status', we.status,
      'position', we.position,
      'estimated_wait_minutes', we.estimated_wait_minutes,
      'created_at', we.created_at,
      'customer', case when we.customer_id is not null then jsonb_build_object(
        'id', p.id, 'full_name', p.full_name, 'email', p.email
      ) else null end
    ) order by we.position asc nulls last, we.created_at asc
  ), '[]'::jsonb)
  into result
  from public.waitlist_entries we
  left join public.profiles p on p.id = we.customer_id
  where we.restaurant_id = p_restaurant_id
    and we.status in ('waiting','notified');

  return result;
end;
$$;

revoke all on function public.restaurant_get_reservations(uuid, date, text[], integer) from public;
revoke all on function public.restaurant_update_reservation_status(uuid, text, uuid, text) from public;
revoke all on function public.restaurant_get_waitlist(uuid) from public;

grant execute on function public.restaurant_get_reservations(uuid, date, text[], integer) to authenticated, service_role;
grant execute on function public.restaurant_update_reservation_status(uuid, text, uuid, text) to authenticated, service_role;
grant execute on function public.restaurant_get_waitlist(uuid) to authenticated, service_role;
