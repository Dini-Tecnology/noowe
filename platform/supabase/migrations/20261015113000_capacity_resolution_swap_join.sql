-- ADR-018: a decisão do maître sobre uma solicitação de lotação (entrar numa mesa cheia ou abrir uma
-- mesa pequena demais) também pode trocar a mesa ou juntar mesas, na mesma transação e com auditoria.
-- A assinatura ganha p_table_ids (default null): apps antigos chamam por nome e seguem funcionando.

drop function if exists public.restaurant_resolve_capacity_request(uuid, text, public.noowe_capacity_decision_reason, text);

-- Destino de um pedido de abertura: mesa principal, livre, com QR ativo e que comporta o grupo.
create or replace function private.assert_open_target_table(
  p_restaurant_id uuid, p_table_id uuid, p_party integer, p_enforce boolean
) returns void language plpgsql security definer
set search_path = public, private, pg_temp as $$
declare v_table public.tables; v_effective integer;
begin
  select * into v_table from public.tables where id = p_table_id for update;
  if v_table.id is null or v_table.restaurant_id <> p_restaurant_id or v_table.merged_into_id is not null
     or v_table.status <> 'available'
     or exists (select 1 from public.table_sessions s where s.table_id = v_table.id and s.status = 'active')
     or not exists (select 1 from public.table_qr_codes q where q.table_id = v_table.id and q.is_active
                    and (q.expires_at is null or q.expires_at > now())) then
    raise exception 'A mesa de destino não está livre' using errcode = 'P0014';
  end if;
  v_effective := private.table_effective_seats(v_table.id);
  if p_enforce and p_party > v_effective then
    raise exception 'Mesa de destino com % lugares para % pessoas', v_effective, p_party using errcode = 'P0015';
  end if;
end $$;
revoke all on function private.assert_open_target_table(uuid, uuid, integer, boolean) from public, anon, authenticated;

