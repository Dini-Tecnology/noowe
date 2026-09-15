-- Structured Brazilian address fields used by restaurant onboarding/profile.
alter table public.restaurants
  add column if not exists address_number text,
  add column if not exists address_complement text,
  add column if not exists neighborhood text;

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
    'name','description','address','address_number','address_complement','neighborhood',
    'zip_code','city','state','phone','email','logo_url','cover_image_url','banner_url',
    'cuisine_type','price_range','business_hours','opening_hours','features','settings',
    'service_config','max_party_size','average_prep_time','is_active'
  ];
  v_invalid text[];
begin
  perform private.require_restaurant_role(
    p_restaurant_id,
    array['owner','manager']::public.user_roles_role_enum[]
  );

  select array_agg(key) into v_invalid
  from jsonb_object_keys(p_patch) key
  where key <> all(v_allowed_fields);

  if v_invalid is not null then
    raise exception 'Invalid profile fields: %', array_to_string(v_invalid, ', ')
      using errcode = '22023';
  end if;

  update public.restaurants
  set
    name               = coalesce(p_patch->>'name', name),
    description        = coalesce(p_patch->>'description', description),
    address            = coalesce(p_patch->>'address', address),
    address_number     = coalesce(p_patch->>'address_number', address_number),
    address_complement = coalesce(p_patch->>'address_complement', address_complement),
    neighborhood       = coalesce(p_patch->>'neighborhood', neighborhood),
    zip_code           = coalesce(p_patch->>'zip_code', zip_code),
    city               = coalesce(p_patch->>'city', city),
    state              = coalesce(p_patch->>'state', state),
    phone              = coalesce(p_patch->>'phone', phone),
    email              = coalesce(p_patch->>'email', email),
    logo_url           = coalesce(p_patch->>'logo_url', logo_url),
    cover_image_url    = coalesce(p_patch->>'cover_image_url', cover_image_url),
    banner_url         = coalesce(p_patch->>'banner_url', banner_url),
    cuisine_type       = coalesce(p_patch->>'cuisine_type', cuisine_type),
    price_range        = coalesce(p_patch->>'price_range', price_range),
    business_hours     = coalesce(p_patch->'business_hours', business_hours),
    opening_hours      = coalesce(p_patch->'opening_hours', opening_hours),
    features           = coalesce(p_patch->'features', features),
    settings           = coalesce(p_patch->'settings', settings),
    service_config     = coalesce(p_patch->'service_config', service_config),
    max_party_size     = coalesce((p_patch->>'max_party_size')::integer, max_party_size),
    average_prep_time  = coalesce((p_patch->>'average_prep_time')::integer, average_prep_time),
    is_active          = coalesce((p_patch->>'is_active')::boolean, is_active),
    updated_at         = now()
  where id = p_restaurant_id
  returning * into v_updated;

  return to_jsonb(v_updated);
end;
$$;

revoke all on function public.restaurant_update_profile(uuid, jsonb) from public;
grant execute on function public.restaurant_update_profile(uuid, jsonb) to authenticated, service_role;
