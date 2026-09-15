-- Service type is a required onboarding decision and the source of truth for
-- both the customer and restaurant operational journeys.

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'restaurants_service_type_catalog_check'
  ) then
    alter table public.restaurants
      add constraint restaurants_service_type_catalog_check
      check (service_type in (
        'fine_dining', 'casual_dining', 'quick_service', 'fast_casual',
        'cafe_bakery', 'buffet', 'pub_bar', 'drive_thru', 'food_truck',
        'chefs_table', 'club'
      )) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'restaurant_service_configs_type_catalog_check'
  ) then
    alter table public.restaurant_service_configs
      add constraint restaurant_service_configs_type_catalog_check
      check (service_type in (
        'fine_dining', 'casual_dining', 'quick_service', 'fast_casual',
        'cafe_bakery', 'buffet', 'pub_bar', 'drive_thru', 'food_truck',
        'chefs_table', 'club'
      )) not valid;
  end if;
end;
$$;

create or replace function public.create_my_restaurant(
  p_name text,
  p_phone text,
  p_email text,
  p_city text default 'São Paulo',
  p_state text default 'SP',
  p_address text default 'Endereço a definir',
  p_zip_code text default '00000-000',
  p_service_type text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing uuid;
  v_restaurant public.restaurants%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if nullif(trim(coalesce(p_name, '')), '') is null then
    raise exception 'Restaurant name is required' using errcode = '22023';
  end if;
  if nullif(trim(coalesce(p_phone, '')), '') is null then
    raise exception 'Restaurant phone is required' using errcode = '22023';
  end if;
  if nullif(trim(coalesce(p_email, '')), '') is null then
    raise exception 'Restaurant email is required' using errcode = '22023';
  end if;
  if p_service_type is null or p_service_type not in ('fine_dining', 'casual_dining', 'quick_service') then
    raise exception 'A supported service type is required' using errcode = '22023';
  end if;

  select r.id into v_existing
  from public.restaurants r
  where r.owner_id = v_user_id
  order by r.created_at asc
  limit 1;

  if v_existing is not null then
    insert into public.user_roles (user_id, restaurant_id, role, is_active, created_at, updated_at)
    values (v_user_id, v_existing, 'owner', true, now(), now())
    on conflict (user_id, restaurant_id, role) do update
      set is_active = true, updated_at = now();

    select * into v_restaurant from public.restaurants where id = v_existing;
    return to_jsonb(v_restaurant);
  end if;

  insert into public.restaurants (
    owner_id, name, address, city, state, zip_code, phone, email,
    service_type, service_config
  ) values (
    v_user_id,
    trim(p_name),
    coalesce(nullif(trim(p_address), ''), 'Endereço a definir'),
    coalesce(nullif(trim(p_city), ''), 'São Paulo'),
    coalesce(nullif(trim(p_state), ''), 'SP'),
    coalesce(nullif(trim(p_zip_code), ''), '00000-000'),
    trim(p_phone),
    lower(trim(p_email)),
    p_service_type,
    jsonb_build_object('primary_type', p_service_type, 'active_types', jsonb_build_array(p_service_type))
  )
  returning * into v_restaurant;

  insert into public.restaurant_service_configs (
    restaurant_id, service_type, is_active, config_metadata, created_at, updated_at
  )
  select v_restaurant.id, p_service_type, true, jsonb_build_object('features', '{}'::jsonb), now(), now()
  where not exists (
    select 1 from public.restaurant_service_configs
    where restaurant_id = v_restaurant.id and service_type = p_service_type
  );

  return to_jsonb(v_restaurant);
end;
$$;

revoke all on function public.create_my_restaurant(text, text, text, text, text, text, text, text) from public;
grant execute on function public.create_my_restaurant(text, text, text, text, text, text, text, text) to authenticated, service_role;

create or replace function public.restaurant_upsert_service_configs(
  p_restaurant_id uuid,
  p_configs jsonb,
  p_primary_service_type text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_config jsonb;
  v_type text;
  v_active boolean;
  v_active_count integer;
  v_primary_features jsonb := '{}'::jsonb;
  v_result jsonb;
begin
  perform private.require_restaurant_role(
    p_restaurant_id,
    array['owner','manager']::public.user_roles_role_enum[]
  );

  if jsonb_typeof(p_configs) <> 'array' or jsonb_array_length(p_configs) = 0 then
    raise exception 'At least one service configuration is required' using errcode = '22023';
  end if;

  if p_primary_service_type not in ('fine_dining', 'casual_dining', 'quick_service') then
    raise exception 'Primary service type is not supported by the customer app' using errcode = '22023';
  end if;

  if (
    select count(*) from jsonb_array_elements(p_configs)
  ) <> (
    select count(distinct value->>'service_type') from jsonb_array_elements(p_configs)
  ) then
    raise exception 'Duplicate service type configuration' using errcode = '22023';
  end if;

  select count(*) into v_active_count
  from jsonb_array_elements(p_configs) item
  where coalesce((item->>'is_active')::boolean, false);

  if v_active_count = 0 then
    raise exception 'At least one service type must remain active' using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_configs) item
    where coalesce((item->>'is_active')::boolean, false)
      and item->>'service_type' not in ('fine_dining', 'casual_dining', 'quick_service')
  ) then
    raise exception 'Only customer-app supported service types can be active' using errcode = '22023';
  end if;

  if not exists (
    select 1 from jsonb_array_elements(p_configs) item
    where item->>'service_type' = p_primary_service_type
      and coalesce((item->>'is_active')::boolean, false)
  ) then
    raise exception 'Primary service type must be active' using errcode = '22023';
  end if;

  for v_config in select value from jsonb_array_elements(p_configs)
  loop
    v_type := v_config->>'service_type';
    v_active := coalesce((v_config->>'is_active')::boolean, false);

    if v_type not in (
      'fine_dining', 'casual_dining', 'quick_service', 'fast_casual',
      'cafe_bakery', 'buffet', 'pub_bar', 'drive_thru', 'food_truck',
      'chefs_table', 'club'
    ) then
      raise exception 'Invalid service type: %', v_type using errcode = '22023';
    end if;

    update public.restaurant_service_configs
    set is_active = v_active,
        config_metadata = coalesce(v_config->'config_metadata', '{}'::jsonb),
        updated_at = now()
    where restaurant_id = p_restaurant_id and service_type = v_type;

    if not found then
      insert into public.restaurant_service_configs (
        restaurant_id, service_type, is_active, config_metadata, created_at, updated_at
      ) values (
        p_restaurant_id, v_type, v_active,
        coalesce(v_config->'config_metadata', '{}'::jsonb), now(), now()
      );
    end if;
  end loop;

  update public.restaurant_service_configs c
  set is_active = false, updated_at = now()
  where c.restaurant_id = p_restaurant_id
    and not exists (
      select 1 from jsonb_array_elements(p_configs) item
      where item->>'service_type' = c.service_type
    );

  select coalesce(item->'config_metadata'->'features', '{}'::jsonb)
  into v_primary_features
  from jsonb_array_elements(p_configs) item
  where item->>'service_type' = p_primary_service_type
  limit 1;

  update public.restaurants
  set service_type = p_primary_service_type,
      service_config = coalesce(service_config, '{}'::jsonb) || jsonb_build_object(
        'primary_type', p_primary_service_type,
        'active_types', (
          select coalesce(jsonb_agg(item->>'service_type'), '[]'::jsonb)
          from jsonb_array_elements(p_configs) item
          where coalesce((item->>'is_active')::boolean, false)
        ),
        'feature_overrides', coalesce(v_primary_features, '{}'::jsonb)
      ),
      updated_at = now()
  where id = p_restaurant_id;

  select coalesce(jsonb_agg(to_jsonb(c) order by c.service_type), '[]'::jsonb)
  into v_result
  from public.restaurant_service_configs c
  where c.restaurant_id = p_restaurant_id;

  return v_result;
