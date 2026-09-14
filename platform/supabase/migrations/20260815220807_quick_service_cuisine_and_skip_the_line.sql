-- Quick Service discovery sub-tags: cuisine chips (Burgers/Pizza/Açaí/
-- Saudável) and the Skip the Line toggle. The client's HomeScreen already
-- filters on these (QUICK_SERVICE_FILTERS in quick-service-ui.ts, matching
-- `restaurants.cuisine_types` and `restaurant_service_configs
-- .skip_the_line_enabled`) but until now there was no restaurant-side write
-- path — owners had no way to set either field. Mirrors the fine dining
-- ambiance RPC pair (20260815210000_fine_dining_ambiance_filters.sql).

create or replace function private.quick_service_cuisine_keys()
returns text[] language sql immutable as $$
  select array['burgers', 'pizza', 'acai', 'saudavel'];
$$;

create or replace function public.restaurant_get_quick_service_config(p_restaurant_id uuid)
returns jsonb language plpgsql stable security definer
set search_path = public, private, pg_temp as $$
declare v_restaurant public.restaurants; v_skip_the_line boolean;
begin
  perform private.require_restaurant_role(
    p_restaurant_id,
    array['owner','manager']::public.user_roles_role_enum[]
  );
  select * into v_restaurant from public.restaurants where id = p_restaurant_id;
  if v_restaurant.id is null then raise exception 'Restaurant not found' using errcode = 'P0001'; end if;

  select c.skip_the_line_enabled into v_skip_the_line
  from public.restaurant_service_configs c
  where c.restaurant_id = p_restaurant_id and c.service_type = 'quick_service';

  return jsonb_build_object(
    'restaurantId', p_restaurant_id,
    'cuisineTags', coalesce((
      select jsonb_agg(value)
      from jsonb_array_elements_text(coalesce(v_restaurant.cuisine_types, '[]'::jsonb)) value
      where value = any(private.quick_service_cuisine_keys())
    ), '[]'::jsonb),
    'skipTheLineEnabled', coalesce(v_skip_the_line, false)
  );
end $$;

create or replace function public.restaurant_update_quick_service_config(
  p_restaurant_id uuid, p_cuisine_tags text[], p_skip_the_line_enabled boolean
) returns jsonb language plpgsql security definer
set search_path = public, private, pg_temp as $$
declare v_tags jsonb; v_invalid text; v_existing jsonb;
begin
  perform private.require_restaurant_role(
    p_restaurant_id,
    array['owner','manager']::public.user_roles_role_enum[]
  );

  select a into v_invalid
  from unnest(coalesce(p_cuisine_tags, array[]::text[])) a
  where not (a = any(private.quick_service_cuisine_keys()))
  limit 1;
  if v_invalid is not null then
    raise exception 'Tag de cozinha desconhecida: %', v_invalid using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(distinct a), '[]'::jsonb) into v_tags
  from unnest(coalesce(p_cuisine_tags, array[]::text[])) a;

  select coalesce(cuisine_types, '[]'::jsonb) into v_existing
  from public.restaurants where id = p_restaurant_id;

  update public.restaurants
  set cuisine_types = (
        -- Keep any free-text cuisine already stored outside this vocabulary,
        -- replace only the quick service tags themselves.
        select coalesce(jsonb_agg(value), '[]'::jsonb)
        from jsonb_array_elements_text(v_existing) value
        where not (value = any(private.quick_service_cuisine_keys()))
      ) || v_tags,
      updated_at = now()
  where id = p_restaurant_id;

  update public.restaurant_service_configs
  set skip_the_line_enabled = coalesce(p_skip_the_line_enabled, false),
      updated_at = now()
  where restaurant_id = p_restaurant_id and service_type = 'quick_service';

  if not found then
    insert into public.restaurant_service_configs (
      restaurant_id, service_type, is_active, skip_the_line_enabled, created_at, updated_at
    ) values (
      p_restaurant_id, 'quick_service',
      exists (select 1 from public.restaurants where id = p_restaurant_id and service_type = 'quick_service'),
      coalesce(p_skip_the_line_enabled, false), now(), now()
    );
  end if;

  return public.restaurant_get_quick_service_config(p_restaurant_id);
end $$;

revoke all on function public.restaurant_get_quick_service_config(uuid) from public;
revoke all on function public.restaurant_update_quick_service_config(uuid, text[], boolean) from public;
grant execute on function public.restaurant_get_quick_service_config(uuid) to authenticated, service_role;
grant execute on function public.restaurant_update_quick_service_config(uuid, text[], boolean) to authenticated, service_role;
