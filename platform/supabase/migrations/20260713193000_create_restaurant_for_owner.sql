-- Creates a restaurant and grants its creator the owner role atomically.
-- The app cannot safely perform these two writes separately because all
-- restaurant operations are scoped by public.user_roles.
create or replace function public.create_my_restaurant(
  p_name text,
  p_address text,
  p_city text,
  p_state text,
  p_zip_code text,
  p_phone text,
  p_email text,
  p_service_type text default 'casual_dining'
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_restaurant public.restaurants;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if coalesce(trim(p_name), '') = ''
    or coalesce(trim(p_address), '') = ''
    or coalesce(trim(p_city), '') = ''
    or coalesce(trim(p_state), '') = ''
    or coalesce(trim(p_zip_code), '') = ''
    or coalesce(trim(p_phone), '') = ''
    or coalesce(trim(p_email), '') = '' then
    raise exception 'Preencha todos os campos obrigatórios.' using errcode = '22023';
  end if;

  insert into public.restaurants (
    owner_id, name, address, city, state, zip_code, phone, email, service_type
  ) values (
    v_user_id, trim(p_name), trim(p_address), trim(p_city),
    trim(p_state), trim(p_zip_code), trim(p_phone), lower(trim(p_email)), trim(p_service_type)
  )
  returning * into v_restaurant;

  insert into public.user_roles (user_id, restaurant_id, role, is_active)
  values (v_user_id, v_restaurant.id, 'owner', true);

  return jsonb_build_object('id', v_restaurant.id, 'name', v_restaurant.name);
end;
$$;

revoke all on function public.create_my_restaurant(text,text,text,text,text,text,text,text) from public;
grant execute on function public.create_my_restaurant(text,text,text,text,text,text,text,text) to authenticated;