end;
$$;

revoke all on function public.restaurant_upsert_service_configs(uuid, jsonb, text) from public;
grant execute on function public.restaurant_upsert_service_configs(uuid, jsonb, text) to authenticated, service_role;

-- The restaurant app needs the same effective feature inputs as the customer
-- app when switching units or rebuilding its role-aware navigation.
create or replace function public.get_my_restaurants()
returns jsonb
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', r.id,
      'name', r.name,
      'city', r.city,
      'state', r.state,
      'service_type', r.service_type,
      'service_config', r.service_config,
      'customer_experience', r.settings->'customer_experience',
      'logo_url', r.logo_url
    ) order by r.name
  ), '[]'::jsonb)
  from public.restaurants r
  where r.id = any(private.user_restaurant_ids(auth.uid()));
$$;

revoke all on function public.get_my_restaurants() from public;
grant execute on function public.get_my_restaurants() to authenticated;

-- Customer mutations enforce the same effective journey as the mobile UI.
create or replace function public.customer_create_reservation(
  p_restaurant_id uuid, p_reservation_time timestamptz, p_party_size integer,
  p_special_requests text default null
) returns public.reservations language plpgsql security definer
set search_path = public, private, pg_temp as $$
declare v_capacity integer; v_reserved integer; v_result public.reservations;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_party_size < 1 or p_party_size > 20 or p_reservation_time < now() + interval '30 minutes'
  then raise exception 'Invalid reservation request' using errcode = '22023'; end if;
  if not exists(
    select 1 from public.restaurants r
    where r.id = p_restaurant_id and r.is_active
      and r.service_type in ('fine_dining', 'casual_dining')
      and coalesce((r.service_config->'feature_overrides'->>'reservations')::boolean, true)
      and coalesce((r.settings->'customer_experience'->>'onlineReservations')::boolean, true)
      and coalesce((r.settings->'customer_experience'->>'journeyReservation')::boolean, true)
  ) then raise exception 'Reservations are unavailable for this restaurant' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtext(p_restaurant_id::text || date_trunc('hour', p_reservation_time)::text));
  select coalesce(sum(seats), 0)::integer into v_capacity from public.tables where restaurant_id = p_restaurant_id;
  select coalesce(sum(party_size), 0)::integer into v_reserved from public.reservations
    where restaurant_id = p_restaurant_id and status::text in ('pending','confirmed')
      and reservation_time between p_reservation_time - interval '90 minutes' and p_reservation_time + interval '90 minutes';
  if v_capacity = 0 or v_reserved + p_party_size > v_capacity
  then raise exception 'No availability for this time' using errcode = 'P0001'; end if;
  insert into public.reservations(restaurant_id, customer_id, reservation_time, party_size, special_requests, status)
    values(p_restaurant_id, auth.uid(), p_reservation_time, p_party_size, nullif(trim(p_special_requests), ''), 'pending')
    returning * into v_result;
  return v_result;
