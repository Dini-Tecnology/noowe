-- Harden role-management RLS so restaurant-scoped managers cannot escalate
-- themselves or other users to owner/admin-level permissions.

BEGIN;

CREATE OR REPLACE FUNCTION private.can_manage_profile_role(
  target_role text,
  target_restaurant_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT
    private.has_any_app_role(ARRAY['admin'])
    OR (
      target_restaurant_id IS NOT NULL
      AND target_role = ANY (ARRAY['manager', 'waiter', 'barman', 'chef', 'maitre'])
      AND private.has_restaurant_role(target_restaurant_id, ARRAY['owner']::public.user_roles_role_enum[])
    )
    OR (
      target_restaurant_id IS NOT NULL
      AND target_role = ANY (ARRAY['waiter', 'barman', 'chef', 'maitre'])
      AND private.has_restaurant_role(target_restaurant_id, ARRAY['manager']::public.user_roles_role_enum[])
    );
$$;

CREATE OR REPLACE FUNCTION private.can_manage_user_role(
  target_role public.user_roles_role_enum,
  target_restaurant_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT
    private.has_any_app_role(ARRAY['admin'])
    OR (
      target_restaurant_id IS NOT NULL
      AND target_role = ANY (
        ARRAY[
          'manager'::public.user_roles_role_enum,
          'waiter'::public.user_roles_role_enum,
          'barman'::public.user_roles_role_enum,
          'chef'::public.user_roles_role_enum,
          'maitre'::public.user_roles_role_enum
        ]
      )
      AND private.has_restaurant_role(target_restaurant_id, ARRAY['owner']::public.user_roles_role_enum[])
    )
    OR (
      target_restaurant_id IS NOT NULL
      AND target_role = ANY (
        ARRAY[
          'waiter'::public.user_roles_role_enum,
          'barman'::public.user_roles_role_enum,
          'chef'::public.user_roles_role_enum,
          'maitre'::public.user_roles_role_enum
        ]
      )
      AND private.has_restaurant_role(target_restaurant_id, ARRAY['manager']::public.user_roles_role_enum[])
    );
$$;

REVOKE ALL ON FUNCTION private.can_manage_profile_role(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.can_manage_user_role(public.user_roles_role_enum, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.can_manage_profile_role(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_manage_user_role(public.user_roles_role_enum, uuid) TO authenticated;

DROP POLICY IF EXISTS profile_roles_insert_admin_or_restaurant_manager ON public.profile_roles;
DROP POLICY IF EXISTS profile_roles_update_admin_or_restaurant_manager ON public.profile_roles;
DROP POLICY IF EXISTS profile_roles_delete_admin_or_restaurant_manager ON public.profile_roles;

CREATE POLICY profile_roles_insert_admin_or_restaurant_manager
  ON public.profile_roles
  FOR INSERT
  TO authenticated
  WITH CHECK (private.can_manage_profile_role(role_key, restaurant_id));

CREATE POLICY profile_roles_update_admin_or_restaurant_manager
  ON public.profile_roles
  FOR UPDATE
  TO authenticated
  USING (private.can_manage_profile_role(role_key, restaurant_id))
  WITH CHECK (private.can_manage_profile_role(role_key, restaurant_id));

CREATE POLICY profile_roles_delete_admin_or_restaurant_manager
  ON public.profile_roles
  FOR DELETE
  TO authenticated
  USING (private.can_manage_profile_role(role_key, restaurant_id));

DROP POLICY IF EXISTS user_roles_insert_managed_restaurant ON public.user_roles;
DROP POLICY IF EXISTS user_roles_update_managed_restaurant ON public.user_roles;
DROP POLICY IF EXISTS user_roles_delete_managed_restaurant ON public.user_roles;

CREATE POLICY user_roles_insert_managed_restaurant
  ON public.user_roles
  FOR INSERT
  TO authenticated
  WITH CHECK (private.can_manage_user_role(role, restaurant_id));

CREATE POLICY user_roles_update_managed_restaurant
  ON public.user_roles
  FOR UPDATE
  TO authenticated
  USING (private.can_manage_user_role(role, restaurant_id))
  WITH CHECK (private.can_manage_user_role(role, restaurant_id));

CREATE POLICY user_roles_delete_managed_restaurant
  ON public.user_roles
  FOR DELETE
  TO authenticated
  USING (private.can_manage_user_role(role, restaurant_id));

COMMENT ON FUNCTION private.can_manage_profile_role(text, uuid) IS
  'Restricts profile_roles mutations: admins can manage all roles; restaurant owners can assign manager/staff; managers can assign staff only.';

COMMENT ON FUNCTION private.can_manage_user_role(public.user_roles_role_enum, uuid) IS
  'Restricts legacy user_roles mutations with the same anti-escalation rules used by profile_roles.';

COMMIT;
