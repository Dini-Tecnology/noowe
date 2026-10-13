-- ADR-016: no Casual Dining o QR da mesa é a chave de entrada (walk-in).
--
-- Antes: customer_check_in exigia reserva confirmada ou chamada da fila em QUALQUER
-- modelo de salão, e o gate rodava antes de procurar a sessão aberta (quem chegava
-- depois também era barrado). Agora:
--   * a exigência vem de restaurant_model_policies.reservation_required (só o Fine);
--   * quem escaneia uma mesa que já tem sessão entra nela (uma sessão por mesa);
--   * quem abre a mesa informa o tamanho do grupo; acima de tables.seats, ou com fila
--     virtual ativa, a abertura vira solicitação pendente ao maître (invariante 7);
--   * a decisão do maître grava audit_log na mesma transação (invariante 8).

-- ── 1. Esquema ──────────────────────────────────────────────────────────────
alter table public.table_sessions
  add column if not exists declared_party_size integer
  check (declared_party_size is null or declared_party_size > 0);

alter table public.capacity_requests alter column table_session_id drop not null;
alter table public.capacity_requests
  add column if not exists request_kind text not null default 'join'
    check (request_kind in ('join', 'open')),
  add column if not exists trigger_reason text
    check (trigger_reason is null or trigger_reason in ('capacity', 'queue_active')),
  add column if not exists service_model public.noowe_service_model,
  add column if not exists consumed_at timestamptz;

alter table public.capacity_requests drop constraint if exists capacity_requests_kind_session_check;
alter table public.capacity_requests add constraint capacity_requests_kind_session_check
  check ((request_kind = 'join') = (table_session_id is not null));

create unique index if not exists uq_capacity_requests_pending_open_per_user
  on public.capacity_requests (table_id, requested_user_id)
  where status = 'pending' and table_session_id is null;

-- ── 2. Regras isoladas (ADR-016, PROVISÓRIO: trocar a regra é mudar só aqui) ─
create or replace function private.check_in_requires_booking(p_policy public.restaurant_model_policies)
returns boolean language sql immutable as $$
  select coalesce(p_policy.reservation_required, false)
$$;

create or replace function private.walk_in_needs_host_approval(
  p_restaurant_id uuid, p_policy public.restaurant_model_policies
) returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select coalesce(p_policy.queue_as_primary_entry, false)
    and exists (select 1 from public.waitlist_entries w
                where w.restaurant_id = p_restaurant_id and w.status::text = 'waiting')
$$;

