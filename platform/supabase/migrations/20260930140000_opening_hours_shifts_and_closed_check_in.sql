-- Horário de funcionamento com turnos + check-in bloqueado com o restaurante fechado.
--
-- Problema: o app do restaurante gravava restaurants.business_hours (lista com
-- dias em português), mas o servidor e o app cliente leem restaurants.opening_hours
-- (objeto com dias em inglês). Nada ligava as duas colunas, então o que o dono
-- editava nunca chegava ao cliente e o restaurante ficava "Fechado" para sempre.
--
-- Formato canônico único, em opening_hours, com vários turnos por dia:
--   { "monday": { "closed": false, "shifts": [ {"open":"11:00","close":"14:00"},
--                                                {"open":"19:00","close":"23:00"} ] },
--     "sunday": { "closed": true,  "shifts": [] } }
-- O formato antigo ({open, close} / {closed:true}) continua aceito na leitura e é
-- convertido na escrita. Um trigger em restaurants mantém tudo consistente, seja
-- qual for o caminho de escrita (RPC do app, app antigo, seed).
--
-- Regra de negócio isolada em funções nomeadas (ADR provisório):
--   private.opening_hours_max_shifts_per_day()  → limite de turnos por dia.

-- ── 1. Conversão e validação ────────────────────────────────────────────────

create or replace function private.opening_hours_max_shifts_per_day()
returns integer language sql immutable as $$ select 4 $$;

-- Aceita "Segunda"/"terca"/"monday" e devolve a chave em inglês (ou null).
create or replace function private.opening_hours_day_key(p_day text)
returns text language sql immutable as $$
  select case translate(lower(btrim(coalesce(p_day, ''))), 'áâãàéêíóôõúç', 'aaaaeeiooouc')
    when 'segunda' then 'monday'    when 'monday'    then 'monday'
    when 'terca'   then 'tuesday'   when 'tuesday'   then 'tuesday'
    when 'quarta'  then 'wednesday' when 'wednesday' then 'wednesday'
    when 'quinta'  then 'thursday'  when 'thursday'  then 'thursday'
    when 'sexta'   then 'friday'    when 'friday'    then 'friday'
    when 'sabado'  then 'saturday'  when 'saturday'  then 'saturday'
    when 'domingo' then 'sunday'    when 'sunday'    then 'sunday'
    else null
  end
$$;

-- Turnos de um dia em qualquer formato (novo, {open,close} antigo, {closed:true}).
create or replace function private.opening_hours_day_shifts(p_day jsonb)
returns jsonb language plpgsql immutable as $$
begin
  if p_day is null or jsonb_typeof(p_day) <> 'object' then return '[]'::jsonb; end if;
  if coalesce(p_day->>'closed', 'false') = 'true' then return '[]'::jsonb; end if;
  if jsonb_typeof(p_day->'shifts') = 'array' then return p_day->'shifts'; end if;
  if nullif(p_day->>'open', '') is not null and nullif(p_day->>'close', '') is not null then
    return jsonb_build_array(jsonb_build_object('open', p_day->>'open', 'close', p_day->>'close'));
  end if;
  return '[]'::jsonb;
end $$;

-- Converte business_hours (lista) e o formato antigo de opening_hours para o canônico.
create or replace function private.normalize_opening_hours(p_hours jsonb)
returns jsonb language plpgsql immutable as $$
declare
  v_out jsonb := '{}'::jsonb;
  v_item jsonb;
  v_key text;
  v_shifts jsonb;
  v_entry record;
