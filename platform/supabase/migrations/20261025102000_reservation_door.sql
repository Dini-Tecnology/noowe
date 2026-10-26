-- G4 / ADR-021 — porta 2: Reserva.
-- Check-in abre `reservation_check_in_lead_min` antes do horário e fecha ao fim da tolerância
-- (`reservation_no_show_min`). Passada a tolerância a reserva expira (no_show) de forma preguiçosa:
-- não há pg_cron. A regra mora nas funções nomeadas abaixo.

alter table public.reservations add column if not exists checked_in_at timestamptz;

-- Janela de check-in (regra isolada, ADR-021 item 8).
create or replace function private.reservation_check_in_window(p_restaurant uuid, p_reservation_time timestamptz)
returns table(opens_at timestamptz, closes_at timestamptz)
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select p_reservation_time - make_interval(mins => coalesce(c.reservation_check_in_lead_min, 5)),
         p_reservation_time + make_interval(mins => coalesce(c.reservation_no_show_min, 15))
  from (select 1) one
  left join public.restaurant_model_configs c on c.restaurant_id = p_restaurant
$$;
revoke all on function private.reservation_check_in_window(uuid, timestamptz) from public, anon, authenticated;

create or replace function private.reservation_in_check_in_window(p_restaurant uuid, p_reservation_time timestamptz)
returns boolean
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select now() between w.opens_at and w.closes_at
  from private.reservation_check_in_window(p_restaurant, p_reservation_time) w
$$;
revoke all on function private.reservation_in_check_in_window(uuid, timestamptz) from public, anon, authenticated;

-- Expiração preguiçosa: reserva confirmada que passou da tolerância vira no_show e libera a mesa reservada.
create or replace function private.reservation_expire_sweep(p_restaurant uuid default null, p_customer uuid default null)
returns integer
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare v_count integer := 0; v_res record;
begin
  for v_res in
    select r.id, r.table_id from public.reservations r
    where r.status::text = 'confirmed'
      and (p_restaurant is null or r.restaurant_id = p_restaurant)
      and (p_customer is null or r.customer_id = p_customer)
      and now() > (select w.closes_at from private.reservation_check_in_window(r.restaurant_id, r.reservation_time) w)
    for update skip locked
  loop
    update public.reservations set status = 'no_show', updated_at = now() where id = v_res.id;
    if v_res.table_id is not null then
      update public.tables t set status = 'available', updated_at = now()
      where t.id = v_res.table_id and t.status = 'reserved'
        and not exists (select 1 from public.reservations o
          where o.table_id = t.id and o.id <> v_res.id and o.status::text = 'confirmed');
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke all on function private.reservation_expire_sweep(uuid, uuid) from public, anon, authenticated;