end $$;

create or replace function public.customer_join_waitlist(
  p_restaurant_id uuid, p_party_size integer, p_preference text default 'qualquer', p_has_kids boolean default false
) returns public.waitlist_entries language plpgsql security definer
set search_path = public, private, pg_temp as $$
declare v_profile public.profiles; v_entry public.waitlist_entries; v_position integer;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_party_size < 1 or p_party_size > 20 then raise exception 'Invalid party size' using errcode = '22023'; end if;
  if not exists(
    select 1 from public.restaurants r
    where r.id = p_restaurant_id and r.is_active
      and r.service_type in ('fine_dining', 'casual_dining', 'quick_service')
      and coalesce((r.service_config->'feature_overrides'->>'virtualQueue')::boolean, true)
      and coalesce((r.settings->'customer_experience'->>'waitlist')::boolean, true)
      and coalesce((r.settings->'customer_experience'->>'journeyArrival')::boolean, true)
  ) then raise exception 'Waitlist is unavailable for this restaurant' using errcode = 'P0001'; end if;
  if exists(select 1 from public.waitlist_entries where customer_id = auth.uid() and restaurant_id = p_restaurant_id and status = 'waiting')
    then raise exception 'Already on waitlist' using errcode = '23505'; end if;
  select * into v_profile from public.profiles where id = auth.uid();
  select coalesce(max(position),0)+1 into v_position from public.waitlist_entries
    where restaurant_id = p_restaurant_id and status = 'waiting';
  insert into public.waitlist_entries(restaurant_id, customer_id, customer_name, customer_phone,
    party_size, preference, has_kids, status, position, created_at, updated_at)
  values(p_restaurant_id, auth.uid(), coalesce(v_profile.full_name,'Cliente'), v_profile.phone,
    p_party_size, p_preference::public.waitlist_entries_preference_enum, p_has_kids, 'waiting', v_position, now(), now())
  returning * into v_entry;
  return v_entry;
end $$;