begin
  if p_hours is null or jsonb_typeof(p_hours) = 'null' then return null; end if;

  if jsonb_typeof(p_hours) = 'array' then
    for v_item in select value from jsonb_array_elements(p_hours) loop
      v_key := private.opening_hours_day_key(v_item->>'day');
      continue when v_key is null;
      if v_item->'open' = 'true'::jsonb then
        v_shifts := jsonb_build_array(jsonb_build_object(
          'open', coalesce(v_item->>'start', ''), 'close', coalesce(v_item->>'end', '')));
        v_out := v_out || jsonb_build_object(v_key, jsonb_build_object('closed', false, 'shifts', v_shifts));
      else
        v_out := v_out || jsonb_build_object(v_key, jsonb_build_object('closed', true, 'shifts', '[]'::jsonb));
      end if;
    end loop;
    return v_out;
  end if;

  if jsonb_typeof(p_hours) <> 'object' then
    raise exception 'Horário de funcionamento inválido' using errcode = '22023';
  end if;

  for v_entry in select key, value from jsonb_each(p_hours) loop
    v_key := private.opening_hours_day_key(v_entry.key);
    continue when v_key is null;
    v_shifts := private.opening_hours_day_shifts(v_entry.value);
    v_out := v_out || jsonb_build_object(v_key, jsonb_build_object(
      'closed', jsonb_array_length(v_shifts) = 0, 'shifts', v_shifts));
  end loop;
  return v_out;
end $$;

-- Formato HH:MM de 24 horas, turnos sem sobreposição. Só o último turno do dia
-- pode passar da meia-noite (close <= open).
create or replace function private.validate_opening_hours(p_hours jsonb)
returns void language plpgsql immutable as $$
declare
  v_entry record;
  v_shift jsonb;
  v_prev_end integer;
  v_start integer;
  v_end integer;
  v_time_pattern constant text := '^([01][0-9]|2[0-3]):[0-5][0-9]$';
begin
  if p_hours is null or p_hours = '{}'::jsonb then return; end if;

  for v_entry in select key, value from jsonb_each(p_hours) loop
    if jsonb_typeof(v_entry.value->'shifts') <> 'array' then
      raise exception 'Horário de % inválido', v_entry.key using errcode = '22023';
    end if;
    if jsonb_array_length(v_entry.value->'shifts') > private.opening_hours_max_shifts_per_day() then
      raise exception 'Máximo de % turnos por dia', private.opening_hours_max_shifts_per_day() using errcode = '22023';
    end if;
    for v_shift in select value from jsonb_array_elements(v_entry.value->'shifts') loop
      if coalesce(v_shift->>'open', '') !~ v_time_pattern or coalesce(v_shift->>'close', '') !~ v_time_pattern then
        raise exception 'Horário inválido: use o formato de 24 horas HH:MM (00:00 a 23:59)' using errcode = '22023';
      end if;
      if v_shift->>'open' = v_shift->>'close' then
        raise exception 'O turno não pode abrir e fechar no mesmo horário' using errcode = '22023';
      end if;
    end loop;

    v_prev_end := null;
    for v_shift in select value from jsonb_array_elements(v_entry.value->'shifts') order by value->>'open' loop
      v_start := split_part(v_shift->>'open', ':', 1)::integer * 60 + split_part(v_shift->>'open', ':', 2)::integer;
      v_end := split_part(v_shift->>'close', ':', 1)::integer * 60 + split_part(v_shift->>'close', ':', 2)::integer;
      if v_end <= v_start then v_end := v_end + 1440; end if;
      if v_prev_end is not null and v_start < v_prev_end then
        raise exception 'Os turnos do dia se sobrepõem' using errcode = '22023';
      end if;
      v_prev_end := v_end;
    end loop;
  end loop;
end $$;

-- ── 2. Trigger: business_hours e opening_hours nunca divergem ───────────────

create or replace function private.restaurants_sync_hours()
returns trigger language plpgsql
set search_path = public, private, pg_temp as $$
declare
  v_changed boolean := false;