-- ── 3. JSON da solicitação (agora também para pedidos de abertura) ──────────
create or replace function private.capacity_request_json(p_request_id uuid)
returns jsonb language sql stable security definer
set search_path = public, private, pg_temp as $$
  select jsonb_build_object(
    'id', c.id,
    'restaurantId', c.restaurant_id,
    'tableSessionId', c.table_session_id,
    'tableId', c.table_id,
    'tableNumber', t.table_number,
    'seats', t.seats::integer,
    'occupiedSeats', case when c.table_session_id is null then 0
      else private.table_session_occupied_seats(c.table_session_id) end,
    'occupiedSeatsAtRequest', c.occupied_seats_at_request,
    'capacityAtRequest', c.capacity_at_request,
    'seatCount', c.seat_count,
    'requestKind', c.request_kind,
    'reason', c.trigger_reason,
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

-- ── 4. Check-in de mesa ─────────────────────────────────────────────────────
drop function if exists public.customer_check_in(text, public.noowe_service_model);
drop function if exists public.customer_dev_check_in(text, public.noowe_service_model);
drop function if exists private.table_check_in(text, public.noowe_service_model, boolean);

create or replace function private.table_check_in(
  p_qr_data text,
  p_service_model public.noowe_service_model,
  p_skip_entry_gates boolean,
  p_party_size integer default null
) returns jsonb language plpgsql security definer
set search_path = public, private, pg_temp as $$
declare v_qr public.table_qr_codes; v_policy public.restaurant_model_policies;
  v_reservation_id uuid; v_waitlist_id uuid; v_visit jsonb; v_session_id uuid;
  v_active_session public.table_sessions; v_occupied integer; v_capacity integer; v_request_id uuid;
  v_enforce boolean; v_ttl integer; v_party integer; v_has_entry boolean; v_approved_id uuid;
  v_reason text; v_had_session boolean; v_approved_seats integer; v_inserted boolean;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if p_service_model='quick_service' then raise exception 'Quick Service não usa check-in de mesa' using errcode='23514'; end if;
  select * into v_qr from public.table_qr_codes where qr_code_data=btrim(p_qr_data) and is_active;
  if v_qr.id is null then raise exception 'QR inválido' using errcode='22023'; end if;
  if not p_skip_entry_gates and not private.restaurant_is_open_now(v_qr.restaurant_id) then
    raise exception 'Restaurante fechado no momento' using errcode='P0010';
  end if;
  select * into v_policy from public.restaurant_model_policies
    where restaurant_id=v_qr.restaurant_id and service_model=p_service_model and table_check_in_enabled;
  if v_policy.restaurant_id is null then raise exception 'Check-in indisponível para este modelo' using errcode='23514'; end if;

  select r.id into v_reservation_id from public.reservations r
    where r.restaurant_id=v_qr.restaurant_id and r.customer_id=auth.uid()
      and r.status::text='confirmed' and (r.table_id is null or r.table_id=v_qr.table_id)
      and r.reservation_time between now()-interval '2 hours' and now()+interval '6 hours'
    order by r.reservation_time limit 1;
  if v_reservation_id is null then
    select w.id into v_waitlist_id from public.waitlist_entries w join public.tables t on t.id=v_qr.table_id
      where w.restaurant_id=v_qr.restaurant_id and w.customer_id=auth.uid()
        and w.status::text in ('called','arrived')
        and (w.table_number is null or w.table_number=t.table_number)
      order by w.created_at desc limit 1;
  end if;
  v_has_entry := v_reservation_id is not null or v_waitlist_id is not null;

  select coalesce(c.enforce_table_capacity, false), coalesce(c.capacity_request_ttl_min, 15)
    into v_enforce, v_ttl
    from public.restaurant_model_configs c where c.restaurant_id=v_qr.restaurant_id;
  v_enforce := coalesce(v_enforce, false);
  v_ttl := coalesce(v_ttl, 15);
  select seats::integer into v_capacity from public.tables where id=v_qr.table_id;

  select * into v_active_session from public.table_sessions
    where table_id=v_qr.table_id and status='active' order by started_at desc limit 1;
  v_had_session := v_active_session.id is not null;
  v_party := greatest(coalesce(p_party_size, 1), 1);

  if v_had_session then
    if not private.is_table_session_participant(v_active_session.id) then
      if not p_skip_entry_gates and private.check_in_requires_booking(v_policy) and not v_has_entry then
        raise exception 'Check-in exige reserva confirmada ou chamada válida da fila' using errcode='P0005';
      end if;
      if v_enforce then
        select coalesce(sum(seat_count),0)::integer into v_occupied from public.table_session_participants
          where table_session_id=v_active_session.id;
        if v_occupied+1>v_capacity then
          insert into public.capacity_requests(restaurant_id,table_session_id,table_id,requested_user_id,
            source,seat_count,occupied_seats_at_request,capacity_at_request,expires_at,request_kind,trigger_reason,service_model)
          values(v_qr.restaurant_id,v_active_session.id,v_qr.table_id,auth.uid(),'table_qr',1,
            v_occupied,v_capacity,now()+make_interval(mins=>v_ttl),'join','capacity',p_service_model)
          on conflict(table_session_id,requested_user_id) where status='pending'
          do update set expires_at=excluded.expires_at returning id, (xmax=0) into v_request_id, v_inserted;
          if v_inserted then
            perform private.log_audit(v_qr.restaurant_id,'capacity_request.created','capacity_request',v_request_id,
              'lotacao_excedida',null,jsonb_build_object('source','table_qr','occupied',v_occupied,'capacity',v_capacity),auth.uid());
          end if;
          return jsonb_build_object('status','awaiting_capacity','capacityRequestId',v_request_id,
            'requestKind','join','reason','capacity',
            'restaurantId',v_qr.restaurant_id,'tableId',v_qr.table_id,'serviceModel',p_service_model);
        end if;
      end if;
    end if;
  elsif not p_skip_entry_gates then
    -- Abertura de mesa. Uma liberação do maître ainda válida e não usada dispensa os gates.
    select c.id, c.seat_count into v_approved_id, v_approved_seats from public.capacity_requests c
      where c.table_id=v_qr.table_id and c.requested_user_id=auth.uid() and c.request_kind='open'
        and c.status='approved' and c.consumed_at is null
        and c.decided_at > now()-make_interval(mins=>v_ttl)
      order by c.decided_at desc limit 1;
    if v_approved_id is not null then
      v_party := v_approved_seats;
    else
      if private.check_in_requires_booking(v_policy) and not v_has_entry then
        raise exception 'Check-in exige reserva confirmada ou chamada válida da fila' using errcode='P0005';
      end if;
      v_reason := case
        when not v_has_entry and private.walk_in_needs_host_approval(v_qr.restaurant_id, v_policy) then 'queue_active'
        when v_enforce and v_party>v_capacity then 'capacity'
        else null end;
      if v_reason is not null then
        insert into public.capacity_requests(restaurant_id,table_session_id,table_id,requested_user_id,
          source,seat_count,occupied_seats_at_request,capacity_at_request,expires_at,request_kind,trigger_reason,service_model)
        values(v_qr.restaurant_id,null,v_qr.table_id,auth.uid(),'table_qr',v_party,
          0,v_capacity,now()+make_interval(mins=>v_ttl),'open',v_reason,p_service_model)
        on conflict(table_id,requested_user_id) where status='pending' and table_session_id is null
        do update set expires_at=excluded.expires_at, seat_count=excluded.seat_count,
          trigger_reason=excluded.trigger_reason returning id, (xmax=0) into v_request_id, v_inserted;
        if v_inserted then
          perform private.log_audit(v_qr.restaurant_id,'capacity_request.created','capacity_request',v_request_id,
            case v_reason when 'queue_active' then 'fila_ativa' else 'lotacao_excedida' end,null,
            jsonb_build_object('source','table_qr','kind','open','party',v_party,'capacity',v_capacity),auth.uid());
        end if;
        return jsonb_build_object('status','awaiting_capacity','capacityRequestId',v_request_id,
          'requestKind','open','reason',v_reason,
          'restaurantId',v_qr.restaurant_id,'tableId',v_qr.table_id,'serviceModel',p_service_model);
      end if;
    end if;
  end if;

  v_visit := public.customer_open_table_session(p_qr_data);
  v_session_id := (v_visit->>'tableSessionId')::uuid;
  update public.table_sessions set service_model=p_service_model,
    reservation_id=coalesce(reservation_id,v_reservation_id),
    waitlist_entry_id=coalesce(waitlist_entry_id,v_waitlist_id),
    declared_party_size=case when v_had_session then declared_party_size else v_party end,
    updated_at=now()
    where id=v_session_id;
  if v_approved_id is not null then
    update public.capacity_requests set consumed_at=now(), updated_at=now() where id=v_approved_id;
  end if;
  if v_waitlist_id is not null then
    update public.waitlist_entries set status='seated',seated_at=now(),updated_at=now() where id=v_waitlist_id;
    update public.orders set table_session_id=v_session_id,table_id=v_qr.table_id,
      waitlist_entry_id=null,origin_type='table_session',updated_at=now()
      where waitlist_entry_id=v_waitlist_id and customer_id=auth.uid();
  end if;
  return v_visit || jsonb_build_object('serviceModel',p_service_model,
    'reservationId',v_reservation_id,'waitlistEntryId',v_waitlist_id);
end $$;
revoke all on function private.table_check_in(text,public.noowe_service_model,boolean,integer) from public, anon, authenticated;

create or replace function public.customer_check_in(
  p_qr_data text, p_service_model public.noowe_service_model, p_party_size integer default null
) returns jsonb language sql security definer
set search_path=public,private,pg_temp as $$
  select private.table_check_in(p_qr_data, p_service_model, false, p_party_size)
$$;
revoke all on function public.customer_check_in(text,public.noowe_service_model,integer) from public;
grant execute on function public.customer_check_in(text,public.noowe_service_model,integer) to authenticated;

create or replace function public.customer_dev_check_in(
  p_qr_data text, p_service_model public.noowe_service_model, p_party_size integer default null
) returns jsonb language plpgsql security definer
set search_path=public,private,pg_temp as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if not exists (select 1 from private.dev_flags where key='simulate_table_scan' and enabled) then
    raise exception 'O atalho de mesa de teste está desligado no banco.' using errcode='42501';
  end if;
  return private.table_check_in(p_qr_data, p_service_model, true, p_party_size);
end $$;
revoke all on function public.customer_dev_check_in(text,public.noowe_service_model,integer) from public, anon;
grant execute on function public.customer_dev_check_in(text,public.noowe_service_model,integer) to authenticated;

-- Depois que o maître libera a abertura, o app chama isto (pela notificação) para
-- abrir a mesa sem reescanear. O mesmo caminho vale se o cliente reescanear o QR.
create or replace function public.customer_check_in_approved(p_capacity_request_id uuid)
returns jsonb language plpgsql security definer
set search_path=public,private,pg_temp as $$
declare v_req public.capacity_requests; v_qr public.table_qr_codes;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
  select * into v_req from public.capacity_requests where id=p_capacity_request_id for update;
  if v_req.id is null or v_req.requested_user_id<>auth.uid() or v_req.request_kind<>'open' then
    raise exception 'Solicitação não encontrada' using errcode='P0002';
  end if;
  if v_req.status<>'approved' or v_req.consumed_at is not null then
    raise exception 'Esta liberação não está mais disponível' using errcode='23514';
  end if;
  select * into v_qr from public.table_qr_codes where table_id=v_req.table_id and is_active
    order by created_at desc limit 1;
  if v_qr.id is null then raise exception 'QR inválido' using errcode='22023'; end if;
  return private.table_check_in(v_qr.qr_code_data, v_req.service_model, false, v_req.seat_count);
end $$;
revoke all on function public.customer_check_in_approved(uuid) from public, anon;
grant execute on function public.customer_check_in_approved(uuid) to authenticated;

-- ── 5. Decisão do maître: agora também para abertura de mesa ────────────────
create or replace function public.restaurant_resolve_capacity_request(
  p_request_id uuid,
  p_decision text,
  p_reason public.noowe_capacity_decision_reason,
  p_note text default null
) returns jsonb language plpgsql security definer
set search_path = public, private, pg_temp as $$
declare
  v_request public.capacity_requests; v_before jsonb; v_session public.table_sessions;
  v_invite public.table_session_user_invites; v_target public.noowe_capacity_request_status;
  v_note text := nullif(btrim(coalesce(p_note, '')), ''); v_table_number text;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_decision not in ('approve', 'reject') then raise exception 'Decisão inválida' using errcode = '22023'; end if;
  if p_decision = 'reject' and p_reason is distinct from 'recusado' then
    raise exception 'Recusa usa o motivo "recusado"' using errcode = '22023';
  end if;
  if p_decision = 'approve' and (p_reason is null or p_reason::text not in ('cadeira_extra', 'crianca_colo', 'walk_in_liberado')) then
    raise exception 'Motivo de aprovação não suportado' using errcode = '22023';
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
  select table_number into v_table_number from public.tables where id = v_request.table_id;

  if v_request.request_kind = 'open' then
    if p_decision = 'approve' then
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
revoke all on function public.restaurant_resolve_capacity_request(uuid, text, public.noowe_capacity_decision_reason, text) from public;
grant execute on function public.restaurant_resolve_capacity_request(uuid, text, public.noowe_capacity_decision_reason, text) to authenticated;

-- ── 6. Resolução do QR: o app só pergunta o nº de pessoas a quem abre a mesa ─
create or replace function public.customer_resolve_service_qr(p_qr_data text)
returns jsonb language plpgsql stable security definer
set search_path = public, private, pg_temp as $$
declare v_table public.table_qr_codes; v_counter public.counter_qr_codes; v_models public.noowe_service_model[];
  v_selected public.noowe_service_model; v_session_id uuid;
begin
  if p_qr_data is null or length(trim(p_qr_data)) < 8 then
    raise exception 'QR inválido' using errcode = '22023';
  end if;
  select * into v_counter from public.counter_qr_codes
    where qr_code_data = p_qr_data and is_active and (expires_at is null or expires_at > now());
  if v_counter.id is not null then
    if not private.restaurant_is_open_now(v_counter.restaurant_id) then
      raise exception 'Restaurante fechado no momento' using errcode = 'P0010';
    end if;
    return jsonb_build_object('kind','counter','restaurantId',v_counter.restaurant_id,
      'serviceModel','quick_service','counterLabel',v_counter.label);
  end if;
  select * into v_table from public.table_qr_codes
    where qr_code_data = p_qr_data and is_active and (expires_at is null or expires_at > now());
  if v_table.id is null then raise exception 'QR inválido ou expirado' using errcode = 'P0002'; end if;
  select c.service_models,
    case when r.service_type in ('fine_dining','casual_dining') then r.service_type::public.noowe_service_model
      when 'casual_dining'::public.noowe_service_model=any(c.service_models) then 'casual_dining'::public.noowe_service_model
      else 'fine_dining'::public.noowe_service_model end
  into v_models,v_selected from public.restaurant_model_configs c join public.restaurants r on r.id=c.restaurant_id
  where c.restaurant_id = v_table.restaurant_id;
  select s.id into v_session_id from public.table_sessions s
    where s.table_id = v_table.table_id and s.status = 'active' order by s.started_at desc limit 1;
  return jsonb_build_object('kind','table','restaurantId',v_table.restaurant_id,
    'tableId',v_table.table_id,'tableQrId',v_table.id,
    'serviceModel',v_selected,
    'allowedServiceModels', to_jsonb(array_remove(v_models, 'quick_service'::public.noowe_service_model)),
    'seats', (select seats::integer from public.tables where id = v_table.table_id),
    'hasActiveSession', v_session_id is not null,
    'isParticipant', v_session_id is not null and private.is_table_session_participant(v_session_id));
end $$;
grant execute on function public.customer_resolve_service_qr(text) to anon, authenticated;
