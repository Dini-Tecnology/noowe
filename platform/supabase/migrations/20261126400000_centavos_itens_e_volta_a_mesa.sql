-- IV-01: order_items sem centavos (unit/total_price_cents nulos) vindos de place_order e da simulação.
-- O valor em reais da linha (NOT NULL) é a fonte dessas linhas; os centavos passam a ser sempre preenchidos.
create or replace function private.order_items_fill_cents()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  new.unit_price_cents := coalesce(new.unit_price_cents, round(new.unit_price * 100)::bigint);
  new.total_price_cents := coalesce(new.total_price_cents, round(new.total_price * 100)::bigint);
  return new;
end $$;
revoke all on function private.order_items_fill_cents() from public, anon, authenticated;

drop trigger if exists order_items_fill_cents on public.order_items;
create trigger order_items_fill_cents before insert or update on public.order_items
  for each row execute function private.order_items_fill_cents();

update public.order_items set unit_price_cents = unit_price_cents
  where unit_price_cents is null or total_price_cents is null;
alter table public.order_items alter column unit_price_cents set not null, alter column total_price_cents set not null;

-- CT-08 (ADR-021): quem saiu da mesa (walkout_at) e volta por convite, link ou lotação aprovada é readmitido
-- na mesma linha; a parte que ficou com o titular continua com ele e left_unpaid_at fica como histórico.
create or replace function private.join_table_session_participant(p_table_session_id uuid, p_user_id uuid, p_seat_count integer default 1)
 returns void language plpgsql security definer set search_path to 'public', 'private', 'pg_temp'
as $function$
declare
  v_name text;
  v_table_id uuid;
