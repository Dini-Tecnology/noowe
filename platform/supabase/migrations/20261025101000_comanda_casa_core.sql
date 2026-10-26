-- G4 (ADR-021) — núcleo da comanda no servidor.
-- Uma comanda ativa por cliente (P0016), saldo por pessoa, sem encerramento por tempo,
-- encerramento manual com motivo e auditoria, configuração dos parâmetros novos.
-- Cada função é recriada a partir da versão mais recente; comentários "ADR-021" marcam a mudança.

alter table public.restaurant_model_configs
  add column if not exists reservation_check_in_lead_min integer not null default 5
    check (reservation_check_in_lead_min between 0 and 120),
  add column if not exists session_idle_alert_min integer not null default 120
    check (session_idle_alert_min between 15 and 1440);

-- ---------------------------------------------------------------------------
-- 1. Uma comanda ativa por cliente (regra isolada nesta função)
-- ---------------------------------------------------------------------------
create or replace function private.assert_single_active_session(p_user_id uuid, p_table_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare v_table text; v_restaurant text;
begin
  perform pg_advisory_xact_lock(hashtextextended('single_active_session:' || p_user_id::text, 0));
  select t.table_number, r.name into v_table, v_restaurant
  from public.table_session_participants p
  join public.table_sessions s on s.id = p.table_session_id
  join public.tables t on t.id = s.table_id
  join public.restaurants r on r.id = s.restaurant_id
  where p.user_id = p_user_id
    and s.status = 'active'
    -- Mesa trocada pela equipe: o QR da mesa antiga continua apontando para a mesma comanda.
    and (p_table_id is null or (s.table_id <> p_table_id and s.previous_table_id is distinct from p_table_id))
  order by s.last_activity desc
  limit 1;
  if found then
    raise exception 'Você já está na % da %. Encerre a comanda para continuar.',
      case when v_table ~* '^\s*mesa' then v_table else 'Mesa ' || v_table end, v_restaurant
      using errcode = 'P0016';
  end if;
end;
$$;
revoke all on function private.assert_single_active_session(uuid, uuid) from public, anon, authenticated;

-- Os pontos de entrada antigos delegam: nada mais move o cliente de mesa em silêncio.
create or replace function private.assert_can_switch_to_table(p_user_id uuid, p_table_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  perform private.assert_single_active_session(p_user_id, p_table_id);
end;
$$;

create or replace function private.leave_other_tables(p_user_id uuid, p_table_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  perform private.assert_single_active_session(p_user_id, p_table_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Saldo por pessoa (regra isolada nesta função)
-- ---------------------------------------------------------------------------
-- Dívida de quem consumiu: itens cujo dono (ou responsável pelo dono) é a pessoa; item sem dono cai em
-- quem fez o pedido. Parcela própria já paga zera a dívida; parcela própria aberta vale se maior.
create or replace function private.participant_open_balance_cents(p_session uuid, p_participant uuid)
returns bigint
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $$
declare v_base bigint; v_fee bigint := 0; v_open_share bigint;
begin
  if exists (select 1 from public.bill_shares s
    where s.table_session_id = p_session and s.participant_id = p_participant and s.status = 'paid') then
    return 0;
  end if;

  select coalesce(sum(b.remaining_cents), 0)::bigint into v_base
  from private.session_balances(p_session, '{}', array['paid']::public.noowe_bill_share_status[]) b
  join public.order_items oi on oi.id = b.order_item_id
  join public.orders o on o.id = oi.order_id
  where coalesce(
    private.responsible_participant(b.owner_participant),
    (select p.id from public.table_session_participants p
      where p.table_session_id = p_session and p.user_id = o.customer_id limit 1)
  ) = p_participant;

  begin
    v_fee := private.service_fee_cents(v_base, private.session_fee_bps(p_session));
  exception when others then
    v_fee := 0;
  end;

  select coalesce(sum(s.amount_cents), 0)::bigint into v_open_share
  from public.bill_shares s
  where s.table_session_id = p_session and s.participant_id = p_participant
    and s.status in ('open', 'pending_payment');

  return greatest(v_base + v_fee, v_open_share);
end;
$$;
revoke all on function private.participant_open_balance_cents(uuid, uuid) from public, anon, authenticated;

create or replace function public.customer_my_table_balance(p_table_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $$
declare v_participant uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select p.id into v_participant from public.table_session_participants p
    join public.table_sessions s on s.id = p.table_session_id and s.status = 'active'
    where p.table_session_id = p_table_session_id and p.user_id = auth.uid();
  if v_participant is null then
    raise exception 'Active table session not accessible' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'owedCents', private.participant_open_balance_cents(p_table_session_id, v_participant),
    'hasConsumption', exists (
      select 1 from public.orders o
      where o.table_session_id = p_table_session_id and o.customer_id = auth.uid()
        and o.status::text <> 'cancelled')
  );
end;
$$;
revoke all on function public.customer_my_table_balance(uuid) from public, anon;
grant execute on function public.customer_my_table_balance(uuid) to authenticated;

create or replace function private.leave_table_session_as(p_table_session_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_session public.table_sessions;
  v_next_host uuid;
  v_remaining integer;
begin
  select * into v_session
  from public.table_sessions
  where id = p_table_session_id and status = 'active'
  for update;

  if v_session.id is null or not exists (
    select 1 from public.table_session_participants
    where table_session_id = p_table_session_id and user_id = p_user_id
  ) then
    raise exception 'Active table session not accessible' using errcode = 'P0002';
  end if;

  -- ADR-021: a dívida é da pessoa (diner), não de quem digitou o pedido, e parcela paga zera.
  if private.participant_open_balance_cents(p_table_session_id, (
    select p.id from public.table_session_participants p
    where p.table_session_id = p_table_session_id and p.user_id = p_user_id)) > 0 then
    raise exception 'Quite sua parte da conta antes de sair da mesa' using errcode = 'P0004';
  end if;

  delete from public.table_session_participants
  where table_session_id = p_table_session_id and user_id = p_user_id;

  select count(*)::integer into v_remaining
  from public.table_session_participants
  where table_session_id = p_table_session_id and user_id is not null;

  if v_remaining > 0 and (v_session.customer_id = p_user_id or v_session.primary_user_id = p_user_id) then
    select user_id into v_next_host
    from public.table_session_participants
    where table_session_id = p_table_session_id and user_id is not null
    order by joined_at
    limit 1;

    update public.table_session_participants
    set is_host = (user_id = v_next_host)
    where table_session_id = p_table_session_id and user_id is not null;

    update public.table_sessions
    set customer_id = v_next_host, primary_user_id = v_next_host,
        last_activity = now(), updated_at = now()
    where id = p_table_session_id;
  elsif v_remaining = 0 then
    if not exists (select 1 from private.table_unpaid_items(p_table_session_id) where remaining_cents > 0) then
      update public.table_sessions
      set status = 'ended', ended_at = now(), last_activity = now(), updated_at = now()
      where id = p_table_session_id;

      if not exists (select 1 from public.orders where table_session_id = p_table_session_id) and exists (
        select 1 from public.reservations
        where table_id = v_session.table_id and status::text = 'seated'
      ) then
        update public.reservations
        set status = 'confirmed', updated_at = now()
        where table_id = v_session.table_id and status::text = 'seated';

        update public.tables
        set status = 'reserved', occupied_since = null, updated_at = now()
        where id = v_session.table_id;
      else
        update public.reservations set status = 'completed', updated_at = now()
        where table_id = v_session.table_id and status::text = 'seated';
        update public.tables
        set status = 'available', occupied_since = null, updated_at = now()
        where id = v_session.table_id and status = 'occupied';
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'tableSessionId', p_table_session_id,
    'left', true,
    'remainingParticipants', v_remaining
  );
end;
$$;
revoke all on function private.leave_table_session_as(uuid, uuid) from public, anon, authenticated;

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
      and r.reservation_time between now() - interval '2 hours' and now() + interval '6 hours'
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
      and r.reservation_time between now()-interval '2 hours' and now()+interval '6 hours'
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
create or replace function private.join_by_invite(p_invite_id uuid, p_user uuid)
returns jsonb language plpgsql security definer
set search_path = public, private, pg_temp as $$
declare v_invite public.table_session_invites; v_session public.table_sessions; v_table public.tables;
  v_occupied integer; v_request_id uuid; v_ttl integer; v_is_participant boolean;
begin
  select * into v_invite from public.table_session_invites where id = p_invite_id for update;
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
end $$;
revoke all on function private.join_by_invite(uuid, uuid) from public, anon, authenticated;
create or replace function public.customer_join_waitlist(
  p_restaurant_id uuid, p_party_size integer, p_preference text default 'qualquer', p_has_kids boolean default false
) returns public.waitlist_entries language plpgsql security definer
set search_path = public, private, pg_temp as $$
declare
  v_profile public.profiles; v_entry public.waitlist_entries; v_position integer;
  v_preference text := coalesce(nullif(btrim(p_preference), ''), 'qualquer');
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_party_size < 1 or p_party_size > 20 then raise exception 'Invalid party size' using errcode = '22023'; end if;
  if not exists(
    select 1 from public.restaurants r
    where r.id = p_restaurant_id and r.is_active
      and r.service_type in ('fine_dining', 'casual_dining', 'quick_service')
      and coalesce((r.service_config->'feature_overrides'->>'virtualQueue')::boolean, true)
      and coalesce((r.settings->'customer_experience'->>'waitlist')::boolean, true)
      and coalesce((r.settings->'customer_experience'->>'journeyArrival')::boolean, true)
  ) then raise exception 'Waitlist is unavailable for this restaurant' using errcode = 'P0001'; end if;
  if not private.restaurant_is_open_now(p_restaurant_id) then
    raise exception 'Restaurant is closed' using errcode = 'P0001';
  end if;

  perform private.assert_single_active_session(auth.uid(), null); -- ADR-021: comanda ativa bloqueia a fila

  if lower(v_preference) = 'qualquer' then
    v_preference := 'qualquer';
  else
    select s into v_preference
    from unnest(private.restaurant_sections(p_restaurant_id)) s
    where private.normalize_section_name(s) = private.normalize_section_name(v_preference)
    limit 1;
    if v_preference is null then
      raise exception 'Setor indisponível neste restaurante' using errcode = '22023';
    end if;
  end if;

  if exists(select 1 from public.waitlist_entries where customer_id = auth.uid()
      and restaurant_id = p_restaurant_id and status in ('waiting', 'called'))
    then raise exception 'Already on waitlist' using errcode = '23505'; end if;
  select * into v_profile from public.profiles where id = auth.uid();
  select coalesce(max(position),0)+1 into v_position from public.waitlist_entries
    where restaurant_id = p_restaurant_id and status = 'waiting';
  insert into public.waitlist_entries(restaurant_id, customer_id, customer_name, customer_phone,
    party_size, preference, has_kids, status, position, created_at, updated_at)
  values(p_restaurant_id, auth.uid(), coalesce(v_profile.full_name,'Cliente'), v_profile.phone,
    p_party_size, v_preference, p_has_kids, 'waiting', v_position, now(), now())
  returning * into v_entry;
  return v_entry;
end $$;

create or replace function public.restaurant_check_in_reservation(
  p_reservation_id uuid,
  p_table_id uuid,
  p_guest_name text default null,
  p_guest_count integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_reservation public.reservations%rowtype;
  v_table public.tables%rowtype;
  v_session public.table_sessions%rowtype;
  v_guest_name text;
  v_guest_count integer;
begin
  select * into v_reservation
  from public.reservations
  where id = p_reservation_id
  for update;

  if v_reservation.id is null then
    raise exception 'Reservation not found' using errcode = 'P0002';
  end if;

  -- ADR-018: o check-in da recepção acontece na mesa principal do grupo.
  select * into v_table from public.tables where id = p_table_id;
  if v_table.merged_into_id is not null then
    raise exception 'Mesa unida a outra: faça o check-in na mesa principal' using errcode = 'P0013';
  end if;
  perform private.lock_floor(v_table.restaurant_id, false);
  select * into v_table
  from public.tables
  where id = p_table_id
  for update;

  if v_table.id is null or v_table.restaurant_id <> v_reservation.restaurant_id then
    raise exception 'Table not found for this reservation' using errcode = 'P0002';
  end if;

  perform private.require_restaurant_role(
    v_reservation.restaurant_id,
    array['owner','manager','maitre']::public.user_roles_role_enum[]
  );

  if v_reservation.status::text <> 'confirmed' then
    raise exception 'Only confirmed reservations can check in' using errcode = '22023';
  end if;

  if v_table.status not in ('available', 'reserved') then
    raise exception 'Table is not available for check-in' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.table_sessions ts
    where ts.table_id = p_table_id and ts.status = 'active'
  ) then
    raise exception 'Table already has an active session' using errcode = '23505';
  end if;

  if v_reservation.customer_id is not null then
    perform private.assert_single_active_session(v_reservation.customer_id, p_table_id); -- ADR-021
  end if;

  v_guest_name := nullif(btrim(p_guest_name), '');
  if v_guest_name is null then
    select coalesce(nullif(btrim(p.full_name), ''), nullif(btrim(p.email), ''), 'Cliente')
    into v_guest_name
    from public.profiles p
    where p.id = v_reservation.customer_id;
  end if;

  v_guest_count := coalesce(p_guest_count, v_reservation.party_size);
  if v_guest_count < 1 or v_guest_count > private.table_effective_seats(p_table_id) then
    raise exception 'Guest count exceeds table capacity' using errcode = '22023';
  end if;

  insert into public.table_sessions(
    table_id, restaurant_id, customer_id, reservation_id, guest_name, guest_count, guest_user_ids,
    status, started_at, last_activity, total_orders, total_spent, created_at, updated_at
  )
  values(
    p_table_id, v_reservation.restaurant_id, v_reservation.customer_id, v_reservation.id,
    v_guest_name, v_guest_count, '[]'::jsonb,
    'active', now(), now(), 0, 0, now(), now()
  )
  returning * into v_session;

  -- ADR-021: o cliente da reserva passa a ser participante, para a comanda aparecer no app dele.
  if v_reservation.customer_id is not null then
    insert into public.table_session_participants(table_session_id, user_id, display_name, is_host)
    values (v_session.id, v_reservation.customer_id, coalesce(v_guest_name, 'Cliente'), true)
    on conflict (table_session_id, user_id) where user_id is not null do nothing;
  end if;

  update public.reservations
  set table_id = p_table_id, status = 'seated', updated_at = now()
  where id = p_reservation_id;

  update public.tables
  set status = 'occupied', occupied_since = now(), updated_at = now()
  where id = p_table_id;

  return jsonb_build_object(
    'reservation_id', p_reservation_id,
    'table_id', p_table_id,
    'session', to_jsonb(v_session)
  );
end;
$$;

revoke all on function public.restaurant_check_in_reservation(uuid, uuid, text, integer) from public;
grant execute on function public.restaurant_check_in_reservation(uuid, uuid, text, integer) to authenticated, service_role;

-- ADR-021: a comanda ativa vem do servidor, com o necessário para o app se reconstruir sozinho.
create or replace function public.customer_get_active_visit()
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_id uuid; v_result jsonb;
begin
  -- Repair paid visits left active by the old checkout, without touching a
  -- visit that has not ordered yet or still has unpaid consumption.
  for v_id in
    select s.id from public.table_sessions s
    join public.table_session_participants p on p.table_session_id = s.id and p.user_id = auth.uid()
    where s.status = 'active'
      and exists (select 1 from public.orders o where o.table_session_id = s.id and o.customer_id = auth.uid())
      and private.participant_open_balance_cents(s.id, p.id) = 0
      and not exists (select 1 from private.table_unpaid_items(s.id) u where u.customer_id = auth.uid() and u.remaining_cents > 0)
  loop
    perform public.customer_leave_table_session(v_id);
  end loop;
  select jsonb_build_object('restaurantId', s.restaurant_id, 'tableId', s.table_id,
    'tableSessionId', s.id, 'tableNumber', t.table_number,
    'restaurantName', r.name, 'serviceModel', s.service_model, 'billingStatus', s.billing_status) into v_result
  from public.table_sessions s
  join public.table_session_participants p on p.table_session_id = s.id and p.user_id = auth.uid()
  join public.tables t on t.id = s.table_id
  join public.restaurants r on r.id = s.restaurant_id
  where s.status = 'active' order by s.last_activity desc limit 1;
  return v_result;
end $$;
revoke all on function public.customer_get_active_visit() from public;
grant execute on function public.customer_get_active_visit() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Equipe: abrir sem derrubar sessão alheia; encerrar com motivo e auditoria
-- ---------------------------------------------------------------------------
create or replace function public.restaurant_open_table_session(
  p_table_id uuid,
  p_guest_name text default null,
  p_guest_count integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_table record;
  v_session record;
begin
  select * into v_table from public.tables where id = p_table_id;
  if v_table.id is null then
    raise exception 'Table not found' using errcode = 'P0002';
  end if;

  perform private.require_restaurant_role(
    v_table.restaurant_id,
    array['owner','manager','waiter','maitre']::public.user_roles_role_enum[]
  );

  -- ADR-021: a mesa só volta a ficar livre quando a comanda encerra; nada fecha a sessão em silêncio.
  if exists (select 1 from public.table_sessions where table_id = p_table_id and status = 'active') then
    raise exception 'Table already has an active session' using errcode = '23505';
  end if;

  insert into public.table_sessions(
    table_id, restaurant_id, guest_name, guest_count, guest_user_ids,
    status, started_at, last_activity, total_orders, total_spent, created_at, updated_at
  )
  values(
    p_table_id, v_table.restaurant_id, p_guest_name, p_guest_count, '[]'::jsonb,
    'active', now(), now(), 0, 0, now(), now()
  )
  returning * into v_session;

  update public.tables
  set status = 'occupied', occupied_since = now(), updated_at = now()
  where id = p_table_id;

  return to_jsonb(v_session);
end;
$$;

-- A trava de saldo (G3) vale para todo caminho, exceto o encerramento manual com motivo desta migration.
create or replace function private.guard_session_close()
returns trigger language plpgsql security definer set search_path = public, private, pg_temp as $$
declare t record;
begin
  if new.status in ('ended', 'closed') and old.status = 'active'
    and coalesce(current_setting('noowe.manual_close', true), '') <> '1'
    and exists (select 1 from public.bill_shares b where b.table_session_id = new.id
      and b.status in ('open', 'pending_payment', 'paid')) then
    select * into t from private.session_totals(new.id);
    if t.paid_sum <> t.total_all then
      raise exception 'Conta com saldo em aberto (pago %, total %)', t.paid_sum, t.total_all using errcode = 'P0010';
    end if;
  end if;
  return new;
end $$;

drop function if exists public.restaurant_close_table_session(uuid);
create or replace function public.restaurant_close_table_session(p_session_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_session public.table_sessions;
  v_updated public.table_sessions;
  v_user uuid;
  v_number text;
begin
  select * into v_session from public.table_sessions where id = p_session_id for update;
  if v_session.id is null then
    raise exception 'Table session not found' using errcode = 'P0002';
  end if;

  perform private.require_restaurant_role(
    v_session.restaurant_id,
    array['owner','manager','waiter','maitre']::public.user_roles_role_enum[]
  );

  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'Motivo obrigatório' using errcode = '22023';
  end if;
  if v_session.status <> 'active' then
    raise exception 'Sessão já encerrada' using errcode = '22023';
  end if;

  -- Mesma transação da ação: encerramento e auditoria andam juntos (invariante 8).
  perform set_config('noowe.manual_close', '1', true);
  update public.table_sessions
  set status = 'ended', ended_at = now(), updated_at = now()
  where id = p_session_id
  returning * into v_updated;

  update public.tables
  set status = 'cleaning', occupied_since = null, updated_at = now()
  where id = v_session.table_id;
  update public.reservations set status = 'completed', updated_at = now()
  where table_id = v_session.table_id and status::text = 'seated';

  select table_number into v_number from public.tables where id = v_session.table_id;
  perform private.log_audit(v_session.restaurant_id, 'table_session.closed_manual', 'table_session',
    v_session.id, p_reason, jsonb_build_object('status', v_session.status),
    jsonb_build_object('status', 'ended', 'table_number', v_number));

  for v_user in
    select p.user_id from public.table_session_participants p
    where p.table_session_id = p_session_id and p.user_id is not null
  loop
    perform private.create_notification(v_user, 'Comanda encerrada',
      'O restaurante encerrou a comanda da mesa ' || coalesce(v_number, '') || '.',
      'table_session_closed', p_session_id, 'table_session',
      jsonb_build_object('kind', 'table_session_closed', 'table_session_id', p_session_id,
        'restaurant_id', v_session.restaurant_id));
  end loop;

  return to_jsonb(v_updated);
end;
$$;
revoke all on function public.restaurant_close_table_session(uuid, text) from public, anon;
grant execute on function public.restaurant_close_table_session(uuid, text) to authenticated, service_role;