create or replace function public.customer_open_table_session(p_qr_data text)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_qr public.table_qr_codes;
  v_table public.tables;
  v_session public.table_sessions;
  v_reservation public.reservations;
  v_name text;
  v_data text := btrim(p_qr_data);
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  -- Look up the code ignoring active/expiry/signature first so we can tell
  -- "never existed" apart from "existed but is no longer usable".
  select * into v_qr
  from public.table_qr_codes
  where qr_code_data = v_data
  order by created_at desc
  limit 1;

  if v_qr.id is null then
    raise exception 'QR code not recognized' using errcode = '22023';
  end if;

  if v_qr.signature is distinct from encode(sha256(v_qr.qr_code_data::bytea), 'hex') then
    raise exception 'QR code failed signature check' using errcode = '22023';
  end if;

  if not v_qr.is_active then
    raise exception 'QR code was replaced by a newer one' using errcode = 'P0006';
  end if;

  if v_qr.expires_at is not null and v_qr.expires_at <= now() then
    raise exception 'QR code has expired' using errcode = 'P0007';
  end if;

  if not exists (
    select 1 from public.restaurants r where r.id = v_qr.restaurant_id and r.is_active
  ) then
    raise exception 'Restaurant is not active' using errcode = '22023';
  end if;

  -- ADR-018: QR de mesa unida abre a sessão da mesa principal (uma sessão e uma conta por grupo).
  perform private.lock_floor(v_qr.restaurant_id, false);

  select * into v_table
  from public.tables
  where id = private.table_group_root(v_qr.table_id) and restaurant_id = v_qr.restaurant_id
  for update;

  if v_table.id is null or v_table.status in ('blocked', 'cleaning', 'payment') then
    raise exception 'Table is not available for check-in' using errcode = 'P0005';
  end if;

  -- If staff assigned this table to a confirmed reservation, the QR doubles
  -- as a secure self check-in: only the reservation owner or an accepted
  -- invited guest can occupy it. Manually reserved tables without a linked
  -- reservation keep the ordinary walk-in QR flow.
  if v_table.status = 'reserved' then
    select * into v_reservation
    from public.reservations r
    where r.table_id = v_table.id
      and r.status::text = 'confirmed'
      and private.reservation_in_check_in_window(r.restaurant_id, r.reservation_time)
    order by r.reservation_time
    limit 1
    for update;

    if v_reservation.id is not null
      and v_reservation.customer_id is distinct from auth.uid()
      and not exists (
        select 1 from public.reservation_guests g
        where g.reservation_id = v_reservation.id
          and g.guest_user_id = auth.uid()
          and g.status = 'accepted'
      )
    then
      raise exception 'This table is reserved for another customer' using errcode = 'P0005';
    end if;
  end if;

  -- ADR-021: uma comanda ativa por cliente. Quem já está em outra mesa é recusado (P0016), não movido,
  -- e nenhuma sessão é encerrada por inatividade: comanda parada só gera alerta à equipe.
  perform private.assert_single_active_session(auth.uid(), v_table.id);

  select * into v_session
  from public.table_sessions
  where table_id = v_table.id and status = 'active'
  order by started_at desc
  limit 1;

  if v_session.id is null then
    insert into public.table_sessions(
      restaurant_id, table_id, qr_code_id, customer_id, primary_user_id,
      guest_user_ids, guest_count, status, started_at, last_activity,
      total_orders, total_spent, created_at, updated_at
    ) values (
      v_table.restaurant_id, v_table.id, v_qr.id, auth.uid(), auth.uid(),
      '[]', 1, 'active', now(), now(), 0, 0, now(), now()
    ) returning * into v_session;
  else
    update public.table_sessions
    set qr_code_id = coalesce(qr_code_id, v_qr.id),
        customer_id = coalesce(customer_id, auth.uid()),
        primary_user_id = coalesce(primary_user_id, auth.uid()),
        last_activity = now(),
        updated_at = now()
    where id = v_session.id
    returning * into v_session;
  end if;

  select full_name into v_name from public.profiles where id = auth.uid();
  insert into public.table_session_participants(table_session_id, user_id, display_name, is_host)
  values (
    v_session.id,
    auth.uid(),
    coalesce(nullif(btrim(v_name), ''), 'Cliente'),
    v_session.customer_id = auth.uid()
  )
  on conflict (table_session_id, user_id) where user_id is not null
  do update set display_name = excluded.display_name;

  update public.tables
  set status = 'occupied', occupied_since = coalesce(occupied_since, now()), updated_at = now()
  where id = v_table.id;

  if v_reservation.id is not null then
    update public.reservations
    set status = 'seated', updated_at = now()
    where id = v_reservation.id;
  end if;

  return jsonb_build_object(
    'restaurantId', v_table.restaurant_id,
    'tableId', v_table.id,
    'tableSessionId', v_session.id,
    'tableNumber', v_table.table_number
  );
