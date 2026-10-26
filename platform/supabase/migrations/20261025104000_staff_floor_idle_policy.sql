-- G4 / ADR-021 — App Restaurante: origem da comanda no mapa, alerta de comanda parada, política do salão.
-- A comanda nunca encerra por tempo: ficar parada só marca `idle_since` e avisa a equipe uma vez.

alter table public.table_sessions add column if not exists idle_alerted_at timestamptz;

-- De onde veio a comanda: reserva, fila, QR da mesa ou aberta pela equipe.
create or replace function private.session_origin(p_session uuid)
returns text
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select case
    when s.reservation_id is not null then 'reservation'
    when s.waitlist_entry_id is not null then 'queue'
    when s.qr_code_id is not null then 'qr'
    else 'staff' end
  from public.table_sessions s where s.id = p_session
$$;
revoke all on function private.session_origin(uuid) from public, anon, authenticated;

create or replace function private.session_origin_name(p_session uuid)
returns text
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select coalesce(
    (select coalesce(nullif(btrim(p.full_name), ''), nullif(btrim(p.email), ''), 'Cliente')
       from public.reservations r left join public.profiles p on p.id = r.customer_id
       where r.id = s.reservation_id),
    (select w.customer_name from public.waitlist_entries w where w.id = s.waitlist_entry_id))
  from public.table_sessions s where s.id = p_session
$$;
revoke all on function private.session_origin_name(uuid) from public, anon, authenticated;

-- Desde quando a comanda está parada, ou null se ainda não passou do tempo do alerta (regra isolada).
create or replace function private.session_idle_since(p_restaurant uuid, p_last_activity timestamptz)
returns timestamptz
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select case when p_last_activity < now() - make_interval(mins => coalesce(
    (select c.session_idle_alert_min from public.restaurant_model_configs c where c.restaurant_id = p_restaurant), 120))
    then p_last_activity end
$$;
revoke all on function private.session_idle_since(uuid, timestamptz) from public, anon, authenticated;

create or replace function private.session_idle_sweep(p_restaurant uuid)
returns integer
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare v_count integer := 0; v_s record; v_number text;
begin
  for v_s in
    select s.id, s.restaurant_id, s.table_id, s.last_activity from public.table_sessions s
    where s.restaurant_id = p_restaurant and s.status = 'active'
      and private.session_idle_since(s.restaurant_id, s.last_activity) is not null
      and (s.idle_alerted_at is null or s.idle_alerted_at < s.last_activity)
    for update skip locked
  loop
    select table_number into v_number from public.tables where id = v_s.table_id;
    perform private.notify_restaurant_staff(v_s.restaurant_id,
      array['owner','manager','maitre']::public.user_roles_role_enum[],
      'Comanda parada — mesa ' || coalesce(v_number, ''),
      'Sem atividade desde ' || to_char(v_s.last_activity at time zone 'America/Sao_Paulo', 'HH24:MI') || '. Verifique a mesa.',
      'staff_session_idle', v_s.id, 'table',
      jsonb_build_object('kind', 'staff_session_idle', 'table_session_id', v_s.id));
    update public.table_sessions set idle_alerted_at = now() where id = v_s.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke all on function private.session_idle_sweep(uuid) from public, anon, authenticated;

