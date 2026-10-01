-- G2b / ADR-011 — convite para a mesa por @username, com aceite do convidado.
--
-- Convive com o link de convite (table_session_invites, §2.6): é um canal a mais,
-- só para quem tem conta, e o convidado precisa ACEITAR.  O aceite entra na sessão
-- ativa já existente (invariante 3) e, se a mesa estourar `tables.seats`, vira
-- solicitação pendente para a recepção (invariante 7 / ADR-007).
--
-- Não há pg_cron: toda expiração é preguiçosa, avaliada quando alguém lê ou age.

-- ---------------------------------------------------------------------------
-- 1. Parametrização (CLAUDE.md: nenhum literal de regra no código).
-- ---------------------------------------------------------------------------
alter table public.restaurant_model_configs
  add column if not exists user_invite_enabled boolean not null default true,
  add column if not exists user_invite_ttl_min integer not null default 30
    check (user_invite_ttl_min > 0),
  add column if not exists user_invite_max_pending_per_session integer not null default 10
    check (user_invite_max_pending_per_session > 0),
  add column if not exists user_invite_max_per_inviter_hour integer not null default 20
    check (user_invite_max_per_inviter_hour > 0),
  add column if not exists user_invite_redecline_cooldown_min integer not null default 60
    check (user_invite_redecline_cooldown_min >= 0),
  add column if not exists user_search_min_chars integer not null default 3
    check (user_search_min_chars > 0),
  add column if not exists user_search_limit integer not null default 10
    check (user_search_limit > 0),
  add column if not exists capacity_request_ttl_min integer not null default 15
    check (capacity_request_ttl_min > 0);

-- ADR-007: cada participante ocupa seat_count lugares (0 = criança de colo).
alter table public.table_session_participants
  add column if not exists seat_count integer not null default 1
    check (seat_count >= 0);

-- ---------------------------------------------------------------------------
-- 2. Capabilities: acrescenta `userInvite` e as policies do convite.
--    (Recriação integral; o restante do corpo é idêntico a 20260914130000.)
-- ---------------------------------------------------------------------------
create or replace function public.get_restaurant_model_capabilities(
  p_restaurant_id uuid,
  p_service_model public.noowe_service_model
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_config public.restaurant_model_configs;
  v_is_room_model boolean := p_service_model in (
    'fine_dining'::public.noowe_service_model,
    'casual_dining'::public.noowe_service_model
  );
begin
  select c.* into v_config
  from public.restaurant_model_configs c
  join public.restaurants r on r.id = c.restaurant_id
  where c.restaurant_id = p_restaurant_id
    and r.is_active;

  if not found then
    raise exception 'Active restaurant configuration not found' using errcode = 'P0002';
  end if;

  if not (p_service_model = any(v_config.service_models)) then
    raise exception 'Service model is not enabled for this restaurant' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'serviceModel', p_service_model,
    'capabilities', jsonb_build_object(
      'reservations', v_is_room_model and v_config.reservation_enabled,
      'virtualQueue', v_is_room_model and v_config.queue_enabled,
      'queueIsPrimaryEntry',
        p_service_model = 'casual_dining'::public.noowe_service_model
        and v_config.queue_enabled
        and v_config.queue_as_primary_entry,
      'tableSession', v_is_room_model,
      'guestLink', v_is_room_model and v_config.guest_link_enabled,
      'userInvite', v_is_room_model and v_config.user_invite_enabled,
      'splitBill', v_is_room_model and cardinality(v_config.split_modes) > 0,
      'splitModes', case when v_is_room_model then to_jsonb(v_config.split_modes) else '[]'::jsonb end,
      'serviceFee', v_is_room_model and v_config.service_fee_bps > 0,
      'staffCalls', v_is_room_model,
      'familyMode',
        p_service_model = 'casual_dining'::public.noowe_service_model
        and v_config.family_mode_enabled,
      'parties', p_service_model = 'casual_dining'::public.noowe_service_model,
      'comboBuilder', p_service_model = 'quick_service'::public.noowe_service_model,
      'prepaidRequired',
        p_service_model = 'quick_service'::public.noowe_service_model
        and v_config.prepaid_required,
      'pickupCode', p_service_model = 'quick_service'::public.noowe_service_model,
      'loyaltyMode', v_config.loyalty_mode,
      'consumptionUnit', case p_service_model
        when 'fine_dining'::public.noowe_service_model then 'table_with_guests'
        when 'casual_dining'::public.noowe_service_model then 'per_person'
        else 'individual_cart'
      end,
      'orderTracking', case p_service_model
        when 'fine_dining'::public.noowe_service_model then 'item_with_preparer'
        when 'casual_dining'::public.noowe_service_model then 'table_order'
        else 'pickup_steps'
      end
    ),
    'policies', jsonb_build_object(
      'serviceFeeBps', case when v_is_room_model then v_config.service_fee_bps else null end,
      'tipPresetsBps', case when v_is_room_model then to_jsonb(v_config.tip_presets_bps) else '[]'::jsonb end,
      'queueCallToleranceMin', case when v_is_room_model then v_config.queue_call_tolerance_min else null end,
      'reservationNoShowMin', case when v_is_room_model then v_config.reservation_no_show_min else null end,
      'guestLinkTtlMin', case when v_is_room_model and v_config.guest_link_enabled then v_config.guest_link_ttl_min else null end,
      'userInviteTtlMin', case when v_is_room_model and v_config.user_invite_enabled then v_config.user_invite_ttl_min else null end,
      'userSearchMinChars', case when v_is_room_model and v_config.user_invite_enabled then v_config.user_search_min_chars else null end,
      'capacityRequestTtlMin', case when v_is_room_model then v_config.capacity_request_ttl_min else null end,
      'requireGuestAccount', v_is_room_model and v_config.require_guest_account,
      'enforceTableCapacity', v_is_room_model and v_config.enforce_table_capacity,
      'capacityOverrideRoles', case when v_is_room_model then to_jsonb(v_config.capacity_override_roles) else '[]'::jsonb end,
      'splitFixedRemainder', case when v_is_room_model then to_jsonb(v_config.split_fixed_remainder) else null end,
      'tipAllocation', case when v_is_room_model then to_jsonb(v_config.tip_allocation) else null end,
      'comboDiscountBps', case when p_service_model = 'quick_service'::public.noowe_service_model then v_config.combo_discount_bps else null end,
      'pickupCapacityPerSlot', case when p_service_model = 'quick_service'::public.noowe_service_model then v_config.pickup_capacity_per_slot else null end,
      'pickupExpiryMin', case when p_service_model = 'quick_service'::public.noowe_service_model then v_config.pickup_expiry_min else null end,
      'stampsPerReward', case when p_service_model = 'quick_service'::public.noowe_service_model then v_config.stamps_per_reward else null end
    )
  );
