-- Fix: restaurant_create_menu_item explicitly inserted p_course (default null)
-- into menu_items.course, a not-null column, causing every item creation to
-- fail with "null value in column course... violates not-null constraint".
-- Mirror the coalesce pattern already used in restaurant_update_menu_item.
create or replace function public.restaurant_create_menu_item(
  p_restaurant_id  uuid,
  p_category_id    uuid,
  p_name           text,
  p_description    text default null,
  p_price          numeric default 0,
  p_original_price numeric default null,
  p_image_url      text default null,
  p_is_available   boolean default true,
  p_is_featured    boolean default false,
  p_allergens      text[] default null,
  p_dietary_info   text[] default null,
  p_preparation_time integer default null,
  p_course         text default null,
  p_station_id     uuid default null,
  p_sort_order     integer default 0,
  p_calories       integer default null,
  p_metadata       jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_item record;
begin
  perform private.require_restaurant_role(
    p_restaurant_id,
    array['owner','manager']::public.user_roles_role_enum[]
  );

  -- verify category belongs to restaurant
  if not exists (
    select 1 from public.menu_categories
    where id = p_category_id and restaurant_id = p_restaurant_id
  ) then
    raise exception 'Category not found for this restaurant' using errcode = 'P0002';
  end if;

  insert into public.menu_items(
    restaurant_id, category_id, name, description, price, original_price,
    image_url, is_available, is_featured, allergens, dietary_info,
    preparation_time, course, station_id, sort_order, calories, metadata,
    created_at, updated_at
  )
  values(
    p_restaurant_id, p_category_id, p_name, p_description, p_price, p_original_price,
    p_image_url, p_is_available, p_is_featured, to_jsonb(p_allergens), to_jsonb(p_dietary_info),
    p_preparation_time, coalesce(p_course, 'main'), p_station_id, p_sort_order, p_calories,
    coalesce(p_metadata, '{}'::jsonb), now(), now()
  )
  returning * into v_item;

  return to_jsonb(v_item);
end;
$$;

-- Public menu-item images with writes restricted to restaurant owners/managers.
-- Objects are stored under `<restaurant_id>/...` so the folder name can be
-- checked against the caller's role, same pattern as restaurant-logos.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'menu-item-images',
  'menu-item-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists menu_item_images_public_read on storage.objects;
create policy menu_item_images_public_read
on storage.objects for select
to public
using (bucket_id = 'menu-item-images');

drop policy if exists menu_item_images_staff_insert on storage.objects;
create policy menu_item_images_staff_insert
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'menu-item-images'
  and private.has_restaurant_role(
    ((storage.foldername(name))[1])::uuid,
    array['owner','manager']::public.user_roles_role_enum[]
  )
);

drop policy if exists menu_item_images_staff_update on storage.objects;
create policy menu_item_images_staff_update
on storage.objects for update
to authenticated
using (
  bucket_id = 'menu-item-images'
  and private.has_restaurant_role(
    ((storage.foldername(name))[1])::uuid,
    array['owner','manager']::public.user_roles_role_enum[]
  )
)
with check (
  bucket_id = 'menu-item-images'
  and private.has_restaurant_role(
    ((storage.foldername(name))[1])::uuid,
    array['owner','manager']::public.user_roles_role_enum[]
  )
);

drop policy if exists menu_item_images_staff_delete on storage.objects;
create policy menu_item_images_staff_delete
on storage.objects for delete
to authenticated
using (
  bucket_id = 'menu-item-images'
  and private.has_restaurant_role(
    ((storage.foldername(name))[1])::uuid,
    array['owner','manager']::public.user_roles_role_enum[]
  )
);