begin
  if tg_op = 'INSERT' then
    if new.opening_hours is not null and new.opening_hours <> '{}'::jsonb then
      new.opening_hours := private.normalize_opening_hours(new.opening_hours);
      v_changed := true;
    elsif jsonb_typeof(new.business_hours) = 'array' and jsonb_array_length(new.business_hours) > 0 then
      new.opening_hours := private.normalize_opening_hours(new.business_hours);
      v_changed := true;
    end if;
  elsif new.opening_hours is distinct from old.opening_hours then
    if new.opening_hours is not null and new.opening_hours <> '{}'::jsonb then
      new.opening_hours := private.normalize_opening_hours(new.opening_hours);
      v_changed := true;
    end if;
  elsif new.business_hours is distinct from old.business_hours
    and jsonb_typeof(new.business_hours) = 'array' and jsonb_array_length(new.business_hours) > 0 then
    -- App antigo (ou qualquer escritor legado) que só conhece business_hours.
    new.opening_hours := private.normalize_opening_hours(new.business_hours);
    v_changed := true;
  end if;

  if v_changed then
    perform private.validate_opening_hours(new.opening_hours);
    -- Horário informado pelo dono deixa de ser placeholder de migração.
    if jsonb_typeof(new.settings #> '{profile_placeholder,fields}') = 'array' then
      new.settings := jsonb_set(new.settings, '{profile_placeholder,fields}',
        coalesce((select jsonb_agg(f) from jsonb_array_elements(new.settings #> '{profile_placeholder,fields}') f
                  where f <> to_jsonb('opening_hours'::text)), '[]'::jsonb));
    end if;
  end if;
  return new;
end $$;

drop trigger if exists restaurants_sync_hours on public.restaurants;
create trigger restaurants_sync_hours
  before insert or update of opening_hours, business_hours on public.restaurants
  for each row execute function private.restaurants_sync_hours();

-- ── 3. Backfill: horário editado pelo dono (business_hours) vence o placeholder ─

do $$
declare r record;
begin
  for r in
    select id, business_hours from public.restaurants
    where jsonb_typeof(business_hours) = 'array' and jsonb_array_length(business_hours) > 0
  loop
    begin
      update public.restaurants
        set opening_hours = private.normalize_opening_hours(r.business_hours)
        where id = r.id;
    exception when others then
      -- Horário antigo inválido (ex.: "6700"): mantém o que já existia.
      raise notice 'opening_hours não migrado para %: %', r.id, sqlerrm;
    end;
  end loop;
end $$;

-- ── 4. Status ao vivo com turnos ────────────────────────────────────────────

-- Avalia os turnos num instante dado (horário local do restaurante). Função pura:
-- os testes passam o relógio, sem depender de now().
create or replace function private.opening_hours_status(p_hours jsonb, p_local_now timestamp)
returns jsonb language plpgsql immutable as $$
declare
  v_weekdays constant text[] := array['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  v_now_time time := p_local_now::time;
  v_shift jsonb;
  v_open time;
  v_close time;
  v_is_open boolean := false;
  v_closes_at text;
  v_opens_at text;
begin
  -- Turnos de hoje, em ordem de abertura.
  for v_shift in
    select value from jsonb_array_elements(
      private.opening_hours_day_shifts(p_hours -> v_weekdays[extract(dow from p_local_now)::int + 1]))
    order by value->>'open'
  loop
    v_open := (v_shift->>'open')::time;
    v_close := (v_shift->>'close')::time;
    if v_close > v_open then
      if v_now_time >= v_open and v_now_time < v_close then
        v_is_open := true; v_closes_at := to_char(v_close, 'HH24:MI');
      end if;
    elsif v_now_time >= v_open then
      -- Fecha depois da meia-noite: o turno de hoje vai até o horário de amanhã.
      v_is_open := true; v_closes_at := to_char(v_close, 'HH24:MI');
    end if;
    if v_opens_at is null and v_open > v_now_time then
      v_opens_at := to_char(v_open, 'HH24:MI');
    end if;
  end loop;

  -- Ainda dentro do turno de ontem que passou da meia-noite (ex.: 19:00–01:00).
  if not v_is_open then
    for v_shift in
      select value from jsonb_array_elements(
        private.opening_hours_day_shifts(p_hours -> v_weekdays[((extract(dow from p_local_now)::int + 6) % 7) + 1]))
    loop
      v_open := (v_shift->>'open')::time;
      v_close := (v_shift->>'close')::time;
      if v_close <= v_open and v_now_time < v_close then
        v_is_open := true; v_closes_at := to_char(v_close, 'HH24:MI');
      end if;
    end loop;
  end if;

  return jsonb_build_object('isOpen', v_is_open,
    'opensAt', case when v_is_open then null else v_opens_at end,
    'closesAt', case when v_is_open then v_closes_at else null end);
end $$;

create or replace function private.restaurant_live_status(p_restaurant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_time_zone constant text := 'America/Sao_Paulo';
  v_hours_status jsonb;
  v_is_open boolean;
  v_closes_at text;
  v_opens_at text;
  v_hours jsonb;
  v_groups_waiting integer;
  v_manual_avg numeric;
  v_estimated_wait integer;
  v_tables_total integer;
  v_tables_occupied integer;
  v_occupancy_ratio numeric;
  v_occupancy_level text;
begin
  select coalesce(r.opening_hours, '{}'::jsonb) into v_hours
  from public.restaurants r where r.id = p_restaurant_id and r.is_active;
  if not found then return null; end if;

  v_hours_status := private.opening_hours_status(v_hours, now() at time zone v_time_zone);
  v_is_open := (v_hours_status->>'isOpen')::boolean;
  v_opens_at := v_hours_status->>'opensAt';
  v_closes_at := v_hours_status->>'closesAt';

  select count(*) into v_groups_waiting
    from public.waitlist_entries
    where restaurant_id = p_restaurant_id and status = 'waiting';

  select avg(estimated_wait_minutes) into v_manual_avg
    from public.waitlist_entries
    where restaurant_id = p_restaurant_id and status = 'waiting' and estimated_wait_minutes is not null;

  select count(*), count(*) filter (where status = 'occupied')
    into v_tables_total, v_tables_occupied
    from public.tables
    where restaurant_id = p_restaurant_id;

  v_occupancy_ratio := case when coalesce(v_tables_total, 0) = 0 then null
    else v_tables_occupied::numeric / v_tables_total end;

  -- With no manual estimate, wait grows with both the queue and how full the
  -- room already is — an empty room seats a walk-in immediately.
  v_estimated_wait := coalesce(
    ceil(v_manual_avg)::integer,
    case
      when v_groups_waiting = 0 and coalesce(v_occupancy_ratio, 0) < 0.75 then 0
      else least(90, greatest(5, v_groups_waiting * 8 + round(coalesce(v_occupancy_ratio, 0) * 20)::integer))
    end
  );

  v_occupancy_level := case
    when v_occupancy_ratio is null then 'indisponivel'
    when v_occupancy_ratio >= 0.75 then 'alta'
    when v_occupancy_ratio >= 0.4 then 'media'
    else 'baixa'
  end;

  return jsonb_build_object(
    'restaurantId', p_restaurant_id,
    'isOpen', v_is_open,
    'opensAt', v_opens_at,
    'closesAt', v_closes_at,
    'groupsWaiting', v_groups_waiting,
    'estimatedWaitMinutes', v_estimated_wait,
    'occupancyLevel', v_occupancy_level,
    'occupancyRatio', v_occupancy_ratio,
    'occupancyPercent', case when v_occupancy_ratio is null then null else round(v_occupancy_ratio * 100)::integer end,
    'tablesTotal', v_tables_total,
    'tablesOccupied', v_tables_occupied
  );
end $$;

-- ── 5. Check-in de mesa e QR de balcão só com o restaurante aberto ──────────
-- Convite para uma sessão que já está aberta não passa por aqui. O atalho de
-- mesa de teste (p_require_booking = false, só com a flag de dev ligada) não
-- é bloqueado, para o emulador continuar testável fora do horário.
-- Erro P0010 = restaurante fechado.

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
  if p_require_booking and not private.restaurant_is_open_now(v_qr.restaurant_id) then
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

-- QR de balcão (Quick Service) também não abre pedido com o restaurante fechado.
create or replace function public.customer_resolve_service_qr(p_qr_data text)
returns jsonb language plpgsql stable security definer
set search_path = public, private, pg_temp as $$
declare v_table public.table_qr_codes; v_counter public.counter_qr_codes; v_models public.noowe_service_model[];
  v_selected public.noowe_service_model;
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
  return jsonb_build_object('kind','table','restaurantId',v_table.restaurant_id,
    'tableId',v_table.table_id,'tableQrId',v_table.id,
    'serviceModel',v_selected,
    'allowedServiceModels', to_jsonb(array_remove(v_models, 'quick_service'::public.noowe_service_model)));
end $$;
grant execute on function public.customer_resolve_service_qr(text) to anon, authenticated;