end;
$$;

revoke all on function public.get_restaurant_model_capabilities(uuid, public.noowe_service_model) from public;
grant execute on function public.get_restaurant_model_capabilities(uuid, public.noowe_service_model)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Tabelas
-- ---------------------------------------------------------------------------
create table if not exists public.capacity_requests (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  table_session_id uuid not null references public.table_sessions(id) on delete cascade,
  table_id uuid not null references public.tables(id) on delete cascade,
  requested_user_id uuid not null references public.profiles(id) on delete cascade,
  -- Ampliável na fatia G2 (QR e link também passarão por aqui).
  source text not null check (source in ('user_invite')),
  source_invite_id uuid,
  seat_count integer not null default 1 check (seat_count >= 0),
  occupied_seats_at_request integer not null,
  capacity_at_request integer not null,
  status public.noowe_capacity_request_status not null default 'pending',
  decision_reason public.noowe_capacity_decision_reason,
  decision_note text check (decision_note is null or char_length(decision_note) <= 300),
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_capacity_requests_pending_per_user
  on public.capacity_requests (table_session_id, requested_user_id)
  where status = 'pending';
create index if not exists idx_capacity_requests_restaurant_status
  on public.capacity_requests (restaurant_id, status, created_at desc);

create table if not exists public.table_session_user_invites (
  id uuid primary key default gen_random_uuid(),
  table_session_id uuid not null references public.table_sessions(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  inviter_id uuid not null references public.profiles(id) on delete cascade,
  invitee_id uuid not null references public.profiles(id) on delete cascade,
  status public.noowe_table_user_invite_status not null default 'pending',
  closed_reason text check (closed_reason is null or closed_reason in (
    'inviter_cancelled', 'inviter_left', 'session_closed', 'feature_disabled',
    'ttl', 'capacity_ttl', 'joined_otherwise', 'joined_other_table'
  )),
  expires_at timestamptz not null,
  responded_at timestamptz,
  capacity_request_id uuid references public.capacity_requests(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint table_session_user_invites_not_self check (inviter_id <> invitee_id)
);

alter table public.capacity_requests
  drop constraint if exists capacity_requests_source_invite_fk;
alter table public.capacity_requests
  add constraint capacity_requests_source_invite_fk
  foreign key (source_invite_id) references public.table_session_user_invites(id) on delete set null;

-- Idempotência do envio: no máximo um convite em aberto por (sessão, convidado).
create unique index if not exists uq_tsui_open_per_invitee
  on public.table_session_user_invites (table_session_id, invitee_id)
  where status in ('pending', 'awaiting_capacity');
create index if not exists idx_tsui_invitee_status
  on public.table_session_user_invites (invitee_id, status);
create index if not exists idx_tsui_inviter_created
  on public.table_session_user_invites (inviter_id, created_at desc);
create index if not exists idx_tsui_session
  on public.table_session_user_invites (table_session_id);

-- RLS: leitura para os envolvidos; nenhuma escrita direta (tudo por RPC).
alter table public.table_session_user_invites enable row level security;
alter table public.capacity_requests enable row level security;

drop policy if exists table_session_user_invites_select_involved on public.table_session_user_invites;
create policy table_session_user_invites_select_involved
  on public.table_session_user_invites
  for select to authenticated
  using (
    invitee_id = auth.uid()
    or inviter_id = auth.uid()
    or private.is_table_session_participant(table_session_id)
  );

drop policy if exists capacity_requests_select_staff_or_requester on public.capacity_requests;
create policy capacity_requests_select_staff_or_requester
  on public.capacity_requests
  for select to authenticated
  using (
    requested_user_id = auth.uid()
    or private.has_restaurant_role(restaurant_id)
  );

revoke insert, update, delete on public.table_session_user_invites from anon, authenticated;
revoke insert, update, delete on public.capacity_requests from anon, authenticated;
grant select on public.table_session_user_invites to authenticated;
grant select on public.capacity_requests to authenticated;

do $$
declare realtime_table text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach realtime_table in array array['table_session_user_invites', 'capacity_requests'] loop
      execute format('alter table public.%I replica identity full', realtime_table);
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = realtime_table
      ) then
        execute format('alter publication supabase_realtime add table public.%I', realtime_table);
      end if;
    end loop;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Saída de mesa parametrizada por usuário.
--    A recepção aprova a entrada de outra pessoa, e essa pessoa pode precisar
--    sair da mesa em que estava; por isso o corpo de customer_leave_table_session
--    passa a viver aqui, sem auth.uid().  O comportamento é o mesmo.
-- ---------------------------------------------------------------------------
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

  if exists (select 1 from private.table_unpaid_items(p_table_session_id)
    where customer_id = p_user_id and remaining_cents > 0) then
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

create or replace function public.customer_leave_table_session(p_table_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  return private.leave_table_session_as(p_table_session_id, auth.uid());
end;
$$;
revoke all on function public.customer_leave_table_session(uuid) from public;
grant execute on function public.customer_leave_table_session(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Helpers
-- ---------------------------------------------------------------------------

-- Ocupação = soma de seat_count (usuários e acompanhantes).
create or replace function private.table_session_occupied_seats(p_table_session_id uuid)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(sum(seat_count), 0)::integer
  from public.table_session_participants
  where table_session_id = p_table_session_id;
$$;

-- ADR-007 (PROVISÓRIO): regra única de lotação.  A fatia G2 reaproveita esta
-- função no QR e no link; trocar a regra é mudar só aqui.
create or replace function private.table_session_capacity_check(p_table_session_id uuid, p_extra_seats integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_enforced boolean;
  v_capacity integer;
  v_occupied integer := private.table_session_occupied_seats(p_table_session_id);
begin
  select coalesce(c.enforce_table_capacity, true), t.seats::integer
  into v_enforced, v_capacity
  from public.table_sessions s
  join public.tables t on t.id = s.table_id
  left join public.restaurant_model_configs c on c.restaurant_id = s.restaurant_id
  where s.id = p_table_session_id;

  return jsonb_build_object(
    'enforced', v_enforced,
    'capacity', v_capacity,
    'occupied', v_occupied,
    'fits', not v_enforced or v_occupied + p_extra_seats <= v_capacity
  );
end;
$$;

-- Mesma regra do QR: com saldo em aberto em outra mesa, não troca (P0004).
create or replace function private.assert_can_switch_to_table(p_user_id uuid, p_table_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $$
begin
  if exists (
    select 1
    from public.table_session_participants p
    join public.table_sessions s on s.id = p.table_session_id
    join lateral private.table_unpaid_items(s.id) o on o.customer_id = p_user_id
    where p.user_id = p_user_id
      and s.status = 'active'
      and s.table_id <> p_table_id
      and o.remaining_cents > 0
  ) then
    raise exception 'Quite sua conta na mesa atual antes de entrar em outra'
      using errcode = 'P0004';
  end if;
end;
$$;

create or replace function private.leave_other_tables(p_user_id uuid, p_table_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  perform private.assert_can_switch_to_table(p_user_id, p_table_id);
  perform private.leave_table_session_as(s.id, p_user_id)
  from public.table_sessions s
  join public.table_session_participants p on p.table_session_id = s.id
  where p.user_id = p_user_id and s.status = 'active' and s.table_id <> p_table_id;
end;
$$;

create or replace function private.join_table_session_participant(
  p_table_session_id uuid, p_user_id uuid, p_seat_count integer default 1
)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_name text;
  v_table_id uuid;
begin
  select full_name into v_name from public.profiles where id = p_user_id;
  insert into public.table_session_participants(table_session_id, user_id, display_name, is_host, seat_count)
  values (p_table_session_id, p_user_id, coalesce(nullif(btrim(v_name), ''), 'Cliente'), false, p_seat_count)
  on conflict (table_session_id, user_id) where user_id is not null do nothing;

  update public.table_sessions
  set last_activity = now(), updated_at = now()
  where id = p_table_session_id
  returning table_id into v_table_id;

  update public.tables
  set status = 'occupied', occupied_since = coalesce(occupied_since, now()), updated_at = now()
  where id = v_table_id;
end;
$$;

create or replace function private.table_session_visit_payload(p_table_session_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'restaurantId', s.restaurant_id, 'tableId', s.table_id,
    'tableSessionId', s.id, 'tableNumber', t.table_number)
  from public.table_sessions s join public.tables t on t.id = s.table_id
  where s.id = p_table_session_id;
$$;

-- "Bruno de Castro" -> "Bruno C."
create or replace function private.short_display_name(p_full_name text)
returns text
language sql
immutable
as $$
  select case
    when nullif(btrim(coalesce(p_full_name, '')), '') is null then null
    when array_length(regexp_split_to_array(btrim(p_full_name), '\s+'), 1) = 1 then btrim(p_full_name)
    else split_part(btrim(p_full_name), ' ', 1) || ' ' ||
      upper(left((regexp_split_to_array(btrim(p_full_name), '\s+'))[
        array_length(regexp_split_to_array(btrim(p_full_name), '\s+'), 1)], 1)) || '.'
  end;
$$;

create or replace function private.public_user_card(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select jsonb_build_object(
    'userId', p.id, 'username', p.username,
    'displayName', coalesce(private.short_display_name(p.full_name), '@' || p.username),
    'avatarUrl', p.avatar_url)
  from public.profiles p where p.id = p_user_id;
$$;

-- Expiração preguiçosa.  Não notifica: o estado final aparece na lista/realtime.
create or replace function private.expire_due_table_user_invites(
  p_invitee_id uuid default null, p_table_session_id uuid default null, p_restaurant_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  update public.table_session_user_invites i
  set status = 'expired', closed_reason = 'ttl', updated_at = now()
  where i.status = 'pending'
    and i.expires_at <= now()
    and (p_invitee_id is null or i.invitee_id = p_invitee_id)
    and (p_table_session_id is null or i.table_session_id = p_table_session_id)
    and (p_restaurant_id is null or i.restaurant_id = p_restaurant_id);

  with expired as (
    update public.capacity_requests c
    set status = 'expired', updated_at = now()
    where c.status = 'pending'
      and c.expires_at <= now()
      and (p_invitee_id is null or c.requested_user_id = p_invitee_id)
      and (p_table_session_id is null or c.table_session_id = p_table_session_id)
      and (p_restaurant_id is null or c.restaurant_id = p_restaurant_id)
    returning c.id
  )
  update public.table_session_user_invites i
  set status = 'expired', closed_reason = 'capacity_ttl', updated_at = now()
  from expired
  where i.capacity_request_id = expired.id and i.status = 'awaiting_capacity';
end;
$$;

create or replace function private.table_user_invite_json(p_invite_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select jsonb_build_object(
    'id', i.id,
    'tableSessionId', i.table_session_id,
    'restaurantId', i.restaurant_id,
    'restaurantName', r.name,
    'tableId', s.table_id,
    'tableNumber', t.table_number,
    'status', i.status,
    'closedReason', i.closed_reason,
    'expiresAt', i.expires_at,
    'respondedAt', i.responded_at,
    'createdAt', i.created_at,
    'capacityRequestId', i.capacity_request_id,
    'capacityExpiresAt', c.expires_at,
    'inviter', private.public_user_card(i.inviter_id),
    'invitee', private.public_user_card(i.invitee_id),
    'sentByMe', i.inviter_id = auth.uid(),
    'canCancel', i.inviter_id = auth.uid() and i.status in ('pending', 'awaiting_capacity'),
    'canRespond', i.invitee_id = auth.uid() and i.status = 'pending' and i.expires_at > now()
  )
  from public.table_session_user_invites i
  join public.restaurants r on r.id = i.restaurant_id
  join public.table_sessions s on s.id = i.table_session_id
  join public.tables t on t.id = s.table_id
  left join public.capacity_requests c on c.id = i.capacity_request_id
  where i.id = p_invite_id;
$$;

-- Exige que o chamador seja participante com conta de uma sessão ativa, e que
-- o restaurante tenha o convite por @ ligado.  Devolve a sessão.
create or replace function private.require_user_invite_session(p_table_session_id uuid)
returns public.table_sessions
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_session public.table_sessions;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select * into v_session from public.table_sessions
  where id = p_table_session_id and status = 'active';

  if v_session.id is null or not exists (
    select 1 from public.table_session_participants
    where table_session_id = p_table_session_id and user_id = auth.uid()
  ) then
    raise exception 'Você não está nesta mesa' using errcode = 'P0001';
  end if;

  if not coalesce((select c.user_invite_enabled from public.restaurant_model_configs c
                   where c.restaurant_id = v_session.restaurant_id), false) then
    raise exception 'Convite por @ indisponível neste restaurante' using errcode = 'P0009';
  end if;

  return v_session;
end;
$$;

revoke all on function private.table_session_occupied_seats(uuid) from public, anon, authenticated;
revoke all on function private.table_session_capacity_check(uuid, integer) from public, anon, authenticated;
revoke all on function private.assert_can_switch_to_table(uuid, uuid) from public, anon, authenticated;
revoke all on function private.leave_other_tables(uuid, uuid) from public, anon, authenticated;
revoke all on function private.join_table_session_participant(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function private.table_session_visit_payload(uuid) from public, anon, authenticated;
revoke all on function private.public_user_card(uuid) from public, anon, authenticated;
revoke all on function private.expire_due_table_user_invites(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function private.table_user_invite_json(uuid) from public, anon, authenticated;
revoke all on function private.require_user_invite_session(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Ciclo de vida por trigger
-- ---------------------------------------------------------------------------

-- Sessão deixou de estar ativa (pagamento, saída do último, abandono): tudo que
-- estava em aberto expira.
create or replace function private.tsui_on_session_closed()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if old.status = 'active' and new.status is distinct from 'active' then
    update public.table_session_user_invites
    set status = 'expired', closed_reason = 'session_closed', updated_at = now()
    where table_session_id = new.id and status in ('pending', 'awaiting_capacity');

    update public.capacity_requests
    set status = 'expired', updated_at = now()
    where table_session_id = new.id and status = 'pending';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_tsui_session_closed on public.table_sessions;
create trigger trg_tsui_session_closed
after update of status on public.table_sessions
for each row execute function private.tsui_on_session_closed();

-- Quem convidou saiu da mesa: os convites ainda sem resposta caem.  Os que o
-- convidado já aceitou (awaiting_capacity) seguem com a recepção.
create or replace function private.tsui_on_participant_left()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if old.user_id is not null then
    update public.table_session_user_invites
    set status = 'cancelled', closed_reason = 'inviter_left', updated_at = now()
    where table_session_id = old.table_session_id
      and inviter_id = old.user_id
      and status = 'pending';
  end if;
  return old;
end;
$$;

drop trigger if exists trg_tsui_inviter_left on public.table_session_participants;
create trigger trg_tsui_inviter_left
after delete on public.table_session_participants
for each row execute function private.tsui_on_participant_left();

-- O convidado entrou por outro caminho (QR, link): o convite desta mesa fica
-- resolvido, e uma espera de lotação em OUTRA mesa perde o sentido.
create or replace function private.tsui_on_participant_joined()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if new.user_id is null then
    return new;
  end if;

  with closed as (
    update public.table_session_user_invites
    set status = case when table_session_id = new.table_session_id
                      then 'accepted'::public.noowe_table_user_invite_status
                      else 'cancelled'::public.noowe_table_user_invite_status end,
        closed_reason = case when table_session_id = new.table_session_id
                             then 'joined_otherwise' else 'joined_other_table' end,
        responded_at = coalesce(responded_at, now()),
        updated_at = now()
    where invitee_id = new.user_id
      and (
        (table_session_id = new.table_session_id and status in ('pending', 'awaiting_capacity'))
        or (table_session_id <> new.table_session_id and status = 'awaiting_capacity')
      )
    returning capacity_request_id
  )
  update public.capacity_requests c
  set status = 'cancelled', updated_at = now()
  from closed
  where c.id = closed.capacity_request_id and c.status = 'pending';

  return new;
end;
$$;

drop trigger if exists trg_tsui_participant_joined on public.table_session_participants;
create trigger trg_tsui_participant_joined
after insert on public.table_session_participants
for each row execute function private.tsui_on_participant_joined();

-- ---------------------------------------------------------------------------
-- 7. RPCs do cliente
-- ---------------------------------------------------------------------------

-- Busca por PREFIXO do @, nunca por nome.  Só quem está numa mesa ativa busca.
create or replace function public.customer_search_users_for_table(p_table_session_id uuid, p_query text)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_session public.table_sessions := private.require_user_invite_session(p_table_session_id);
  v_config public.restaurant_model_configs;
  v_query text := private.normalize_username_input(p_query);
  v_result jsonb;
begin
  select * into v_config from public.restaurant_model_configs where restaurant_id = v_session.restaurant_id;

  if v_query is null
     or char_length(v_query) < v_config.user_search_min_chars
     or v_query !~ '^[a-z0-9-]+$' then
    raise exception 'Digite ao menos % caracteres do @', v_config.user_search_min_chars
      using errcode = '22023';
  end if;

  perform private.expire_due_table_user_invites(null, p_table_session_id, null);

  select coalesce(jsonb_agg(x.card order by x.exact desc, x.len, x.username), '[]'::jsonb)
  into v_result
  from (
    select
      private.public_user_card(p.id) || jsonb_build_object(
        'inviteState', case
          when exists (select 1 from public.table_session_participants tp
                       where tp.table_session_id = p_table_session_id and tp.user_id = p.id)
            then 'already_at_table'
          when exists (select 1 from public.table_session_user_invites i
                       where i.table_session_id = p_table_session_id and i.invitee_id = p.id
                         and i.status in ('pending', 'awaiting_capacity'))
            then 'invite_pending'
          else 'invitable'
        end) as card,
      p.username = v_query as exact,
      char_length(p.username) as len,
      p.username
    from public.profiles p
    where p.username like v_query || '%'
      and p.id <> auth.uid()
      and p.is_active
      and p.deleted_at is null
      and p.deletion_requested_at is null
      and exists (
        select 1 from public.profile_roles pr
        where pr.user_id = p.id and pr.role_key = 'customer' and pr.is_active
      )
    order by p.username = v_query desc, char_length(p.username), p.username
    limit v_config.user_search_limit
  ) x;

  return v_result;
end;
$$;

create or replace function public.customer_send_table_user_invite(p_table_session_id uuid, p_invitee_username text)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_session public.table_sessions := private.require_user_invite_session(p_table_session_id);
  v_config public.restaurant_model_configs;
  v_username text := private.normalize_username_input(p_invitee_username);
  v_invitee public.profiles;
  v_inviter public.profiles;
  v_existing uuid;
  v_invite_id uuid;
  v_restaurant_name text;
  v_table_number text;
begin
  select * into v_config from public.restaurant_model_configs where restaurant_id = v_session.restaurant_id;
  select * into v_inviter from public.profiles where id = auth.uid();

  select * into v_invitee from public.profiles p
  where p.username = v_username
    and p.is_active and p.deleted_at is null and p.deletion_requested_at is null
    and exists (select 1 from public.profile_roles pr
                where pr.user_id = p.id and pr.role_key = 'customer' and pr.is_active);

  if v_invitee.id is null then
    raise exception 'Usuário não encontrado' using errcode = 'P0002';
  end if;
  if v_invitee.id = auth.uid() then
    raise exception 'Você já está na mesa' using errcode = '22023';
  end if;
  if exists (select 1 from public.table_session_participants
             where table_session_id = p_table_session_id and user_id = v_invitee.id) then
    raise exception '@% já está na mesa', v_invitee.username using errcode = 'P0001';
  end if;

  perform private.expire_due_table_user_invites(null, p_table_session_id, null);

  -- Reenvio devolve o convite que já está aberto (idempotente).
  select id into v_existing from public.table_session_user_invites
  where table_session_id = p_table_session_id and invitee_id = v_invitee.id
    and status in ('pending', 'awaiting_capacity');
  if v_existing is not null then
    return private.table_user_invite_json(v_existing) || jsonb_build_object('idempotentReplay', true);
  end if;

  if exists (
    select 1 from public.table_session_user_invites
    where table_session_id = p_table_session_id and invitee_id = v_invitee.id
      and status = 'declined'
      and responded_at > now() - make_interval(mins => v_config.user_invite_redecline_cooldown_min)
  ) then
    raise exception '@% recusou o convite há pouco. Tente mais tarde', v_invitee.username
      using errcode = 'P0008';
  end if;

  if (select count(*) from public.table_session_user_invites
      where table_session_id = p_table_session_id and status in ('pending', 'awaiting_capacity'))
     >= v_config.user_invite_max_pending_per_session then
    raise exception 'Muitos convites em aberto nesta mesa' using errcode = 'P0008';
  end if;

  if (select count(*) from public.table_session_user_invites
      where inviter_id = auth.uid() and created_at > now() - interval '1 hour')
     >= v_config.user_invite_max_per_inviter_hour then
    raise exception 'Muitos convites, tente em alguns minutos' using errcode = 'P0008';
  end if;

  begin
    insert into public.table_session_user_invites(
      table_session_id, restaurant_id, inviter_id, invitee_id, expires_at
    ) values (
      p_table_session_id, v_session.restaurant_id, auth.uid(), v_invitee.id,
      now() + make_interval(mins => v_config.user_invite_ttl_min)
    ) returning id into v_invite_id;
  exception when unique_violation then
    -- Dois envios simultâneos: o segundo devolve o do primeiro.
    select id into v_existing from public.table_session_user_invites
    where table_session_id = p_table_session_id and invitee_id = v_invitee.id
      and status in ('pending', 'awaiting_capacity');
    return private.table_user_invite_json(v_existing) || jsonb_build_object('idempotentReplay', true);
  end;

  select r.name, t.table_number into v_restaurant_name, v_table_number
  from public.restaurants r, public.tables t
  where r.id = v_session.restaurant_id and t.id = v_session.table_id;

  perform private.create_notification(
    v_invitee.id,
    'Convite para mesa',
    '@' || v_inviter.username || ' te chamou para a mesa ' || v_table_number || ' no ' || v_restaurant_name,
    'table_invite',
    p_table_session_id,
    'table_session',
    jsonb_build_object(
      'kind', 'table_user_invite',
      'invite_id', v_invite_id,
      'table_session_id', p_table_session_id,
      'restaurant_id', v_session.restaurant_id,
      'restaurant_name', v_restaurant_name,
      'table_number', v_table_number,
      'inviter_username', v_inviter.username
    )
  );

  return private.table_user_invite_json(v_invite_id) || jsonb_build_object('idempotentReplay', false);
end;
$$;

create or replace function public.customer_cancel_table_user_invite(p_invite_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_invite public.table_session_user_invites;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select * into v_invite from public.table_session_user_invites
  where id = p_invite_id and inviter_id = auth.uid()
  for update;
  if v_invite.id is null then
    raise exception 'Convite não encontrado' using errcode = 'P0002';
  end if;

  if v_invite.status in ('pending', 'awaiting_capacity') then
    update public.table_session_user_invites
    set status = 'cancelled', closed_reason = 'inviter_cancelled', updated_at = now()
    where id = p_invite_id;

    update public.capacity_requests set status = 'cancelled', updated_at = now()
    where id = v_invite.capacity_request_id and status = 'pending';
  end if;

  return private.table_user_invite_json(p_invite_id);
end;
$$;

create or replace function private.notify_inviter_of_response(p_invite_id uuid, p_title text, p_verb text)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_row record;
begin
  select i.inviter_id, i.table_session_id, i.restaurant_id, invitee.username as invitee_username, t.table_number
  into v_row
  from public.table_session_user_invites i
  join public.profiles invitee on invitee.id = i.invitee_id
  join public.table_sessions s on s.id = i.table_session_id
  join public.tables t on t.id = s.table_id
  where i.id = p_invite_id;

  perform private.create_notification(
    v_row.inviter_id, p_title,
    '@' || v_row.invitee_username || ' ' || p_verb || ' (mesa ' || v_row.table_number || ')',
    'table_invite_update', v_row.table_session_id, 'table_session',
    jsonb_build_object('kind', 'table_user_invite_update', 'invite_id', p_invite_id,
      'table_session_id', v_row.table_session_id, 'restaurant_id', v_row.restaurant_id));
end;
$$;
revoke all on function private.notify_inviter_of_response(uuid, text, text) from public, anon, authenticated;

-- Aceite.  Devolve {status, ...} em vez de levantar erro, para que a transição
-- para `expired`/`cancelled` fique gravada.  Só levanta em falha de autenticação,
-- convite alheio e P0004 (saldo em outra mesa) — nesses casos o convite continua
-- `pending` de propósito, para o convidado quitar e tentar de novo.
create or replace function public.customer_accept_table_user_invite(p_invite_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
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

  if v_invite.status = 'accepted' then
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
             where table_session_id = v_session.id and user_id = auth.uid()) then
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
$$;

create or replace function public.customer_decline_table_user_invite(p_invite_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_invite public.table_session_user_invites;
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

  if v_invite.status in ('pending', 'awaiting_capacity') then
    update public.table_session_user_invites
    set status = 'declined', responded_at = now(), updated_at = now()
    where id = p_invite_id;

    update public.capacity_requests set status = 'cancelled', updated_at = now()
    where id = v_invite.capacity_request_id and status = 'pending';

    perform private.notify_inviter_of_response(p_invite_id, 'Convite recusado', 'recusou o convite');
  end if;

  return jsonb_build_object('status', (select status from public.table_session_user_invites where id = p_invite_id),
    'invite', private.table_user_invite_json(p_invite_id));
end;
$$;

create or replace function public.customer_list_incoming_table_invites()
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  perform private.expire_due_table_user_invites(auth.uid(), null, null);

  select coalesce(jsonb_agg(private.table_user_invite_json(i.id) order by i.created_at desc), '[]'::jsonb)
  into v_result
  from public.table_session_user_invites i
  join public.table_sessions s on s.id = i.table_session_id and s.status = 'active'
  where i.invitee_id = auth.uid()
    and i.status in ('pending', 'awaiting_capacity');

  return v_result;
end;
$$;

-- Estado de convites específicos (usado pela tela de notificações para decidir
-- se mostra Aceitar/Recusar ou o estado final).
create or replace function public.customer_get_table_user_invites(p_invite_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  perform private.expire_due_table_user_invites(auth.uid(), null, null);

  select coalesce(jsonb_agg(private.table_user_invite_json(i.id)), '[]'::jsonb)
  into v_result
  from public.table_session_user_invites i
  where i.id = any(p_invite_ids)
    and (i.invitee_id = auth.uid() or i.inviter_id = auth.uid());

  return v_result;
end;
$$;

create or replace function public.customer_list_table_session_user_invites(p_table_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if not private.is_table_session_participant(p_table_session_id) then
    raise exception 'Você não está nesta mesa' using errcode = 'P0001';
  end if;

  perform private.expire_due_table_user_invites(null, p_table_session_id, null);

  select coalesce(jsonb_agg(private.table_user_invite_json(i.id) order by i.created_at desc), '[]'::jsonb)
  into v_result
  from public.table_session_user_invites i
  where i.table_session_id = p_table_session_id;

  return v_result;
end;
$$;

revoke all on function public.customer_search_users_for_table(uuid, text) from public;
revoke all on function public.customer_send_table_user_invite(uuid, text) from public;
revoke all on function public.customer_cancel_table_user_invite(uuid) from public;
revoke all on function public.customer_accept_table_user_invite(uuid) from public;
revoke all on function public.customer_decline_table_user_invite(uuid) from public;
revoke all on function public.customer_list_incoming_table_invites() from public;
revoke all on function public.customer_get_table_user_invites(uuid[]) from public;
revoke all on function public.customer_list_table_session_user_invites(uuid) from public;

grant execute on function public.customer_search_users_for_table(uuid, text) to authenticated;
grant execute on function public.customer_send_table_user_invite(uuid, text) to authenticated;
grant execute on function public.customer_cancel_table_user_invite(uuid) to authenticated;
grant execute on function public.customer_accept_table_user_invite(uuid) to authenticated;
grant execute on function public.customer_decline_table_user_invite(uuid) to authenticated;
grant execute on function public.customer_list_incoming_table_invites() to authenticated;
grant execute on function public.customer_get_table_user_invites(uuid[]) to authenticated;
grant execute on function public.customer_list_table_session_user_invites(uuid) to authenticated;
