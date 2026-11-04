-- O3, critérios 1 e 3 (ADR-025). A lista de tarefas passa a dizer as funções de cada tarefa, para quem acumula funções ver a
-- etiqueta e filtrar. A regra de autoaprovação ganha nome próprio, e o caixa fechado por quem recebeu dinheiro avisa o Dono.

-- Ninguém aprova o próprio pedido, menos o Dono (pendência 32). Desistir qualquer um pode.
create or replace function private.assert_not_self_approval(p_approval public.approvals)
returns void language plpgsql stable security definer set search_path = public, private, pg_temp as $$
begin
  if p_approval.requester_id = auth.uid()
     and not private.has_restaurant_role(p_approval.restaurant_id, array['owner']::public.user_roles_role_enum[]) then
    raise exception 'Você não pode aprovar o próprio pedido' using errcode = '42501';
  end if;
end $$;
revoke all on function private.assert_not_self_approval(public.approvals) from public, anon, authenticated;

-- A pessoa que está fechando lançou dinheiro desde a abertura do caixa? Lê o log do motor, que guarda quem agiu: as tabelas de
-- caixa guardam só o nome. A O8 troca a fonte quando o dinheiro passar a quitar parcela, e precisa seguir chamando esta função.
create or replace function private.cash_closed_by_receiver(p_restaurant uuid, p_since timestamptz)
returns boolean language sql stable security definer set search_path = public, private, pg_temp as $$
  select exists (
    select 1 from public.domain_events e
    join public.gateway_transactions g on g.id = e.entity_id
    where e.restaurant_id = p_restaurant and e.event_type = 'payment.in_person' and e.actor_id = auth.uid()
      and g.payment_method = 'cash' and e.created_at >= p_since)
$$;
revoke all on function private.cash_closed_by_receiver(uuid, timestamptz) from public, anon, authenticated;

insert into private.event_catalog(event_type, task_type, primary_roles, manager_joins, push_policy, priority)
values ('cash.closed_by_receiver', 'notice', '{owner}', false, 'always', 2);

create or replace function public.restaurant_list_tasks(p_restaurant_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, private, pg_temp as $$
begin
  perform private.require_restaurant_role(p_restaurant_id,
    array['owner','manager','maitre','chef','cook','barman','waiter','cashier','host']::public.user_roles_role_enum[]);
  return (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'kind', t.kind, 'type', t.task_type, 'title', t.title,
      'detail', t.detail, 'priority', t.priority, 'tableId', t.table_id, 'orderId', t.order_id,
      'entityType', t.entity_type, 'entityId', t.entity_id, 'responsibleUserId', t.responsible_user_id,
      'claimedBy', t.claimed_by, 'createdAt', t.created_at, 'audienceRoles', to_jsonb(t.audience_roles),
      'primaryRoles', to_jsonb(coalesce(c.primary_roles, '{}'))) order by t.priority, t.created_at), '[]'::jsonb)
    from public.staff_tasks t
    left join private.event_catalog c on c.event_type = t.kind
    where t.restaurant_id = p_restaurant_id and t.status = 'open' and private.user_in_task_audience(t));
end $$;

create or replace function public.restaurant_resolve_approval(p_approval_id uuid, p_status text, p_resolution_note text DEFAULT NULL::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'private', 'pg_temp'
as $function$
declare
  v_status text := lower(trim(coalesce(p_status, '')));
  v_approval public.approvals%rowtype;
  v_updated public.approvals%rowtype;
begin
  select * into v_approval from public.approvals where id = p_approval_id for update;
  if v_approval.id is null then
    raise exception 'Approval not found' using errcode = 'P0002';
  end if;

  perform private.require_restaurant_role(v_approval.restaurant_id, array['owner','manager']::public.user_roles_role_enum[]);

  if v_status not in ('approved','rejected') then
    raise exception 'Invalid resolution status: %', p_status using errcode = '22023';
  end if;
  if v_approval.status <> 'pending' then
    raise exception 'Approval has already been resolved' using errcode = '23514';
  end if;
  if v_status = 'approved' then
    perform private.assert_not_self_approval(v_approval);
  end if;

  if v_status = 'approved' then
    perform private.apply_approval_effect(v_approval);
  end if;

  update public.approvals
  set status = v_status, resolver_id = auth.uid(),
      resolution_note = nullif(trim(coalesce(p_resolution_note, '')), ''),
      resolved_at = now(), updated_at = now()
  where id = p_approval_id
  returning * into v_updated;

  perform private.log_audit(v_approval.restaurant_id, 'approval.' || v_status, 'approval', v_approval.id,
    coalesce(nullif(trim(coalesce(p_resolution_note, '')), ''), v_approval.reason),
    jsonb_build_object('status', v_approval.status, 'type', v_approval.type, 'amountCents', v_approval.amount_cents),
    jsonb_build_object('status', v_status, 'orderId', v_approval.order_id));
  if v_approval.requester_id is not null then
    perform private.create_notification(v_approval.requester_id,
      case when v_status = 'approved' then 'Pedido aprovado' else 'Pedido recusado' end,
      v_approval.item_name, 'system', v_approval.id, 'approval',
      jsonb_build_object('kind', 'approval_resolved', 'approvalId', v_approval.id, 'status', v_status,
        'restaurant_id', v_approval.restaurant_id));
  end if;

  return to_jsonb(v_updated);
end;
$function$;

create or replace function public.restaurant_close_cash_register(
  p_session_id uuid,
  p_actual_balance numeric,
  p_closing_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile record;
  v_session record;
  v_updated record;
begin
  select * into v_session
  from public.cash_register_sessions
  where id = p_session_id and status = 'open';

  if v_session.id is null then
    raise exception 'Cash register session not found or already closed' using errcode = 'P0002';
  end if;

  perform private.require_restaurant_role(
    v_session.restaurant_id,
    array['owner','manager']::public.user_roles_role_enum[]
  );

  select full_name into v_profile from public.profiles where id = v_user_id;

  update public.cash_register_sessions
  set
    status = 'closed',
    actual_balance = p_actual_balance,
    difference = p_actual_balance - expected_balance,
    closed_at = now(),
    closed_by = coalesce(v_profile.full_name, v_user_id::text),
    closing_notes = p_closing_notes
  where id = p_session_id
  returning * into v_updated;

  if private.cash_closed_by_receiver(v_session.restaurant_id, v_session.opened_at) then
    perform private.log_audit(v_session.restaurant_id, 'cash.closed_by_receiver', 'cash_register_session', p_session_id,
      'Caixa fechado por quem recebeu dinheiro neste período',
      null, jsonb_build_object('differenceAmount', v_updated.difference));
    -- O Dono que fecha o próprio caixa não precisa ser avisado disso.
    if not private.has_restaurant_role(v_session.restaurant_id, array['owner']::public.user_roles_role_enum[]) then
      perform private.emit_event_safe(v_session.restaurant_id, 'cash.closed_by_receiver', 'cash.closed_by_receiver:' || p_session_id,
        'cash_register_session', p_session_id,
        jsonb_build_object('title', 'Caixa fechado por quem recebeu dinheiro',
          'detail', coalesce(v_profile.full_name, 'Alguém da equipe') || ' lançou dinheiro e fechou este caixa'));
    end if;
  end if;

  return to_jsonb(v_updated);
end;
$$;
