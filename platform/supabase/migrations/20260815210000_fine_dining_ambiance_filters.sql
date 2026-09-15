-- Fine Dining discovery filters: "Casual", "Bar", "Café" — the restaurant's
-- own style tags, so a customer browsing Fine Dining can narrow down to the
-- flavor of formality they want. These share the same
-- restaurants.service_config.amenities jsonb array casual dining's amenities
-- live in (see 20260815200000_casual_dining_experience.sql) and the same
-- containment-filtered read path in customer_backend.listRestaurants — the
-- two vocabularies never collide because a restaurant only carries one
-- service_type's tags at a time. Only the write-side vocabulary differs,
-- which is why this gets its own validated RPC pair.

create or replace function private.fine_dining_amenity_keys()
returns text[] language sql immutable as $$
  select array['casual', 'bar', 'cafe'];
$$;

create or replace function public.restaurant_get_fine_dining_amenities(p_restaurant_id uuid)
returns jsonb language plpgsql stable security definer
set search_path = public, private, pg_temp as $$
declare v_restaurant public.restaurants;
begin
  perform private.require_restaurant_role(
    p_restaurant_id,
    array['owner','manager']::public.user_roles_role_enum[]
  );
  select * into v_restaurant from public.restaurants where id = p_restaurant_id;
  if v_restaurant.id is null then raise exception 'Restaurant not found' using errcode = 'P0001'; end if;

  return jsonb_build_object(
    'restaurantId', p_restaurant_id,
    'amenities', coalesce((
      select jsonb_agg(value)
      from jsonb_array_elements_text(coalesce(v_restaurant.service_config->'amenities', '[]'::jsonb)) value
      where value = any(private.fine_dining_amenity_keys())
    ), '[]'::jsonb)
  );
end $$;

create or replace function public.restaurant_update_fine_dining_amenities(
  p_restaurant_id uuid, p_amenities text[]
) returns jsonb language plpgsql security definer
set search_path = public, private, pg_temp as $$
declare v_amenities jsonb; v_invalid text; v_existing jsonb;
begin
  perform private.require_restaurant_role(
    p_restaurant_id,
    array['owner','manager']::public.user_roles_role_enum[]
  );

  select a into v_invalid
  from unnest(coalesce(p_amenities, array[]::text[])) a
  where not (a = any(private.fine_dining_amenity_keys()))
  limit 1;
  if v_invalid is not null then
    raise exception 'Tag desconhecida: %', v_invalid using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(distinct a), '[]'::jsonb) into v_amenities
  from unnest(coalesce(p_amenities, array[]::text[])) a;

  select coalesce(service_config->'amenities', '[]'::jsonb) into v_existing
  from public.restaurants where id = p_restaurant_id;

  update public.restaurants
  set service_config = coalesce(service_config, '{}'::jsonb) || jsonb_build_object(
        'amenities',
        -- Keep anything already stored that isn't part of this vocabulary
        -- (e.g. free-text amenities set before this filter existed), replace
        -- only the fine dining tags themselves.
        (
          select coalesce(jsonb_agg(value), '[]'::jsonb)
          from jsonb_array_elements_text(v_existing) value
          where not (value = any(private.fine_dining_amenity_keys()))
        ) || v_amenities
      ),
      updated_at = now()
  where id = p_restaurant_id;

  return public.restaurant_get_fine_dining_amenities(p_restaurant_id);
end $$;

revoke all on function public.restaurant_get_fine_dining_amenities(uuid) from public;
revoke all on function public.restaurant_update_fine_dining_amenities(uuid, text[]) from public;
grant execute on function public.restaurant_get_fine_dining_amenities(uuid) to authenticated, service_role;
grant execute on function public.restaurant_update_fine_dining_amenities(uuid, text[]) to authenticated, service_role;