create or replace function public.restaurant_resolve_capacity_request(
  p_request_id uuid,
  p_decision text,
  p_reason public.noowe_capacity_decision_reason,
  p_note text default null,
  p_table_ids uuid[] default null
) returns jsonb language plpgsql security definer
set search_path = public, private, pg_temp as $$
declare
  v_request public.capacity_requests; v_before jsonb; v_session public.table_sessions;
  v_invite public.table_session_user_invites; v_target public.noowe_capacity_request_status;
  v_note text := nullif(btrim(coalesce(p_note, '')), ''); v_table_number text;
  v_rid uuid; v_dest uuid; v_enforce boolean;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_decision not in ('approve', 'reject') then raise exception 'Decisão inválida' using errcode = '22023'; end if;
  if p_decision = 'reject' and p_reason is distinct from 'recusado' then
    raise exception 'Recusa usa o motivo "recusado"' using errcode = '22023';
  end if;
  if p_decision = 'approve' and (p_reason is null or p_reason::text not in ('cadeira_extra', 'crianca_colo', 'walk_in_liberado', 'troca_de_mesa', 'juncao_mesas')) then
    raise exception 'Motivo de aprovação não suportado' using errcode = '22023';
  end if;

  -- ADR-018: troca e junção levam as mesas indicadas; os outros motivos não aceitam mesas.
  if p_decision = 'approve' and p_reason::text = 'troca_de_mesa' and coalesce(cardinality(p_table_ids), 0) <> 1 then
    raise exception 'A troca de mesa precisa de exatamente uma mesa de destino' using errcode = '22023';
  end if;
  if p_decision = 'approve' and p_reason::text = 'juncao_mesas' and coalesce(cardinality(p_table_ids), 0) < 1 then
    raise exception 'A junção precisa de ao menos uma mesa' using errcode = '22023';
  end if;
  if coalesce(cardinality(p_table_ids), 0) > 0
     and (p_decision <> 'approve' or p_reason::text not in ('troca_de_mesa', 'juncao_mesas')) then
    raise exception 'Mesas só acompanham troca ou junção' using errcode = '22023';
  end if;
  -- Reorganizar o salão pede o lock exclusivo ANTES de qualquer trava de linha (ordem do protocolo).
  if p_decision = 'approve' and p_reason::text in ('troca_de_mesa', 'juncao_mesas') then
    select restaurant_id into v_rid from public.capacity_requests where id = p_request_id;
    if v_rid is not null then perform private.lock_floor(v_rid, true); end if;
  end if;

  select * into v_request from public.capacity_requests where id = p_request_id for update;
  if v_request.id is null then raise exception 'Solicitação não encontrada' using errcode = 'P0002'; end if;
  if p_decision = 'approve' and p_reason::text = 'walk_in_liberado' and v_request.request_kind <> 'open' then
    raise exception 'Motivo válido só para abertura de mesa' using errcode = '22023';
  end if;

  perform private.require_restaurant_role(v_request.restaurant_id, private.capacity_decider_roles(v_request.restaurant_id));
  v_target := case p_decision when 'approve' then 'approved' else 'rejected' end;

  if v_request.status <> 'pending' then
    if v_request.status = v_target then
      return private.capacity_request_json(p_request_id) || jsonb_build_object('idempotentReplay', true);
    end if;
    raise exception 'Solicitação já resolvida (%)', v_request.status using errcode = '23514';
  end if;

  if v_request.request_kind = 'join' then
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
  elsif v_request.expires_at <= now() then
    update public.capacity_requests set status = 'expired', updated_at = now() where id = p_request_id;
    return private.capacity_request_json(p_request_id);
  end if;

  v_before := to_jsonb(v_request);
  select coalesce(c.enforce_table_capacity, false) into v_enforce
    from public.restaurant_model_configs c where c.restaurant_id = v_request.restaurant_id;
  select table_number into v_table_number from public.tables where id = v_request.table_id;

  if v_request.request_kind = 'open' then
    if p_decision = 'approve' then
      -- ADR-018: pedido de abertura resolvido trocando a mesa (destino livre que caiba) ou juntando mesas.
      if p_reason::text = 'troca_de_mesa' then
        v_dest := p_table_ids[1];
        perform private.assert_open_target_table(v_request.restaurant_id, v_dest, v_request.seat_count, coalesce(v_enforce, false));
        update public.capacity_requests set table_id = v_dest, updated_at = now() where id = v_request.id;
        select * into v_request from public.capacity_requests where id = p_request_id;
      elsif p_reason::text = 'juncao_mesas' then
        perform private.merge_tables(v_request.table_id, p_table_ids, 'juncao_mesas', v_note);
        if coalesce(v_enforce, false) and v_request.seat_count > private.table_effective_seats(v_request.table_id) then
          raise exception 'Mesa com % lugares para % pessoas', private.table_effective_seats(v_request.table_id), v_request.seat_count
            using errcode = 'P0015';
        end if;
      end if;
      select table_number into v_table_number from public.tables where id = v_request.table_id;
      perform private.assert_can_switch_to_table(v_request.requested_user_id, v_request.table_id);
      update public.capacity_requests
      set status = 'approved', decision_reason = p_reason, decision_note = v_note,
          decided_by = auth.uid(), decided_at = now(), updated_at = now()
      where id = p_request_id returning * into v_request;
      perform private.log_audit(
        v_request.restaurant_id, 'capacity_request.approved', 'capacity_request', p_request_id,
        p_reason::text || coalesce(': ' || v_note, ''), v_before, to_jsonb(v_request), auth.uid());
      perform private.create_notification(
        v_request.requested_user_id, 'Mesa liberada',
        'A recepção liberou a mesa ' || v_table_number || '. Toque para abrir.',
        'table_open_approved', v_request.id, 'capacity_request',
        jsonb_build_object('kind', 'table_open_approved', 'capacity_request_id', v_request.id,
          'restaurant_id', v_request.restaurant_id));
    else
      update public.capacity_requests
      set status = 'rejected', decision_reason = p_reason, decision_note = v_note,
          decided_by = auth.uid(), decided_at = now(), updated_at = now()
      where id = p_request_id returning * into v_request;
      perform private.log_audit(
        v_request.restaurant_id, 'capacity_request.rejected', 'capacity_request', p_request_id,
        p_reason::text || coalesce(': ' || v_note, ''), v_before, to_jsonb(v_request), auth.uid());
      perform private.create_notification(
        v_request.requested_user_id, 'Mesa não liberada',
        'A recepção não liberou a mesa ' || v_table_number || '. Fale com a equipe.',
        'table_open_update', v_request.id, 'capacity_request',
        jsonb_build_object('kind', 'table_open_rejected', 'capacity_request_id', v_request.id,
          'restaurant_id', v_request.restaurant_id));
    end if;
    return private.capacity_request_json(p_request_id);
  end if;

  select * into v_invite from public.table_session_user_invites where id = v_request.source_invite_id for update;

  if p_decision = 'approve' then
    -- ADR-018: entrada acima da lotação resolvida trocando a mesa do grupo ou juntando mesas.
    if p_reason::text = 'troca_de_mesa' then
      perform private.move_table_session(v_request.table_session_id, p_table_ids[1], 'troca_de_mesa', v_note);
    elsif p_reason::text = 'juncao_mesas' then
      perform private.merge_tables(v_session.table_id, p_table_ids, 'juncao_mesas', v_note);
    end if;
    if p_reason::text in ('troca_de_mesa', 'juncao_mesas') then
      select * into v_request from public.capacity_requests where id = p_request_id;
      if coalesce(v_enforce, false)
         and private.table_session_occupied_seats(v_request.table_session_id) + v_request.seat_count
             > private.table_effective_seats(v_request.table_id) then
        raise exception 'Mesa com % lugares para % pessoas', private.table_effective_seats(v_request.table_id),
          private.table_session_occupied_seats(v_request.table_session_id) + v_request.seat_count using errcode = 'P0015';
      end if;
      select table_number into v_table_number from public.tables where id = v_request.table_id;
    end if;
    perform private.assert_can_switch_to_table(v_request.requested_user_id, v_request.table_id);
    update public.capacity_requests
    set status = 'approved', decision_reason = p_reason, decision_note = v_note,
        decided_by = auth.uid(), decided_at = now(), updated_at = now()
    where id = p_request_id returning * into v_request;
    update public.table_session_user_invites set status = 'accepted', updated_at = now()
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
    update public.table_session_user_invites set status = 'capacity_rejected', updated_at = now()
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
end $$;
revoke all on function public.restaurant_resolve_capacity_request(uuid, text, public.noowe_capacity_decision_reason, text, uuid[]) from public, anon;
grant execute on function public.restaurant_resolve_capacity_request(uuid, text, public.noowe_capacity_decision_reason, text, uuid[]) to authenticated;
