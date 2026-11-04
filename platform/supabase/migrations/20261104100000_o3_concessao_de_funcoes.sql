-- O3, critério 4 (ADR-025): só o Dono concede ou altera Dono e Gerente, em qualquer caminho.
-- private.can_manage_user_role já dizia isso, mas só valia na RLS: as RPCs de equipe são security definer e pedem
-- apenas dono ou gerente, então um Gerente conseguia criar outro Gerente. O gatilho vale para toda escrita.
-- Toda mudança de função passa a ficar em audit_logs (item G do aditivo); antes, só a de Dono ficava.

-- Escrita sem usuário (migration, service role) e efeito de outro gatilho ficam de fora, como no guarda de Dono.
create or replace function private.user_roles_grant_guard()
returns trigger language plpgsql security definer
set search_path = public, private, pg_temp as $$
begin
  if pg_trigger_depth() > 1 or auth.uid() is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  -- Mudar outra coisa da linha não é conceder função.
  if tg_op = 'UPDATE' and new.role is not distinct from old.role and new.is_active is not distinct from old.is_active
     and new.user_id is not distinct from old.user_id and new.restaurant_id is not distinct from old.restaurant_id then
    return new;
  end if;
  if tg_op <> 'INSERT' and not private.can_manage_user_role(old.role, old.restaurant_id) then
    raise exception 'Você não pode alterar esta função' using errcode = '42501';
  end if;
  if tg_op <> 'DELETE' and not private.can_manage_user_role(new.role, new.restaurant_id) then
    raise exception 'Você não pode conceder esta função' using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
revoke all on function private.user_roles_grant_guard() from public, anon, authenticated;
-- Nome anterior ao do guarda de Dono: o Postgres dispara em ordem alfabética, e esta regra é mais geral.
create trigger user_roles_grant_guard before insert or update or delete on public.user_roles
  for each row execute function private.user_roles_grant_guard();

-- A mudança de Dono já é auditada em user_roles_owner_after.
create or replace function private.user_roles_staff_after()
returns trigger language plpgsql security definer
set search_path = public, private, pg_temp as $$
declare
  v_row public.user_roles := case when tg_op = 'DELETE' then old else new end;
  v_action text;
begin
  if pg_trigger_depth() > 1 or auth.uid() is null then return null; end if;
  if not exists (select 1 from public.restaurants r where r.id = v_row.restaurant_id) then return null; end if;
  if private.user_roles_owner_change_kind(tg_op,
      case when tg_op = 'INSERT' then null else old end,
      case when tg_op = 'DELETE' then null else new end) is not null then
    return null;
  end if;
  v_action := case
    when tg_op = 'INSERT' then case when new.is_active then 'staff_role_granted' end
    when tg_op = 'DELETE' then case when old.is_active then 'staff_role_revoked' end
    when old.is_active and not new.is_active then 'staff_role_revoked'
    when new.is_active and not old.is_active then 'staff_role_granted'
    when new.is_active and new.role is distinct from old.role then 'staff_role_changed'
  end;
  if v_action is null then return null; end if;
  perform private.log_audit(v_row.restaurant_id, v_action, 'user_roles', v_row.id,
    case v_action when 'staff_role_granted' then 'Função concedida' when 'staff_role_revoked' then 'Função removida'
      else 'Função alterada' end,
    case when tg_op = 'INSERT' then null else jsonb_build_object('user_id', old.user_id, 'role', old.role, 'is_active', old.is_active) end,
    case when tg_op = 'DELETE' then null else jsonb_build_object('user_id', new.user_id, 'role', new.role, 'is_active', new.is_active) end);
  return null;
end $$;
revoke all on function private.user_roles_staff_after() from public, anon, authenticated;
create trigger user_roles_staff_after after insert or update or delete on public.user_roles
  for each row execute function private.user_roles_staff_after();

-- profile_roles também dá acesso (private.has_restaurant_role lê as duas tabelas), e nada no app escreve nela. Só as
-- funções do servidor seguem escrevendo: assim a regra acima não tem caminho paralelo.
revoke insert, update, delete, truncate on public.profile_roles from anon, authenticated;