begin
  select full_name into v_name from public.profiles where id = p_user_id;
  insert into public.table_session_participants(table_session_id, user_id, display_name, is_host, seat_count)
  values (p_table_session_id, p_user_id, coalesce(nullif(btrim(v_name), ''), 'Cliente'), false, p_seat_count)
  on conflict (table_session_id, user_id) where user_id is not null
  do update set walkout_at = null, seat_count = excluded.seat_count
  where public.table_session_participants.walkout_at is not null;

  update public.table_sessions
  set last_activity = now(), updated_at = now()
  where id = p_table_session_id
  returning table_id into v_table_id;

  update public.tables
  set status = 'occupied', occupied_since = coalesce(occupied_since, now()), updated_at = now()
  where id = v_table_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.customer_accept_table_user_invite(p_invite_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_invite public.table_session_user_invites;
  v_session public.table_sessions;
  v_config public.restaurant_model_configs;
  v_check jsonb;
  v_request public.capacity_requests;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select * into v_invite from public.table_session_user_invites
  where id = p_invite_id and invitee_id = auth.uid()
  for update;
  if v_invite.id is null then
    raise exception 'Convite não encontrado' using errcode = 'P0002';
  end if;

  if v_invite.status = 'accepted' and not exists (
    select 1 from public.table_session_participants
    where table_session_id = v_invite.table_session_id and user_id = auth.uid() and walkout_at is null) then
    -- CT-08: o convite já foi usado e a pessoa saiu depois; nunca responder "aceito" sem estar na mesa.
    raise exception 'Você saiu desta mesa. Peça um novo convite ou leia o QR da mesa para voltar.' using errcode = 'P0001';
  elsif v_invite.status = 'accepted' then
    return jsonb_build_object('status', 'accepted', 'idempotentReplay', true,
      'visit', private.table_session_visit_payload(v_invite.table_session_id),
      'invite', private.table_user_invite_json(p_invite_id));
  elsif v_invite.status = 'awaiting_capacity' then
    return jsonb_build_object('status', 'awaiting_capacity', 'idempotentReplay', true,
      'capacityRequestId', v_invite.capacity_request_id,
      'invite', private.table_user_invite_json(p_invite_id));
  elsif v_invite.status <> 'pending' then
    return jsonb_build_object('status', v_invite.status,
      'invite', private.table_user_invite_json(p_invite_id));
  end if;

  if v_invite.expires_at <= now() then
    update public.table_session_user_invites
    set status = 'expired', closed_reason = 'ttl', updated_at = now() where id = p_invite_id;
    return jsonb_build_object('status', 'expired', 'invite', private.table_user_invite_json(p_invite_id));
  end if;

  select * into v_session from public.table_sessions where id = v_invite.table_session_id for update;
  if v_session.status is distinct from 'active' then
    update public.table_session_user_invites
    set status = 'expired', closed_reason = 'session_closed', updated_at = now() where id = p_invite_id;
    return jsonb_build_object('status', 'expired', 'invite', private.table_user_invite_json(p_invite_id));
  end if;

  select * into v_config from public.restaurant_model_configs where restaurant_id = v_session.restaurant_id;
  if not coalesce(v_config.user_invite_enabled, false) then
    update public.table_session_user_invites
    set status = 'cancelled', closed_reason = 'feature_disabled', updated_at = now() where id = p_invite_id;
    return jsonb_build_object('status', 'cancelled', 'invite', private.table_user_invite_json(p_invite_id));
  end if;

  if not exists (select 1 from public.table_session_participants
                 where table_session_id = v_session.id and user_id = v_invite.inviter_id) then
    update public.table_session_user_invites
    set status = 'cancelled', closed_reason = 'inviter_left', updated_at = now() where id = p_invite_id;
    return jsonb_build_object('status', 'cancelled', 'invite', private.table_user_invite_json(p_invite_id));
  end if;

  -- Já está na mesa (entrou pelo QR entre o envio e o aceite).
  if exists (select 1 from public.table_session_participants
             where table_session_id = v_session.id and user_id = auth.uid() and walkout_at is null) then
    update public.table_session_user_invites
    set status = 'accepted', responded_at = now(), updated_at = now() where id = p_invite_id;
    return jsonb_build_object('status', 'accepted',
      'visit', private.table_session_visit_payload(v_session.id),
      'invite', private.table_user_invite_json(p_invite_id));
  end if;

  -- Falha cedo se o convidado deve em outra mesa (P0004); ainda não sai dela,
  -- porque uma espera de lotação recusada não pode tirá-lo da mesa atual.
  perform private.assert_can_switch_to_table(auth.uid(), v_session.table_id);

  -- Serializa aceites concorrentes na mesma mesa quase cheia.
  perform 1 from public.tables where id = v_session.table_id for update;

  v_check := private.table_session_capacity_check(v_session.id, 1);
  if not (v_check->>'fits')::boolean then
    insert into public.capacity_requests(
      restaurant_id, table_session_id, table_id, requested_user_id, source, source_invite_id,
      seat_count, occupied_seats_at_request, capacity_at_request, expires_at
    ) values (
      v_session.restaurant_id, v_session.id, v_session.table_id, auth.uid(), 'user_invite', p_invite_id,
      1, (v_check->>'occupied')::integer, (v_check->>'capacity')::integer,
      now() + make_interval(mins => v_config.capacity_request_ttl_min)
    ) returning * into v_request;

    update public.table_session_user_invites
    set status = 'awaiting_capacity', capacity_request_id = v_request.id,
        responded_at = now(), updated_at = now()
    where id = p_invite_id;

    perform private.log_audit(
      v_session.restaurant_id, 'capacity_request.created', 'capacity_request', v_request.id,
      'lotacao_excedida', null, to_jsonb(v_request), auth.uid());

    return jsonb_build_object('status', 'awaiting_capacity', 'capacityRequestId', v_request.id,
      'invite', private.table_user_invite_json(p_invite_id));
  end if;

  -- Marca o convite antes de inserir o participante, para o trigger de entrada
  -- não reclassificá-lo como "joined_otherwise".
  update public.table_session_user_invites
  set status = 'accepted', responded_at = now(), updated_at = now() where id = p_invite_id;

  perform private.leave_other_tables(auth.uid(), v_session.table_id);
  perform private.join_table_session_participant(v_session.id, auth.uid(), 1);

  perform private.log_audit(
    v_session.restaurant_id, 'table_session.participant_joined', 'table_session', v_session.id,
    'convite_username', null,
    jsonb_build_object('user_id', auth.uid(), 'invite_id', p_invite_id, 'inviter_id', v_invite.inviter_id),
    auth.uid());

  perform private.notify_inviter_of_response(p_invite_id, 'Convite aceito', 'entrou na mesa');

  return jsonb_build_object('status', 'accepted',
    'visit', private.table_session_visit_payload(v_session.id),
    'invite', private.table_user_invite_json(p_invite_id));
end;
$function$;
