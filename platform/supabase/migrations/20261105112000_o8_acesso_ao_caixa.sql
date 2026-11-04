-- O8: as políticas antigas deixavam garçom e gerente lerem e escreverem direto no caixa, o que anula o fechamento cego e a auditoria.
-- Todo caminho agora é pelas funções. Direto na tabela, só o Dono lê.
drop policy if exists cash_register_sessions_staff on public.cash_register_sessions;
drop policy if exists authenticated_select_by_restaurant on public.cash_register_sessions;
drop policy if exists authenticated_insert_by_restaurant_manager on public.cash_register_sessions;
drop policy if exists authenticated_update_by_restaurant_manager on public.cash_register_sessions;
drop policy if exists authenticated_delete_by_restaurant_manager on public.cash_register_sessions;
drop policy if exists cash_register_movements_staff on public.cash_register_movements;
create policy cash_register_sessions_owner_read on public.cash_register_sessions for select to authenticated
  using (private.has_restaurant_role(restaurant_id, array['owner']::public.user_roles_role_enum[]));
create policy cash_register_movements_owner_read on public.cash_register_movements for select to authenticated
  using (exists (select 1 from public.cash_register_sessions s where s.id = session_id
    and private.has_restaurant_role(s.restaurant_id, array['owner']::public.user_roles_role_enum[])));