end;
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
  v_root uuid; v_moved_session uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if p_service_model='quick_service' then raise exception 'Quick Service não usa check-in de mesa' using errcode='23514'; end if;
  select * into v_qr from public.table_qr_codes where qr_code_data=btrim(p_qr_data) and is_active;
  if v_qr.id is null then raise exception 'QR inválido' using errcode='22023'; end if;
  if not p_skip_entry_gates and not private.restaurant_is_open_now(v_qr.restaurant_id) then
    raise exception 'Restaurante fechado no momento' using errcode='P0010';
  end if;
  -- ADR-018: QR de mesa unida vale pela mesa principal.
  perform private.reservation_expire_sweep(v_qr.restaurant_id, auth.uid()); -- ADR-021: expiração preguiçosa
  perform private.lock_floor(v_qr.restaurant_id, false);
  v_root := private.table_group_root(v_qr.table_id);
  perform private.assert_single_active_session(auth.uid(), v_root); -- ADR-021
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

  -- ADR-018: QR antigo depois de uma troca de mesa devolve a visita atual, sem abrir outra sessão.
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
  elsif not p_skip_entry_gates then
    -- Abertura de mesa. Uma liberação do maître ainda válida e não usada dispensa os gates.
    select c.id, c.seat_count into v_approved_id, v_approved_seats from public.capacity_requests c
      where c.table_id=v_root and c.requested_user_id=auth.uid() and c.request_kind='open'
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
  -- Aviso à equipe: só quem abre a mesa (não quem entra numa sessão existente).
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
end $$;
revoke all on function private.table_check_in(text,public.noowe_service_model,boolean,integer) from public, anon, authenticated;
-- Lista as reservas do cliente já com a janela de check-in calculada no servidor.
create or replace function public.customer_list_reservations()
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  perform private.reservation_expire_sweep(null, auth.uid());
  return coalesce((
    select jsonb_agg(
      to_jsonb(r) || jsonb_build_object(
        'restaurant', jsonb_build_object('name', x.name, 'logo_url', x.logo_url, 'banner_url', x.banner_url),
        'check_in_opens_at', w.opens_at,
        'check_in_closes_at', w.closes_at)
      order by r.reservation_time desc)
    from public.reservations r
    join public.restaurants x on x.id = r.restaurant_id
    cross join lateral private.reservation_check_in_window(r.restaurant_id, r.reservation_time) w
    where r.customer_id = auth.uid()
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.customer_list_reservations() from public, anon;
grant execute on function public.customer_list_reservations() to authenticated;

-- "Fazer check-in" no app: registra a chegada dentro da janela. A comanda abre quando o cliente lê o
-- QR da mesa (ou a recepção senta); se a mesa ainda não está pronta, a reserva fica aguardando.
create or replace function public.customer_reservation_check_in(p_reservation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare v_res public.reservations; v_table_status text;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  perform private.reservation_expire_sweep(null, auth.uid());
  select * into v_res from public.reservations where id = p_reservation_id and customer_id = auth.uid() for update;
  if v_res.id is null then raise exception 'Reservation not found' using errcode = 'P0002'; end if;
  if v_res.status::text <> 'confirmed' then
    raise exception 'Reserva não está disponível para check-in' using errcode = 'P0001';
  end if;
  if not private.reservation_in_check_in_window(v_res.restaurant_id, v_res.reservation_time) then
    raise exception 'Fora da janela de check-in' using errcode = 'P0001';
  end if;
  if not private.restaurant_is_open_now(v_res.restaurant_id) then
    raise exception 'Restaurante fechado no momento' using errcode = 'P0010';
  end if;
  perform private.assert_single_active_session(auth.uid(), null);
  update public.reservations set checked_in_at = coalesce(checked_in_at, now()), updated_at = now() where id = v_res.id;
  select t.status into v_table_status from public.tables t where t.id = v_res.table_id;
  return jsonb_build_object('reservationId', v_res.id, 'restaurantId', v_res.restaurant_id,
    'tableReady', v_res.table_id is not null and v_table_status in ('available', 'reserved'));
end;
$$;
revoke all on function public.customer_reservation_check_in(uuid) from public, anon;
grant execute on function public.customer_reservation_check_in(uuid) to authenticated;
