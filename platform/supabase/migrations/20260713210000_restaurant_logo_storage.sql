-- Public restaurant logos with writes restricted to restaurant owners/managers.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'restaurant-logos',
  'restaurant-logos',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists restaurant_logos_public_read on storage.objects;
create policy restaurant_logos_public_read
on storage.objects for select
to public
using (bucket_id = 'restaurant-logos');

drop policy if exists restaurant_logos_staff_insert on storage.objects;
create policy restaurant_logos_staff_insert
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'restaurant-logos'
  and private.has_restaurant_role(
    ((storage.foldername(name))[1])::uuid,
    array['owner','manager']::public.user_roles_role_enum[]
  )
);

drop policy if exists restaurant_logos_staff_update on storage.objects;
create policy restaurant_logos_staff_update
on storage.objects for update
to authenticated
using (
  bucket_id = 'restaurant-logos'
  and private.has_restaurant_role(
    ((storage.foldername(name))[1])::uuid,
    array['owner','manager']::public.user_roles_role_enum[]
  )
)
with check (
  bucket_id = 'restaurant-logos'
  and private.has_restaurant_role(
    ((storage.foldername(name))[1])::uuid,
    array['owner','manager']::public.user_roles_role_enum[]
  )
);

drop policy if exists restaurant_logos_staff_delete on storage.objects;
create policy restaurant_logos_staff_delete
on storage.objects for delete
to authenticated
using (
  bucket_id = 'restaurant-logos'
  and private.has_restaurant_role(
    ((storage.foldername(name))[1])::uuid,
    array['owner','manager']::public.user_roles_role_enum[]
  )
);
