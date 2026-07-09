-- public.tables has RLS enabled by the codebase's own convention (restaurant_id-scoped
-- operational data) but never received explicit policies, unlike its sibling tables
-- (orders, menu_items). The only direct client read is supabase-api.ts:getRestaurantTable()
-- (SELECT by id); all writes go through restaurant_get_tables / restaurant_update_table_status
-- (SECURITY DEFINER RPCs that already self-check via private.require_restaurant_role).
-- This migration adds explicit policies so the direct SELECT path stops being deny-by-default,
-- following the same shape used for public.orders in 20260427122300_okinawa_bigbang_bootstrap.sql.

alter table public.tables enable row level security;

drop policy if exists tables_select_restaurant_staff on public.tables;
drop policy if exists tables_insert_restaurant_manager on public.tables;
drop policy if exists tables_update_restaurant_staff on public.tables;
drop policy if exists tables_delete_restaurant_manager on public.tables;

create policy tables_select_restaurant_staff
on public.tables
for select
to authenticated
using (private.has_restaurant_role(restaurant_id));

create policy tables_insert_restaurant_manager
on public.tables
for insert
to authenticated
with check (
  private.has_restaurant_role(restaurant_id, array['owner', 'manager']::public.user_roles_role_enum[])
);

create policy tables_update_restaurant_staff
on public.tables
for update
to authenticated
using (private.has_restaurant_role(restaurant_id))
with check (private.has_restaurant_role(restaurant_id));

create policy tables_delete_restaurant_manager
on public.tables
for delete
to authenticated
using (
  private.has_restaurant_role(restaurant_id, array['owner', 'manager']::public.user_roles_role_enum[])
);