create or replace function public.customer_place_order(
  p_restaurant_id uuid, p_table_session_id uuid, p_items jsonb, p_client_request_id uuid
) returns jsonb language plpgsql security definer
set search_path = public, private, pg_temp as $$
declare
  v_session public.table_sessions;
  v_existing public.orders;
  v_result jsonb;
  v_order_id uuid;
  v_order_type text;
  v_table_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;

  select * into v_existing from public.orders
  where customer_id = auth.uid() and client_request_id = p_client_request_id;
  if v_existing.id is not null then
    select jsonb_build_object(
      'id', o.id,
      'restaurant_id', o.restaurant_id,
      'table_id', o.table_id,
      'status', o.status,
      'subtotal', o.subtotal,
      'total_amount', o.total_amount,
      'order_items', private.order_items_json(o.id)
    ) into v_result
    from public.orders o
    where o.id = v_existing.id;
    return v_result;
  end if;

  if not exists (
    select 1 from public.restaurants r
    where r.id = p_restaurant_id and r.is_active
      and r.service_type in ('fine_dining', 'casual_dining', 'quick_service')
      and coalesce((r.service_config->'feature_overrides'->>'ordering')::boolean, true)
      and coalesce((r.settings->'customer_experience'->>'journeyOrder')::boolean, true)
  ) then raise exception 'Ordering is unavailable for this restaurant' using errcode = 'P0001'; end if;

  if p_table_session_id is not null then
    select s.* into v_session from public.table_sessions s
    join public.table_session_participants p on p.table_session_id = s.id
    join public.restaurants r on r.id = s.restaurant_id
    where s.id = p_table_session_id and s.restaurant_id = p_restaurant_id
      and p.user_id = auth.uid() and s.status = 'active'
      and r.service_type in ('fine_dining', 'casual_dining')
      and coalesce((r.service_config->'feature_overrides'->>'qrOrdering')::boolean, true)
      and coalesce((r.settings->'customer_experience'->>'qrOrdering')::boolean, true);
    if v_session.id is null then raise exception 'Active table session required' using errcode = 'P0001'; end if;
    v_order_type := 'dine_in';
    v_table_id := v_session.table_id;
  else
    if not exists (
      select 1 from public.restaurants r
      where r.id = p_restaurant_id and r.is_active and r.service_type = 'quick_service'
    ) then raise exception 'Active table session required' using errcode = 'P0001'; end if;
    v_order_type := 'pickup';
    v_table_id := null;
  end if;

  v_result := public.place_order(p_restaurant_id, v_order_type, p_items, v_table_id, null, null, null);
  v_order_id := (v_result->>'id')::uuid;

  update public.orders
  set client_request_id = p_client_request_id,
      table_session_id = v_session.id,
      metadata = coalesce(metadata, '{}'::jsonb)
        || case when v_session.id is not null
             then jsonb_build_object('table_session_id', v_session.id)
             else '{}'::jsonb end
  where id = v_order_id;

  if v_session.id is not null then
    update public.table_sessions
    set total_orders = total_orders + 1, last_activity = now(), updated_at = now()
    where id = v_session.id;
  end if;

  return v_result;
end $$;

drop function if exists public.customer_call_waiter(uuid, uuid, text);
create or replace function public.customer_call_waiter(
  p_restaurant_id uuid,
  p_table_id uuid,
  p_message text default null,
  p_call_type text default 'help'
) returns jsonb language plpgsql security definer
set search_path = public, private, pg_temp as $$
declare v_call public.service_calls; v_type text;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if not exists (
    select 1 from public.restaurants r
    where r.id = p_restaurant_id and r.is_active
      and r.service_type in ('fine_dining', 'casual_dining')
      and coalesce((r.service_config->'feature_overrides'->>'callWaiter')::boolean, true)
      and coalesce((r.settings->'customer_experience'->>'tableService')::boolean, true)
  ) then raise exception 'This restaurant does not offer table service' using errcode = 'P0001'; end if;
  v_type := case when p_call_type in ('waiter', 'sommelier', 'help', 'bill') then p_call_type else 'help' end;
  if not exists (
    select 1 from public.table_sessions s
    left join public.table_session_participants p
      on p.table_session_id = s.id and p.user_id = auth.uid()
    where s.restaurant_id = p_restaurant_id and s.table_id = p_table_id
      and (s.customer_id = auth.uid() or s.primary_user_id = auth.uid() or p.user_id = auth.uid())
      and s.status = 'active'
  ) then raise exception 'Active table session required' using errcode = 'P0001'; end if;
  select * into v_call from public.service_calls
    where restaurant_id = p_restaurant_id and table_id = p_table_id and user_id = auth.uid()
      and call_type = v_type and status in ('pending','acknowledged')
    order by created_at desc limit 1;
  if v_call.id is null then
    insert into public.service_calls(restaurant_id, table_id, user_id, call_type, status, message,
      called_at, created_at, updated_at)
    values(p_restaurant_id, p_table_id, auth.uid(), v_type, 'pending', nullif(trim(p_message), ''),
      now(), now(), now()) returning * into v_call;
  end if;
  return to_jsonb(v_call);
end $$;

revoke all on function public.customer_place_order(uuid, uuid, jsonb, uuid) from public;
grant execute on function public.customer_place_order(uuid, uuid, jsonb, uuid) to authenticated;
revoke all on function public.customer_call_waiter(uuid, uuid, text, text) from public;
grant execute on function public.customer_call_waiter(uuid, uuid, text, text) to authenticated;