create or replace function public.restaurant_get_tables(
  p_restaurant_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  result jsonb;
  v_can_rearrange boolean;
begin
  perform private.require_restaurant_role(p_restaurant_id);
  -- ADR-021: comanda parada gera alerta único à equipe; nunca encerra a sessão.
  perform private.session_idle_sweep(p_restaurant_id);
  v_can_rearrange := private.has_restaurant_role(p_restaurant_id, private.table_layout_roles(p_restaurant_id)); -- ADR-018

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', t.id,
        'restaurant_id', t.restaurant_id,
        'table_number', t.table_number,
        'seats', t.seats,
        'status', t.status,
        'section', t.section,
        'assigned_waiter_id', t.assigned_waiter_id,
        'position_x', t.position_x,
        'position_y', t.position_y,
        'shape', t.shape,
        'width', t.width,
        'height', t.height,
        'qr_code', t.qr_code,
        'occupied_since', t.occupied_since,
        'notes', t.notes,
        'merged_into_id', t.merged_into_id,
        'merged_into_number', (select m.table_number from public.tables m where m.id = t.merged_into_id),
        'effective_seats', private.table_effective_seats(t.id),
        'merged_children', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'table_number', c.table_number, 'seats', c.seats) order by c.table_number), '[]'::jsonb) from public.tables c where c.merged_into_id = t.id),
        'can_rearrange', v_can_rearrange,
        'active_session', (
          select jsonb_build_object(
            'id', ts.id,
            'guest_name', ts.guest_name,
            'guest_count', ts.guest_count,
            'started_at', ts.started_at,
            'last_activity', ts.last_activity,
            'origin', private.session_origin(ts.id),
            'origin_name', private.session_origin_name(ts.id),
            'idle_since', private.session_idle_since(ts.restaurant_id, ts.last_activity),
            'total_spent', ts.total_spent,
            'headcount', private.table_session_headcount(ts.id)
          )
          from public.table_sessions ts
          where ts.table_id = t.id
            and ts.status = 'active'
          order by ts.started_at desc
          limit 1
        ),
        'active_reservation', (
          select jsonb_build_object(
            'id', r.id,
            'customer_name', coalesce(nullif(btrim(p.full_name), ''), nullif(btrim(p.email), ''), 'Cliente'),
            'party_size', r.party_size
          )
          from public.reservations r
          left join public.profiles p on p.id = r.customer_id
          where r.table_id = t.id
            and r.status::text = 'confirmed'
            and t.status = 'reserved'
            and r.reservation_time >= now() - interval '2 hours'
          order by r.reservation_time asc
          limit 1
        ),
        'created_at', t.created_at,
        'updated_at', t.updated_at
      )
      order by t.section nulls last, t.table_number
    ),
    '[]'::jsonb
  )
  into result
  from public.tables t
  where t.restaurant_id = p_restaurant_id;

  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Política do salão: tolerâncias e alerta (a janela de 5 min do check-in é fixa na UI)
