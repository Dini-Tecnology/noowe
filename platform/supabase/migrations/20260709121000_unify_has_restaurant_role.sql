-- private.has_restaurant_role() only ever read public.user_roles, while the auth
-- signup trigger (on_auth_user_profile_sync, 20260622120000_supabase_auth_roles_rls.sql)
-- only ever writes to public.profile_roles. A user whose only role lives in
-- profile_roles shows up authenticated on the client (supabase-auth.ts already merges
-- both tables in loadRoles()) but every business RPC that gates on has_restaurant_role /
-- require_restaurant_role (staff, operations, financial, KDS, etc. - ~14 migration files)
-- denies access with errcode 42501.
--
-- This redefines has_restaurant_role to also check profile_roles, mirroring the same
-- UNION already used by private.user_restaurant_ids(). Signature is unchanged, so every
-- existing caller (RLS policies and require_restaurant_role) picks up the fix automatically.

create or replace function private.has_restaurant_role(
  target_restaurant_id uuid,
  required_roles public.user_roles_role_enum[] default array[
    'owner',
    'manager',
    'chef',
    'waiter',
    'barman',
    'maitre'
  ]::public.user_roles_role_enum[]
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.user_roles ur
    where ur.restaurant_id = target_restaurant_id
      and ur.user_id = auth.uid()
      and ur.role = any(required_roles)
      and ur.is_active
  )
  or exists (
    select 1
    from public.profile_roles pr
    where pr.restaurant_id = target_restaurant_id
      and pr.user_id = auth.uid()
      and pr.role_key = any(required_roles::text[])
      and pr.is_active
  );
$$;

revoke all on function private.has_restaurant_role(uuid, public.user_roles_role_enum[]) from public;
grant execute on function private.has_restaurant_role(uuid, public.user_roles_role_enum[]) to authenticated, service_role;
