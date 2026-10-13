-- Fine Dining no check-in por QR (complementa o ADR-016; regra do produto de 2026-10-13):
--   * o tamanho do grupo vem da reserva ou da fila, não de uma pergunta ao cliente;
--   * grupo maior que a mesa não entra: a recepção junta ou troca a mesa antes (P0011),
--     em vez da solicitação de "cadeira extra" do Casual;
--   * convidado que aceitou o convite da reserva (reservation_guests) tem associação válida
--     com a mesa, então seu scan segue para a sessão do titular;
--   * QR de mesa de um restaurante só de retirada (Quick) é recusado com motivo próprio (P0012).
-- As regras ficam em funções nomeadas e são lidas da policy, nunca do nome do modelo.

create or replace function private.check_in_party_from_entry(p_policy public.restaurant_model_policies)
returns boolean language sql immutable as $$
  select coalesce(p_policy.reservation_required, false)
$$;

create or replace function private.over_capacity_blocks_check_in(p_policy public.restaurant_model_policies)
returns boolean language sql immutable as $$
  select coalesce(p_policy.reservation_required, false)
$$;

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
  v_reason text; v_had_session boolean; v_approved_seats integer; v_inserted boolean; v_entry_party integer;
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

  -- Titular da reserva ou convidado que aceitou o convite dela (scans seguintes no Fine).
  select r.id, r.party_size into v_reservation_id, v_entry_party from public.reservations r
    where r.restaurant_id=v_qr.restaurant_id
      and (r.customer_id=auth.uid() or exists (
        select 1 from public.reservation_guests g
        where g.reservation_id=r.id and g.guest_user_id=auth.uid() and g.status='accepted'))
      -- 'seated': o titular já fez check-in e o convidado chega depois.
      and r.status::text in ('confirmed','seated') and (r.table_id is null or r.table_id=v_qr.table_id)
      and r.reservation_time between now()-interval '2 hours' and now()+interval '6 hours'
    order by r.reservation_time limit 1;
  if v_reservation_id is null then
    select w.id, w.party_size into v_waitlist_id, v_entry_party from public.waitlist_entries w join public.tables t on t.id=v_qr.table_id
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
        if v_occupied+1>v_capacity and private.over_capacity_blocks_check_in(v_policy) then
          raise exception 'Mesa lotada: a recepção precisa ajustar a mesa antes da sua entrada'
            using errcode='P0011';
        end if;
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
      -- Onde a entrada é por reserva/fila, o tamanho do grupo é o registrado nela, e grupo maior
      -- que a mesa não entra: a recepção ajusta (junta ou troca) a mesa antes do check-in.
      if v_has_entry and private.check_in_party_from_entry(v_policy) then
        v_party := coalesce(v_entry_party, v_party);
      end if;
      if v_enforce and v_party>v_capacity and private.over_capacity_blocks_check_in(v_policy) then
        raise exception 'Grupo maior que a mesa: a recepção precisa ajustar a mesa antes do check-in'
          using errcode='P0011';
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

create or replace function public.customer_resolve_service_qr(p_qr_data text)
returns jsonb language plpgsql stable security definer
set search_path = public, private, pg_temp as $$
declare v_table public.table_qr_codes; v_counter public.counter_qr_codes; v_models public.noowe_service_model[];
  v_selected public.noowe_service_model; v_session_id uuid; v_policy public.restaurant_model_policies;
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
  if v_models is not null and not exists (
    select 1 from unnest(v_models) m where m <> 'quick_service'::public.noowe_service_model
  ) then
    raise exception 'Este restaurante atende só por retirada' using errcode = 'P0012';
  end if;
  select * into v_policy from public.restaurant_model_policies
    where restaurant_id = v_table.restaurant_id and service_model = v_selected;
  select s.id into v_session_id from public.table_sessions s
    where s.table_id = v_table.table_id and s.status = 'active' order by s.started_at desc limit 1;
  return jsonb_build_object('kind','table','restaurantId',v_table.restaurant_id,
    'tableId',v_table.table_id,'tableQrId',v_table.id,
    'serviceModel',v_selected,
    'allowedServiceModels', to_jsonb(array_remove(v_models, 'quick_service'::public.noowe_service_model)),
    'seats', (select seats::integer from public.tables where id = v_table.table_id),
    'hasActiveSession', v_session_id is not null,
    'asksPartySize', not private.check_in_party_from_entry(v_policy),
    'isParticipant', v_session_id is not null and private.is_table_session_participant(v_session_id));
end $$;
grant execute on function public.customer_resolve_service_qr(text) to anon, authenticated;
