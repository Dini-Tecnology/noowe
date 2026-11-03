-- ADR-030 — aviso a dono e gerente quando uma nota fiscal para em blocked, rejected ou failed.
--
-- O gatilho olha a transição de status: varredura e resultado repetido não mudam nota parada, então
-- não avisam de novo. O push sai pelo gatilho de `notifications`, depois do commit. O texto é fixo:
-- `error_message` vem de fora e fica só na lista da gerência.

-- Regra provisória (ADR-030): com outra nota já parada, a lista aberta pelo último aviso já mostra a
-- nova, e um novo aviso só sai depois deste intervalo. Restaurante sem cadastro fiscal bloqueia toda
-- conta encerrada: sem isto, seria um push por conta.
create or replace function private.fiscal_issue_notice_cooldown()
returns interval language sql immutable as $$
  select interval '24 hours'
$$;
revoke all on function private.fiscal_issue_notice_cooldown() from public, anon, authenticated;

-- Os mesmos papéis que veem a lista e reenviam a nota. Como em private.has_restaurant_role, o dono
-- pode existir só em restaurants.owner_id, sem linha em user_roles.
create or replace function private.fiscal_issue_recipients(p_restaurant_id uuid)
returns setof uuid language sql stable security definer set search_path = public, pg_temp as $$
  select r.owner_id from public.restaurants r
    where r.id = p_restaurant_id and r.owner_id is not null
  union
  select ur.user_id from public.user_roles ur
    where ur.restaurant_id = p_restaurant_id and ur.is_active and ur.role in ('owner', 'manager')
  union
  select pr.user_id from public.profile_roles pr
    where pr.restaurant_id = p_restaurant_id and pr.is_active and pr.role_key in ('owner', 'manager')
$$;
revoke all on function private.fiscal_issue_recipients(uuid) from public, anon, authenticated;

create or replace function private.fiscal_send_issue_notice(p_doc public.fiscal_documents)
returns integer language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  v_user uuid; v_sent integer := 0; v_name text; v_text text; v_other_open boolean;
begin
  select r.name into v_name from public.restaurants r where r.id = p_doc.restaurant_id;
  v_text := case p_doc.status
    when 'blocked' then 'uma nota fiscal ficou bloqueada e não foi enviada. Toque para corrigir e reenviar.'
    when 'rejected' then 'uma nota fiscal foi recusada. Toque para corrigir e reenviar.'
    else 'uma nota fiscal falhou nas tentativas automáticas. Toque para reenviar.' end;
  v_other_open := exists (select 1 from public.fiscal_documents d
    where d.restaurant_id = p_doc.restaurant_id and d.id <> p_doc.id and d.status in ('blocked', 'rejected', 'failed'));
  for v_user in select * from private.fiscal_issue_recipients(p_doc.restaurant_id) loop
    continue when v_other_open and exists (select 1 from public.notifications n
      where n.user_id = v_user and n.notification_type = 'fiscal_document_issue'
        and n.metadata->>'restaurant_id' = p_doc.restaurant_id::text
        and n.created_at > now() - private.fiscal_issue_notice_cooldown());
    perform private.create_notification(v_user, 'Nota fiscal parada', v_name || ': ' || v_text,
      'fiscal_document_issue', p_doc.id, 'fiscal_document',
      jsonb_build_object('kind', 'fiscal_document_issue', 'fiscal_document_id', p_doc.id,
        'status', p_doc.status, 'restaurant_id', p_doc.restaurant_id));
    v_sent := v_sent + 1;
  end loop;
  return v_sent;
end $$;
revoke all on function private.fiscal_send_issue_notice(public.fiscal_documents) from public, anon, authenticated;

-- Falha no aviso não desfaz o resultado fiscal: a nota continua na lista e o rastro fica para o gerente.
create or replace function private.fiscal_notify_issue()
returns trigger language plpgsql security definer set search_path = public, private, pg_temp as $$
begin
  begin
    perform private.fiscal_send_issue_notice(new);
  exception when others then
    perform private.log_system_audit(new.restaurant_id, 'fiscal.issue_notice_failed', 'fiscal_document', new.id, sqlerrm, null, null);
  end;
  return new;
end $$;
revoke all on function private.fiscal_notify_issue() from public, anon, authenticated;

create trigger trg_fiscal_notify_issue after update of status on public.fiscal_documents
  for each row when (new.status in ('blocked', 'rejected', 'failed') and old.status is distinct from new.status)
  execute function private.fiscal_notify_issue();
