-- Add 'cook' (Cozinheiro) to public.user_roles_role_enum.
-- Must commit before other migrations reference the new label.

do $$
begin
  if not exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'user_roles_role_enum'
      and e.enumlabel = 'cook'
  ) then
    alter type public.user_roles_role_enum add value 'cook';
  end if;
end
$$;
