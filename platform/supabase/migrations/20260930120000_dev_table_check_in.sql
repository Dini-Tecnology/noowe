-- Botão "Mesa teste" do app cliente depois da V2.
--
-- A V2 passou o app a entrar na mesa por customer_check_in, que em Fine e
-- Casual exige reserva confirmada ou chamada da fila (P0005). O atalho de
-- emulador (customer_dev_pick_table_qr) só entrega um QR real, então caía
-- nessa regra e mostrava "Mesa indisponível" sem nenhuma reserva para testar.
--
-- O corpo do check-in vai para private.table_check_in com um único parâmetro
-- que liga ou desliga a exigência de reserva/fila. customer_check_in continua
-- exigindo; customer_dev_check_in só dispensa essa exigência e só roda com
-- private.dev_flags.simulate_table_scan ligada — a mesma chave do seletor de
-- mesa de teste. Política do modelo, capacidade e a sessão única por mesa
-- continuam valendo nos dois caminhos.

create or replace function private.table_check_in(
  p_qr_data text,
  p_service_model public.noowe_service_model,
  p_require_booking boolean
) returns jsonb language plpgsql security definer
set search_path=public,private,pg_temp as $$
declare v_qr public.table_qr_codes; v_policy public.restaurant_model_policies;
  v_reservation_id uuid; v_waitlist_id uuid; v_visit jsonb; v_session_id uuid;
  v_active_session public.table_sessions; v_occupied integer; v_capacity integer; v_request_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if p_service_model='quick_service' then raise exception 'Quick Service não usa check-in de mesa' using errcode='23514'; end if;
  select * into v_qr from public.table_qr_codes where qr_code_data=btrim(p_qr_data) and is_active;
  if v_qr.id is null then raise exception 'QR inválido' using errcode='22023'; end if;
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
  if p_require_booking and v_reservation_id is null and v_waitlist_id is null then
    raise exception 'Check-in exige reserva confirmada ou chamada válida da fila' using errcode='P0005';
  end if;
  if (select enforce_table_capacity from public.restaurant_model_configs where restaurant_id=v_qr.restaurant_id) then
    select * into v_active_session from public.table_sessions
      where table_id=v_qr.table_id and status='active' order by started_at desc limit 1;
    if v_active_session.id is not null and not private.is_table_session_participant(v_active_session.id) then
      select coalesce(sum(seat_count),0)::integer into v_occupied from public.table_session_participants
        where table_session_id=v_active_session.id;
      select seats::integer into v_capacity from public.tables where id=v_qr.table_id;
      if v_occupied+1>v_capacity then
        insert into public.capacity_requests(restaurant_id,table_session_id,table_id,requested_user_id,
          source,seat_count,occupied_seats_at_request,capacity_at_request,expires_at)
        values(v_qr.restaurant_id,v_active_session.id,v_qr.table_id,auth.uid(),'table_qr',1,
          v_occupied,v_capacity,now()+make_interval(mins=>(select capacity_request_ttl_min from public.restaurant_model_configs where restaurant_id=v_qr.restaurant_id)))
        on conflict(table_session_id,requested_user_id) where status='pending'
        do update set expires_at=excluded.expires_at returning id into v_request_id;
        return jsonb_build_object('status','awaiting_capacity','capacityRequestId',v_request_id,
          'restaurantId',v_qr.restaurant_id,'tableId',v_qr.table_id,'serviceModel',p_service_model);
      end if;
    end if;
  end if;
  v_visit := public.customer_open_table_session(p_qr_data);
  v_session_id := (v_visit->>'tableSessionId')::uuid;
  update public.table_sessions set service_model=p_service_model,
    reservation_id=v_reservation_id,waitlist_entry_id=v_waitlist_id,updated_at=now()
    where id=v_session_id;
  if v_waitlist_id is not null then
    update public.waitlist_entries set status='seated',seated_at=now(),updated_at=now() where id=v_waitlist_id;
    update public.orders set table_session_id=v_session_id,table_id=v_qr.table_id,
      waitlist_entry_id=null,origin_type='table_session',updated_at=now()
      where waitlist_entry_id=v_waitlist_id and customer_id=auth.uid();
  end if;
  return v_visit || jsonb_build_object('serviceModel',p_service_model,
    'reservationId',v_reservation_id,'waitlistEntryId',v_waitlist_id);
end $$;
revoke all on function private.table_check_in(text,public.noowe_service_model,boolean) from public, anon, authenticated;

create or replace function public.customer_check_in(
  p_qr_data text, p_service_model public.noowe_service_model
) returns jsonb language sql security definer
set search_path=public,private,pg_temp as $$
  select private.table_check_in(p_qr_data, p_service_model, true)
$$;
revoke all on function public.customer_check_in(text,public.noowe_service_model) from public;
grant execute on function public.customer_check_in(text,public.noowe_service_model) to authenticated;

create or replace function public.customer_dev_check_in(
  p_qr_data text, p_service_model public.noowe_service_model
) returns jsonb language plpgsql security definer
set search_path=public,private,pg_temp as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if not exists (select 1 from private.dev_flags where key='simulate_table_scan' and enabled) then
    raise exception 'O atalho de mesa de teste está desligado no banco.' using errcode='42501';
  end if;
  return private.table_check_in(p_qr_data, p_service_model, false);
end $$;
revoke all on function public.customer_dev_check_in(text,public.noowe_service_model) from public, anon;
grant execute on function public.customer_dev_check_in(text,public.noowe_service_model) to authenticated;
