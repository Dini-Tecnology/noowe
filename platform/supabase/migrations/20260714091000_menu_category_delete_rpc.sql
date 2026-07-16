-- Hard delete for menu categories. Only allowed once the category has been
-- deactivated first, matching the app flow: inactivate → reactivate or delete.
-- Items keep existing (category_id set to null via existing on-delete-set-null FK).
create or replace function public.restaurant_delete_menu_category(
  p_category_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_cat record;
begin
  select * into v_cat from public.menu_categories where id = p_category_id;
  if v_cat.id is null then
    raise exception 'Category not found' using errcode = 'P0002';
  end if;

  perform private.require_restaurant_role(
    v_cat.restaurant_id,
    array['owner','manager']::public.user_roles_role_enum[]
  );

  if v_cat.is_active then
    raise exception 'Desative a categoria antes de excluí-la' using errcode = 'P0001';
  end if;

  delete from public.menu_categories where id = p_category_id;

  return jsonb_build_object('id', p_category_id, 'deleted', true);
end;
$$;

revoke all on function public.restaurant_delete_menu_category(uuid) from public;
grant execute on function public.restaurant_delete_menu_category(uuid) to authenticated, service_role;
