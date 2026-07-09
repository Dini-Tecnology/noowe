-- Thin RPC for the restaurant app's unit switcher (RestaurantSelectorScreen), which today
-- is a static mock even though the backend already supports staff belonging to multiple
-- restaurants (public.user_roles / public.profile_roles + private.user_restaurant_ids()).
-- RLS on public.restaurants (restaurants_select_staff) already scopes this correctly; this
-- RPC just gives the client a single, convenient call instead of a raw multi-table query.

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
      'logo_url', r.logo_url
    ) order by r.name
  ), '[]'::jsonb)
  from public.restaurants r
  where r.id = any(private.user_restaurant_ids(auth.uid()));
$$;

revoke all on function public.get_my_restaurants() from public;
grant execute on function public.get_my_restaurants() to authenticated;