-- ---------------------------------------------------------------------------
create or replace function public.restaurant_get_room_policy(p_restaurant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $$
declare c public.restaurant_model_configs;
begin
  perform private.require_restaurant_role(p_restaurant_id,
    array['owner','manager','maitre']::public.user_roles_role_enum[]);
  select * into c from public.restaurant_model_configs where restaurant_id = p_restaurant_id;
  return jsonb_build_object(
    'reservationNoShowMin', coalesce(c.reservation_no_show_min, 15),
    'queueCallToleranceMin', coalesce(c.queue_call_tolerance_min, 8),
    'sessionIdleAlertMin', coalesce(c.session_idle_alert_min, 120),
    'reservationCheckInLeadMin', coalesce(c.reservation_check_in_lead_min, 5));
end;
$$;
revoke all on function public.restaurant_get_room_policy(uuid) from public, anon;
grant execute on function public.restaurant_get_room_policy(uuid) to authenticated;

create or replace function public.restaurant_update_room_policy(
  p_restaurant_id uuid,
  p_reservation_no_show_min integer default null,
  p_queue_call_tolerance_min integer default null,
  p_session_idle_alert_min integer default null
) returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare v_before jsonb;
begin
  perform private.require_restaurant_role(p_restaurant_id,
    array['owner','manager']::public.user_roles_role_enum[]);
  if p_reservation_no_show_min is not null and p_reservation_no_show_min not between 5 and 120 then
    raise exception 'Tolerância de atraso da reserva deve ficar entre 5 e 120 min' using errcode = '22023'; end if;
  if p_queue_call_tolerance_min is not null and p_queue_call_tolerance_min not between 1 and 60 then
    raise exception 'Tolerância de apresentação da fila deve ficar entre 1 e 60 min' using errcode = '22023'; end if;
  if p_session_idle_alert_min is not null and p_session_idle_alert_min not between 15 and 1440 then
    raise exception 'Alerta de comanda parada deve ficar entre 15 e 1440 min' using errcode = '22023'; end if;
  v_before := public.restaurant_get_room_policy(p_restaurant_id);
  -- A configuração do modelo nasce com o restaurante (service_models é obrigatório): sem ela, não há o que editar.
  if not exists (select 1 from public.restaurant_model_configs where restaurant_id = p_restaurant_id) then
    raise exception 'Configuração do restaurante não encontrada' using errcode = 'P0002';
  end if;
  update public.restaurant_model_configs set
    reservation_no_show_min = coalesce(p_reservation_no_show_min, reservation_no_show_min),
    queue_call_tolerance_min = coalesce(p_queue_call_tolerance_min, queue_call_tolerance_min),
    session_idle_alert_min = coalesce(p_session_idle_alert_min, session_idle_alert_min)
  where restaurant_id = p_restaurant_id;
  perform private.log_audit(p_restaurant_id, 'room_policy.updated', 'restaurant', p_restaurant_id,
    'politica_do_salao', v_before, public.restaurant_get_room_policy(p_restaurant_id));
  return public.restaurant_get_room_policy(p_restaurant_id);
end;
$$;
revoke all on function public.restaurant_update_room_policy(uuid, integer, integer, integer) from public, anon;
grant execute on function public.restaurant_update_room_policy(uuid, integer, integer, integer) to authenticated;

-- Comanda por pessoa para a equipe: agora com quanto cada um e a mesa já pagaram (G3).
create or replace function public.restaurant_get_table_bill(p_table_id uuid)
returns jsonb language plpgsql stable security definer
set search_path = public, private, pg_temp as $$
declare
  v_restaurant_id uuid;
  v_session public.table_sessions;
  v_diners jsonb;
  v_items jsonb;
  v_subtotal numeric(10,2);
begin
  select restaurant_id into v_restaurant_id from public.tables where id = p_table_id;
  if v_restaurant_id is null then raise exception 'Mesa não encontrada' using errcode = 'P0001'; end if;
  perform private.require_restaurant_role(
    v_restaurant_id,
    array['owner','manager','maitre','waiter']::public.user_roles_role_enum[]
  );

  select * into v_session from public.table_sessions
  where table_id = p_table_id and status = 'active'
  order by started_at desc limit 1;

  if v_session.id is null then
    return jsonb_build_object('tableId', p_table_id, 'tableSessionId', null,
      'diners', '[]'::jsonb, 'items', '[]'::jsonb, 'subtotal', 0);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'dinerId', p.id, 'displayName', coalesce(p.display_name, 'Convidado'),
    'isHost', p.is_host, 'isKid', p.is_kid, 'isCompanion', p.user_id is null,
    'paidCents', coalesce((select sum(s.amount_cents) from public.bill_shares s
      where s.table_session_id = v_session.id and s.participant_id = p.id and s.status = 'paid'), 0)
  ) order by p.is_host desc, p.joined_at), '[]'::jsonb) into v_diners
  from public.table_session_participants p where p.table_session_id = v_session.id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'orderItemId', oi.id, 'orderId', o.id, 'name', coalesce(mi.name, 'Item'),
    'quantity', oi.quantity, 'totalPrice', oi.total_price, 'status', oi.status,
    'specialInstructions', oi.special_instructions,
    'dinerId', coalesce(oi.diner_id, placer.id),
    'dinerName', coalesce(diner.display_name, placer.display_name, 'Convidado'),
    'dinerIsKid', coalesce(diner.is_kid, false)
  ) order by o.created_at), '[]'::jsonb), coalesce(sum(oi.total_price), 0)
  into v_items, v_subtotal
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  left join public.menu_items mi on mi.id = oi.menu_item_id
  left join public.table_session_participants placer
    on placer.table_session_id = o.table_session_id and placer.user_id = o.customer_id
  left join public.table_session_participants diner on diner.id = oi.diner_id
  where o.table_session_id = v_session.id and o.status <> 'cancelled';

  return jsonb_build_object(
    'tableId', p_table_id,
    'tableSessionId', v_session.id,
    'diners', v_diners,
    'items', v_items,
    'subtotal', v_subtotal,
    -- ADR-021: quanto já foi pago na mesa, por parcelas quitadas.
    'paidCents', coalesce((select sum(s.amount_cents) from public.bill_shares s
      where s.table_session_id = v_session.id and s.status = 'paid'), 0)
  );
end $$;
