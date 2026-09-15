-- Restaurant Profile & Settings RPCs
-- Covers: get profile, update profile, business hours, get reports summary

-- ─── get restaurant profile ───────────────────────────────────────────────────
create or replace function public.restaurant_get_profile(
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

  select to_jsonb(r)
  into result
  from public.restaurants r
  where r.id = p_restaurant_id;

  return result;
end;
$$;

-- ─── update restaurant profile ────────────────────────────────────────────────
create or replace function public.restaurant_update_profile(
  p_restaurant_id uuid,
  p_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_updated record;
  v_allowed_fields text[] := array[
    'name','description','address','phone','email','logo_url','cover_image_url',
    'cuisine_type','price_range','business_hours','features','settings',
    'max_party_size','average_prep_time','is_active'
  ];
  v_field text;
  v_invalid text[];
begin
  perform private.require_restaurant_role(
    p_restaurant_id,
    array['owner','manager']::public.user_roles_role_enum[]
  );

  -- validate only allowed fields
  select array_agg(k) into v_invalid
  from jsonb_object_keys(p_patch) k
  where k <> all(v_allowed_fields);

  if v_invalid is not null and cardinality(v_invalid) > 0 then
    raise exception 'Invalid profile fields: %', array_to_string(v_invalid, ', ')
      using errcode = '22023';
  end if;

  update public.restaurants
  set
    name             = coalesce(p_patch->>'name', name),
    description      = coalesce(p_patch->>'description', description),
    address          = coalesce(p_patch->'address', address),
    phone            = coalesce(p_patch->>'phone', phone),
    email            = coalesce(p_patch->>'email', email),
    logo_url         = coalesce(p_patch->>'logo_url', logo_url),
    cover_image_url  = coalesce(p_patch->>'cover_image_url', cover_image_url),
    cuisine_type     = coalesce(p_patch->>'cuisine_type', cuisine_type),
    price_range      = coalesce(p_patch->>'price_range', price_range),
    business_hours   = coalesce(p_patch->'business_hours', business_hours),
    features         = coalesce(p_patch->'features', features),
    settings         = coalesce(p_patch->'settings', settings),
    max_party_size   = coalesce((p_patch->>'max_party_size')::integer, max_party_size),
    average_prep_time = coalesce((p_patch->>'average_prep_time')::integer, average_prep_time),
    updated_at       = now()
  where id = p_restaurant_id
  returning * into v_updated;

  return to_jsonb(v_updated);
end;
$$;

-- ─── reports / analytics summary ─────────────────────────────────────────────
create or replace function public.restaurant_get_reports(
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
  v_from timestamptz := coalesce(p_from, date_trunc('month', current_date)::timestamptz);
  v_to   timestamptz := coalesce(p_to, (current_date + 1)::timestamptz);
  result jsonb;
begin
  perform private.require_restaurant_role(
    p_restaurant_id,
    array['owner','manager']::public.user_roles_role_enum[]
  );

  select jsonb_build_object(
    'period', jsonb_build_object('from', v_from, 'to', v_to),
    'orders', jsonb_build_object(
      'total', count(*),
      'completed', count(*) filter (where status::text in ('delivered','completed')),
      'cancelled', count(*) filter (where status::text = 'cancelled'),
      'completion_rate', round(
        100.0 * count(*) filter (where status::text in ('delivered','completed'))
          / nullif(count(*), 0), 1
      )
    ),
    'revenue', jsonb_build_object(
      'total', coalesce(sum(total_amount) filter (where status::text in ('delivered','completed')), 0),
      'average', coalesce(avg(total_amount) filter (where status::text in ('delivered','completed')), 0),
      'tips',    coalesce(sum(tip_amount) filter (where status::text in ('delivered','completed')), 0)
    ),
    'by_day', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'date', day,
          'orders', cnt,
          'revenue', rev
        ) order by day
      ), '[]'::jsonb)
      from (
        select
          date_trunc('day', o2.created_at at time zone 'America/Sao_Paulo')::date as day,
          count(*) as cnt,
          coalesce(sum(o2.total_amount), 0) as rev
        from public.orders o2
        where o2.restaurant_id = p_restaurant_id
          and o2.created_at >= v_from
          and o2.created_at <  v_to
          and o2.status::text in ('delivered','completed')
        group by 1
      ) d
    ),
    'by_order_type', jsonb_build_object(
      'dine_in',  coalesce(sum(total_amount) filter (where order_type = 'dine_in'  and status::text in ('delivered','completed')), 0),
      'pickup',   coalesce(sum(total_amount) filter (where order_type = 'pickup'   and status::text in ('delivered','completed')), 0),
      'delivery', coalesce(sum(total_amount) filter (where order_type = 'delivery' and status::text in ('delivered','completed')), 0)
    )
  )
  into result
  from public.orders
  where restaurant_id = p_restaurant_id
    and created_at >= v_from
    and created_at <  v_to;

  return result;
end;
$$;

revoke all on function public.restaurant_get_profile(uuid) from public;
revoke all on function public.restaurant_update_profile(uuid, jsonb) from public;
revoke all on function public.restaurant_get_reports(uuid, timestamptz, timestamptz) from public;

grant execute on function public.restaurant_get_profile(uuid) to authenticated, service_role;
grant execute on function public.restaurant_update_profile(uuid, jsonb) to authenticated, service_role;
grant execute on function public.restaurant_get_reports(uuid, timestamptz, timestamptz) to authenticated, service_role;
