-- QA 2026-11-25: lotação pelo atalho e corrida na lotação (invariante 7).
-- table_check_in trava a linha da mesa antes de contar lugares; o atalho de teste não pula mais a lotação.
-- join_by_invite trava a mesma linha, então QR e convite disputam o mesmo lock.

CREATE OR REPLACE FUNCTION private.table_check_in(p_qr_data text, p_service_model noowe_service_model, p_skip_entry_gates boolean, p_party_size integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare v_qr public.table_qr_codes; v_policy public.restaurant_model_policies;
  v_reservation_id uuid; v_waitlist_id uuid; v_visit jsonb; v_session_id uuid;
  v_active_session public.table_sessions; v_occupied integer; v_capacity integer; v_request_id uuid;
  v_enforce boolean; v_ttl integer; v_party integer; v_has_entry boolean; v_approved_id uuid;
  v_reason text; v_had_session boolean; v_approved_seats integer; v_inserted boolean; v_entry_party integer;
  v_root uuid; v_moved_session uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if p_service_model='quick_service' then raise exception 'Quick Service não usa check-in de mesa' using errcode='23514'; end if;
  select * into v_qr from public.table_qr_codes where qr_code_data=btrim(p_qr_data) and is_active;
  if v_qr.id is null then raise exception 'QR inválido' using errcode='22023'; end if;
  if not p_skip_entry_gates and not private.restaurant_is_open_now(v_qr.restaurant_id) then
    raise exception 'Restaurante fechado no momento' using errcode='P0010';
  end if;
  perform private.reservation_expire_sweep(v_qr.restaurant_id, auth.uid()); -- ADR-021: expiração preguiçosa
  perform private.lock_floor(v_qr.restaurant_id, false);
  v_root := private.table_group_root(v_qr.table_id);
  -- Invariante 7: serializa entradas concorrentes na mesma mesa; a contagem de lugares vem depois deste lock.
  perform 1 from public.tables where id=v_root for update;
  perform private.assert_single_active_session(auth.uid(), v_root); -- ADR-021
  select * into v_policy from public.restaurant_model_policies
    where restaurant_id=v_qr.restaurant_id and service_model=p_service_model and table_check_in_enabled;
  if v_policy.restaurant_id is null then raise exception 'Check-in indisponível para este modelo' using errcode='23514'; end if;

  select r.id, r.party_size into v_reservation_id, v_entry_party from public.reservations r
    where r.restaurant_id=v_qr.restaurant_id
      and (r.customer_id=auth.uid() or exists (
        select 1 from public.reservation_guests g
        where g.reservation_id=r.id and g.guest_user_id=auth.uid() and g.status='accepted'))
      and r.status::text in ('confirmed','seated') and (r.table_id is null or private.table_group_root(r.table_id)=v_root)
      and (r.status::text = 'seated' or private.reservation_in_check_in_window(r.restaurant_id, r.reservation_time))
    order by r.reservation_time limit 1;
  if v_reservation_id is null then
    select w.id, w.party_size into v_waitlist_id, v_entry_party from public.waitlist_entries w join public.tables t on t.id=v_root
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
  v_capacity := private.table_effective_seats(v_root);

  select * into v_active_session from public.table_sessions
    where table_id=v_root and status='active' order by started_at desc limit 1;
  v_had_session := v_active_session.id is not null;
  v_party := greatest(coalesce(p_party_size, 1), 1);

  if not v_had_session then
    select s.id into v_moved_session from public.table_sessions s
      join public.table_session_participants p on p.table_session_id=s.id
      where s.previous_table_id=v_root and s.status='active' and p.user_id=auth.uid()
      order by s.started_at desc limit 1;
    if v_moved_session is not null then
      return private.table_session_visit_payload(v_moved_session)
        || jsonb_build_object('serviceModel',p_service_model,'tableMoved',true);
    end if;
  end if;

  if v_had_session then
    if not private.is_table_session_participant(v_active_session.id) then
      if not p_skip_entry_gates and private.check_in_requires_booking(v_policy) and not v_has_entry then
        raise exception 'Check-in exige reserva confirmada ou chamada válida da fila' using errcode='P0005';
      end if;
      if v_enforce then
        select coalesce(sum(seat_count),0)::integer into v_occupied from public.table_session_participants
          where table_session_id=v_active_session.id;
        if v_occupied+1>v_capacity and private.over_capacity_blocks_check_in(v_policy) then
          raise exception 'Mesa lotada: a recepção precisa ajustar a mesa antes da sua entrada'
            using errcode='P0011';
        end if;
        if v_occupied+1>v_capacity then
          insert into public.capacity_requests(restaurant_id,table_session_id,table_id,requested_user_id,
            source,seat_count,occupied_seats_at_request,capacity_at_request,expires_at,request_kind,trigger_reason,service_model)
          values(v_qr.restaurant_id,v_active_session.id,v_root,auth.uid(),'table_qr',1,
            v_occupied,v_capacity,now()+make_interval(mins=>v_ttl),'join','capacity',p_service_model)
          on conflict(table_session_id,requested_user_id) where status='pending'
          do update set expires_at=excluded.expires_at returning id, (xmax=0) into v_request_id, v_inserted;
          if v_inserted then
            perform private.log_audit(v_qr.restaurant_id,'capacity_request.created','capacity_request',v_request_id,
              'lotacao_excedida',null,jsonb_build_object('source','table_qr','occupied',v_occupied,'capacity',v_capacity),auth.uid());
          end if;
          return jsonb_build_object('status','awaiting_capacity','capacityRequestId',v_request_id,
            'requestKind','join','reason','capacity',
            'restaurantId',v_qr.restaurant_id,'tableId',v_root,'serviceModel',p_service_model);
        end if;
      end if;
    end if;
  else
    -- Atalho de teste pula horário, reserva e fila, nunca a lotação (invariante 7).
    select c.id, c.seat_count into v_approved_id, v_approved_seats from public.capacity_requests c
      where c.table_id=v_root and c.requested_user_id=auth.uid() and c.request_kind='open'
        and c.status='approved' and c.consumed_at is null
        and c.decided_at > now()-make_interval(mins=>v_ttl)
      order by c.decided_at desc limit 1;
    if v_approved_id is not null then
      v_party := v_approved_seats;
    else
      if not p_skip_entry_gates and private.check_in_requires_booking(v_policy) and not v_has_entry then
        raise exception 'Check-in exige reserva confirmada ou chamada válida da fila' using errcode='P0005';
      end if;
      if v_has_entry and private.check_in_party_from_entry(v_policy) then
        v_party := coalesce(v_entry_party, v_party);
      end if;
      if v_enforce and v_party>v_capacity and private.over_capacity_blocks_check_in(v_policy) then
        raise exception 'Grupo maior que a mesa: a recepção precisa ajustar a mesa antes do check-in'
          using errcode='P0011';
      end if;
      v_reason := case
        when not p_skip_entry_gates and not v_has_entry and private.walk_in_needs_host_approval(v_qr.restaurant_id, v_policy) then 'queue_active'
        when v_enforce and v_party>v_capacity then 'capacity'
        else null end;
      if v_reason is not null then
        insert into public.capacity_requests(restaurant_id,table_session_id,table_id,requested_user_id,
          source,seat_count,occupied_seats_at_request,capacity_at_request,expires_at,request_kind,trigger_reason,service_model)
        values(v_qr.restaurant_id,null,v_root,auth.uid(),'table_qr',v_party,
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
          'restaurantId',v_qr.restaurant_id,'tableId',v_root,'serviceModel',p_service_model);
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
  if not v_had_session and private.check_in_notifies_waiter(v_policy) then
    perform private.notify_table_check_in(v_qr.restaurant_id, v_root, v_session_id, v_party);
  end if;
  if v_reservation_id is not null then
    update public.reservations set status='seated', updated_at=now()
      where id=v_reservation_id and status::text='confirmed' and customer_id=auth.uid();
  end if;
  if v_waitlist_id is not null then
    update public.waitlist_entries set status='seated',seated_at=now(),updated_at=now() where id=v_waitlist_id;
    update public.orders set table_session_id=v_session_id,table_id=v_root,
      waitlist_entry_id=null,origin_type='table_session',updated_at=now()
      where waitlist_entry_id=v_waitlist_id and customer_id=auth.uid();
  end if;
  return v_visit || jsonb_build_object('serviceModel',p_service_model,
    'reservationId',v_reservation_id,'waitlistEntryId',v_waitlist_id);
end $function$;

CREATE OR REPLACE FUNCTION private.join_by_invite(p_invite_id uuid, p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare v_invite public.table_session_invites; v_session public.table_sessions; v_table public.tables;
  v_occupied integer; v_request_id uuid; v_ttl integer; v_is_participant boolean;
begin
  select * into v_invite from public.table_session_invites where id = p_invite_id for update;
  -- Invariante 7: mesmo lock de mesa do check-in por QR, antes da sessão (mesma ordem, sem deadlock).
  perform 1 from public.tables where id = (select table_id from public.table_sessions where id = v_invite.table_session_id) for update;
  select * into v_session from public.table_sessions where id = v_invite.table_session_id and status = 'active' for update;
  if v_session.id is null then raise exception 'This table session has ended' using errcode = 'P0001'; end if;
  select * into v_table from public.tables where id = v_session.table_id;
  v_is_participant := exists (select 1 from public.table_session_participants
    where table_session_id = v_session.id and user_id = p_user);
  if not v_is_participant then
    perform private.assert_single_active_session(p_user, v_session.table_id); -- ADR-021
  end if;
  if not v_is_participant and v_invite.max_uses is not null and v_invite.uses >= v_invite.max_uses then
    raise exception 'Invalid or expired invitation' using errcode = 'P0001';
  end if;
  if (select enforce_table_capacity from public.restaurant_model_configs where restaurant_id = v_session.restaurant_id)
    and not v_is_participant then
    select coalesce(sum(seat_count), 0)::integer into v_occupied from public.table_session_participants where table_session_id = v_session.id;
    if v_occupied + 1 > v_table.seats then
      select capacity_request_ttl_min into v_ttl from public.restaurant_model_configs where restaurant_id = v_session.restaurant_id;
      insert into public.capacity_requests(restaurant_id, table_session_id, table_id, requested_user_id, source,
        seat_count, occupied_seats_at_request, capacity_at_request, expires_at)
      values (v_session.restaurant_id, v_session.id, v_session.table_id, p_user, 'guest_link', 1,
        v_occupied, v_table.seats::integer, now() + make_interval(mins => v_ttl))
      on conflict (table_session_id, requested_user_id) where status = 'pending'
      do update set expires_at = excluded.expires_at returning id into v_request_id;
      return jsonb_build_object('status', 'awaiting_capacity', 'capacityRequestId', v_request_id,
        'restaurantId', v_session.restaurant_id, 'tableId', v_session.table_id, 'serviceModel', v_session.service_model);
    end if;
  end if;
  perform private.join_table_session_participant(v_session.id, p_user, 1);
  if not v_is_participant then
    update public.table_session_invites set uses = uses + 1 where id = v_invite.id;
  end if;
  return jsonb_build_object('restaurantId', v_session.restaurant_id, 'tableId', v_session.table_id,
    'tableSessionId', v_session.id, 'tableNumber', v_table.table_number, 'serviceModel', v_session.service_model);
end $function$;
