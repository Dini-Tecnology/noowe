-- G2b / ADR-007 — a recepção decide as entradas acima da lotação.
--
-- Toda a equipe da unidade vê as solicitações (o garçom vê sem decidir);
-- decidir exige um papel em `capacity_override_roles` (ou owner).  Toda decisão
-- grava autor, motivo e horário em audit_logs na mesma transação (invariante 8).

create or replace function private.capacity_request_json(p_request_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select jsonb_build_object(
    'id', c.id,
    'restaurantId', c.restaurant_id,
    'tableSessionId', c.table_session_id,
    'tableId', c.table_id,
    'tableNumber', t.table_number,
    'seats', t.seats::integer,
    'occupiedSeats', private.table_session_occupied_seats(c.table_session_id),
    'occupiedSeatsAtRequest', c.occupied_seats_at_request,
    'capacityAtRequest', c.capacity_at_request,
    'seatCount', c.seat_count,
    'status', c.status,
    'source', c.source,
    'decisionReason', c.decision_reason,
    'decisionNote', c.decision_note,
    'decidedAt', c.decided_at,
    'expiresAt', c.expires_at,
    'createdAt', c.created_at,
    'requestedUser', private.public_user_card(c.requested_user_id),
    'invitedBy', case when i.id is null then null else private.public_user_card(i.inviter_id) end
  )
  from public.capacity_requests c
  join public.tables t on t.id = c.table_id
  left join public.table_session_user_invites i on i.id = c.source_invite_id
  where c.id = p_request_id;
$$;
revoke all on function private.capacity_request_json(uuid) from public, anon, authenticated;

-- Papéis que decidem, lidos da configuração, mais o owner.
create or replace function private.capacity_decider_roles(p_restaurant_id uuid)
returns public.user_roles_role_enum[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select array_append(
    coalesce((select c.capacity_override_roles from public.restaurant_model_configs c
              where c.restaurant_id = p_restaurant_id), '{}'::public.user_roles_role_enum[]),
    'owner'::public.user_roles_role_enum);
$$;
revoke all on function private.capacity_decider_roles(uuid) from public, anon, authenticated;

create or replace function public.restaurant_list_capacity_requests(
  p_restaurant_id uuid,
  p_status text default 'pending'
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_can_decide boolean;
  v_result jsonb;
begin
  perform private.require_restaurant_role(p_restaurant_id);
  perform private.expire_due_table_user_invites(null, null, p_restaurant_id);

  v_can_decide := private.has_any_app_role(array['admin'])
    or private.has_restaurant_role(p_restaurant_id, private.capacity_decider_roles(p_restaurant_id));

  select coalesce(jsonb_agg(private.capacity_request_json(c.id)
                            || jsonb_build_object('canDecide', v_can_decide and c.status = 'pending')
                            order by c.created_at desc), '[]'::jsonb)
  into v_result
  from public.capacity_requests c
  where c.restaurant_id = p_restaurant_id
    and (p_status is null or c.status::text = p_status)
    and (p_status = 'pending' or c.created_at > now() - interval '1 day');

  return v_result;
end;
$$;

create or replace function public.restaurant_resolve_capacity_request(
  p_request_id uuid,
  p_decision text,
  p_reason public.noowe_capacity_decision_reason,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_request public.capacity_requests;
  v_before jsonb;
  v_session public.table_sessions;
  v_invite public.table_session_user_invites;
  v_target public.noowe_capacity_request_status;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_table_number text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_decision not in ('approve', 'reject') then
    raise exception 'Decisão inválida' using errcode = '22023';
  end if;
  if p_decision = 'reject' and p_reason is distinct from 'recusado' then
    raise exception 'Recusa usa o motivo "recusado"' using errcode = '22023';
  end if;
  -- Troca e junção de mesa movem o grupo; ficam para a fatia G2.
  if p_decision = 'approve' and (p_reason is null or p_reason not in ('cadeira_extra', 'crianca_colo')) then
    raise exception 'Motivo de aprovação não suportado' using errcode = '22023';
  end if;

  select * into v_request from public.capacity_requests where id = p_request_id for update;
  if v_request.id is null then
    raise exception 'Solicitação não encontrada' using errcode = 'P0002';
  end if;

  perform private.require_restaurant_role(v_request.restaurant_id, private.capacity_decider_roles(v_request.restaurant_id));

  v_target := case p_decision when 'approve' then 'approved' else 'rejected' end;

  if v_request.status <> 'pending' then
    if v_request.status = v_target then
      return private.capacity_request_json(p_request_id) || jsonb_build_object('idempotentReplay', true);
    end if;
    raise exception 'Solicitação já resolvida (%)', v_request.status using errcode = '23514';
  end if;

  select * into v_session from public.table_sessions where id = v_request.table_session_id for update;
  if v_session.status is distinct from 'active' or v_request.expires_at <= now() then
    update public.capacity_requests set status = 'expired', updated_at = now() where id = p_request_id;
    update public.table_session_user_invites
    set status = 'expired',
        closed_reason = case when v_session.status is distinct from 'active' then 'session_closed' else 'capacity_ttl' end,
        updated_at = now()
    where id = v_request.source_invite_id and status = 'awaiting_capacity';
    return private.capacity_request_json(p_request_id);
  end if;

  v_before := to_jsonb(v_request);
  select * into v_invite from public.table_session_user_invites where id = v_request.source_invite_id for update;
  select table_number into v_table_number from public.tables where id = v_request.table_id;

  if p_decision = 'approve' then
    -- O convidado pode ter aberto conta em outra mesa enquanto esperava: P0004
    -- volta para a equipe como erro legível e a solicitação continua pendente.
    perform private.assert_can_switch_to_table(v_request.requested_user_id, v_request.table_id);

    update public.capacity_requests
    set status = 'approved', decision_reason = p_reason, decision_note = v_note,
        decided_by = auth.uid(), decided_at = now(), updated_at = now()
    where id = p_request_id returning * into v_request;

    update public.table_session_user_invites
    set status = 'accepted', updated_at = now()
    where id = v_invite.id and status = 'awaiting_capacity';

    perform private.leave_other_tables(v_request.requested_user_id, v_request.table_id);
    perform private.join_table_session_participant(
      v_request.table_session_id, v_request.requested_user_id, v_request.seat_count);

    perform private.log_audit(
      v_request.restaurant_id, 'capacity_request.approved', 'capacity_request', p_request_id,
      p_reason::text || coalesce(': ' || v_note, ''), v_before, to_jsonb(v_request), auth.uid());

    perform private.create_notification(
      v_request.requested_user_id, 'Entrada liberada',
      'A recepção liberou sua entrada na mesa ' || v_table_number,
      'table_invite_update', v_request.table_session_id, 'table_session',
      jsonb_build_object('kind', 'table_user_invite_update', 'invite_id', v_invite.id,
        'table_session_id', v_request.table_session_id, 'restaurant_id', v_request.restaurant_id));
    if v_invite.id is not null then
      perform private.notify_inviter_of_response(v_invite.id, 'Convite aceito', 'entrou na mesa');
    end if;
  else
    update public.capacity_requests
    set status = 'rejected', decision_reason = p_reason, decision_note = v_note,
        decided_by = auth.uid(), decided_at = now(), updated_at = now()
    where id = p_request_id returning * into v_request;

    update public.table_session_user_invites
    set status = 'capacity_rejected', updated_at = now()
    where id = v_invite.id and status = 'awaiting_capacity';

    perform private.log_audit(
      v_request.restaurant_id, 'capacity_request.rejected', 'capacity_request', p_request_id,
      p_reason::text || coalesce(': ' || v_note, ''), v_before, to_jsonb(v_request), auth.uid());

    perform private.create_notification(
      v_request.requested_user_id, 'Mesa sem lugar',
      'A recepção não liberou sua entrada na mesa ' || v_table_number,
      'table_invite_update', v_request.table_session_id, 'table_session',
      jsonb_build_object('kind', 'table_user_invite_update', 'invite_id', v_invite.id,
        'table_session_id', v_request.table_session_id, 'restaurant_id', v_request.restaurant_id));
    if v_invite.id is not null then
      perform private.notify_inviter_of_response(v_invite.id, 'Mesa sem lugar', 'não pôde entrar: mesa lotada');
    end if;
  end if;

  return private.capacity_request_json(p_request_id);
end;
$$;

revoke all on function public.restaurant_list_capacity_requests(uuid, text) from public;
revoke all on function public.restaurant_resolve_capacity_request(uuid, text, public.noowe_capacity_decision_reason, text) from public;
grant execute on function public.restaurant_list_capacity_requests(uuid, text) to authenticated;
grant execute on function public.restaurant_resolve_capacity_request(uuid, text, public.noowe_capacity_decision_reason, text) to authenticated;
