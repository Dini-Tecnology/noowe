-- Service model runtime V2.
-- Additive migration: keeps legacy columns/RPCs alive while making the
-- selected journey, payment gate and fulfilment workflow server-authoritative.

do $$
begin
  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'noowe_payment_status') then
    create type public.noowe_payment_status as enum ('pending', 'confirmed', 'failed', 'refunded');
  end if;
  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'noowe_fulfillment_status') then
    create type public.noowe_fulfillment_status as enum (
      'received', 'preparing', 'checking', 'ready', 'delivered', 'picked_up', 'cancelled'
    );
  end if;
  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'noowe_order_origin') then
    create type public.noowe_order_origin as enum ('table_session', 'waitlist', 'counter');
  end if;
end $$;

create table if not exists public.restaurant_model_policies (
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  service_model public.noowe_service_model not null,
  reservation_enabled boolean not null,
  reservation_required boolean not null,
  queue_enabled boolean not null,
  queue_as_primary_entry boolean not null,
  order_while_waiting boolean not null,
  table_check_in_enabled boolean not null,
  table_qr_enabled boolean not null,
  counter_qr_enabled boolean not null,
  guest_link_enabled boolean not null,
  user_invite_enabled boolean not null,
  split_modes public.noowe_split_mode[] not null,
  service_fee_bps integer not null check (service_fee_bps between 0 and 10000),
  tip_presets_bps integer[] not null,
  staff_call_types text[] not null,
  combo_discount_bps integer not null check (combo_discount_bps between 0 and 10000),
  prepaid_required boolean not null,
  pickup_capacity_per_slot integer check (pickup_capacity_per_slot is null or pickup_capacity_per_slot > 0),
  pickup_expiry_min integer not null check (pickup_expiry_min > 0),
  stamps_per_reward integer not null check (stamps_per_reward > 0),
  loyalty_mode public.noowe_loyalty_mode not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (restaurant_id, service_model),
  constraint restaurant_model_policies_entry_valid check (
    (service_model = 'quick_service' and counter_qr_enabled and prepaid_required
      and not reservation_enabled and not queue_enabled and not table_check_in_enabled
      and cardinality(split_modes) = 0 and cardinality(staff_call_types) = 0)
    or
    (service_model <> 'quick_service' and table_check_in_enabled and table_qr_enabled
      and (reservation_enabled or queue_enabled))
  ),
  constraint restaurant_model_policies_calls_valid check (
    staff_call_types <@ array['waiter','sommelier','help','bill']::text[]
    and (service_model = 'fine_dining' or not ('sommelier' = any(staff_call_types)))
  )
);

insert into public.restaurant_model_policies (
  restaurant_id, service_model, reservation_enabled, reservation_required,
  queue_enabled, queue_as_primary_entry, order_while_waiting,
  table_check_in_enabled, table_qr_enabled, counter_qr_enabled,
  guest_link_enabled, user_invite_enabled, split_modes, service_fee_bps,
  tip_presets_bps, staff_call_types, combo_discount_bps, prepaid_required,
  pickup_capacity_per_slot, pickup_expiry_min, stamps_per_reward, loyalty_mode
)
select c.restaurant_id, model,
  case when model = 'quick_service' then false else c.reservation_enabled end,
  model = 'fine_dining',
  case when model = 'quick_service' then false else c.queue_enabled end,
  model = 'casual_dining',
  model <> 'quick_service',
  model <> 'quick_service', model <> 'quick_service', model = 'quick_service',
  model <> 'quick_service' and c.guest_link_enabled,
  model <> 'quick_service' and c.user_invite_enabled,
  case when model = 'quick_service' then array[]::public.noowe_split_mode[] else c.split_modes end,
  case when model = 'quick_service' then 0 else c.service_fee_bps end,
  case when model = 'quick_service' then array[]::integer[] else c.tip_presets_bps end,
  case model
    when 'fine_dining' then array['waiter','sommelier','help','bill']::text[]
    when 'casual_dining' then array['waiter','help','bill']::text[]
    else array[]::text[]
  end,
  c.combo_discount_bps, model = 'quick_service', c.pickup_capacity_per_slot,
  c.pickup_expiry_min, c.stamps_per_reward,
  case when model = 'quick_service' and c.loyalty_mode not in ('stamps','mixed')
    then 'stamps'::public.noowe_loyalty_mode else c.loyalty_mode end
from public.restaurant_model_configs c
cross join lateral unnest(c.service_models) model
on conflict (restaurant_id, service_model) do nothing;

create or replace function private.sync_restaurant_model_policies()
returns trigger language plpgsql security definer set search_path=public,private,pg_temp as $$
declare model public.noowe_service_model;
begin
  foreach model in array new.service_models loop
    insert into public.restaurant_model_policies(
      restaurant_id,service_model,reservation_enabled,reservation_required,queue_enabled,
      queue_as_primary_entry,order_while_waiting,table_check_in_enabled,table_qr_enabled,
      counter_qr_enabled,guest_link_enabled,user_invite_enabled,split_modes,service_fee_bps,
      tip_presets_bps,staff_call_types,combo_discount_bps,prepaid_required,
      pickup_capacity_per_slot,pickup_expiry_min,stamps_per_reward,loyalty_mode
    ) values(
      new.restaurant_id,model,model<>'quick_service' and new.reservation_enabled,
      model='fine_dining',model<>'quick_service' and new.queue_enabled,
      model='casual_dining',model<>'quick_service',model<>'quick_service',model<>'quick_service',
      model='quick_service',model<>'quick_service' and new.guest_link_enabled,
      model<>'quick_service' and new.user_invite_enabled,
      case when model='quick_service' then array[]::public.noowe_split_mode[] else new.split_modes end,
      case when model='quick_service' then 0 else new.service_fee_bps end,
      case when model='quick_service' then array[]::integer[] else new.tip_presets_bps end,
      case model when 'fine_dining' then array['waiter','sommelier','help','bill']::text[]
        when 'casual_dining' then array['waiter','help','bill']::text[] else array[]::text[] end,
      new.combo_discount_bps,model='quick_service',new.pickup_capacity_per_slot,
      new.pickup_expiry_min,new.stamps_per_reward,
      case when model='quick_service' and new.loyalty_mode not in ('stamps','mixed')
        then 'stamps'::public.noowe_loyalty_mode else new.loyalty_mode end
    ) on conflict(restaurant_id,service_model) do update set
      reservation_enabled=excluded.reservation_enabled,
      queue_enabled=excluded.queue_enabled,
      guest_link_enabled=excluded.guest_link_enabled,
      user_invite_enabled=excluded.user_invite_enabled,
      split_modes=excluded.split_modes,service_fee_bps=excluded.service_fee_bps,
      tip_presets_bps=excluded.tip_presets_bps,combo_discount_bps=excluded.combo_discount_bps,
      pickup_capacity_per_slot=excluded.pickup_capacity_per_slot,
      pickup_expiry_min=excluded.pickup_expiry_min,stamps_per_reward=excluded.stamps_per_reward,
      updated_at=now();
  end loop;
  delete from public.restaurant_model_policies where restaurant_id=new.restaurant_id
    and not(service_model=any(new.service_models));
  -- Dual-write only for legacy receipt/RPC readers during rollout.
  update public.restaurants set service_config=coalesce(service_config,'{}'::jsonb)
    || jsonb_build_object('service_fee_percent',new.service_fee_bps::numeric/100),updated_at=now()
    where id=new.restaurant_id;
  return new;
end $$;
drop trigger if exists restaurant_model_configs_sync_policies on public.restaurant_model_configs;
create trigger restaurant_model_configs_sync_policies after insert or update on public.restaurant_model_configs
for each row execute function private.sync_restaurant_model_policies();

update public.restaurants r set service_config=coalesce(r.service_config,'{}'::jsonb)
  || jsonb_build_object('service_fee_percent',c.service_fee_bps::numeric/100),updated_at=now()
from public.restaurant_model_configs c where c.restaurant_id=r.id;

alter table public.restaurant_model_policies enable row level security;
drop policy if exists restaurant_model_policies_read on public.restaurant_model_policies;
create policy restaurant_model_policies_read on public.restaurant_model_policies
  for select to authenticated using (true);
drop policy if exists restaurant_model_policies_manage on public.restaurant_model_policies;
create policy restaurant_model_policies_manage on public.restaurant_model_policies
  for all to authenticated
  using (private.has_restaurant_role(restaurant_id, array['owner','manager']::public.user_roles_role_enum[]))
  with check (private.has_restaurant_role(restaurant_id, array['owner','manager']::public.user_roles_role_enum[]));

alter table public.orders
  add column if not exists service_model public.noowe_service_model,
  add column if not exists origin_type public.noowe_order_origin,
  add column if not exists waitlist_entry_id uuid references public.waitlist_entries(id) on delete set null,
  add column if not exists payment_status public.noowe_payment_status not null default 'pending',
  add column if not exists fulfillment_status public.noowe_fulfillment_status not null default 'received',
  add column if not exists subtotal_cents bigint,
  add column if not exists service_fee_cents bigint not null default 0,
  add column if not exists tip_cents bigint not null default 0,
  add column if not exists discount_cents bigint not null default 0,
  add column if not exists total_cents bigint,
  add column if not exists pickup_code text,
  add column if not exists pickup_expires_at timestamptz,
  add column if not exists pickup_slot_start timestamptz,
  add column if not exists service_model_review_required boolean not null default false;

alter table public.order_items
  add column if not exists unit_price_cents bigint,
  add column if not exists total_price_cents bigint;

alter table public.table_sessions
  add column if not exists service_model public.noowe_service_model,
  add column if not exists reservation_id uuid references public.reservations(id) on delete set null,
  add column if not exists waitlist_entry_id uuid references public.waitlist_entries(id) on delete set null;
alter table public.reservations add column if not exists service_model public.noowe_service_model;
alter table public.waitlist_entries add column if not exists service_model public.noowe_service_model;

create or replace function private.guard_room_entry_model()
returns trigger language plpgsql set search_path=public,private,pg_temp as $$
declare v_feature boolean;
begin
  if new.service_model is null then
    select case when r.service_type in ('fine_dining','casual_dining')
      then r.service_type::public.noowe_service_model
      when exists(select 1 from public.restaurant_model_policies p where p.restaurant_id=new.restaurant_id and p.service_model='casual_dining')
      then 'casual_dining'::public.noowe_service_model else 'fine_dining'::public.noowe_service_model end
    into new.service_model from public.restaurants r where r.id=new.restaurant_id;
  end if;
  if new.service_model='quick_service' then raise exception 'Quick Service não oferece reserva ou fila' using errcode='23514'; end if;
  if tg_table_name='reservations' then
    select reservation_enabled into v_feature from public.restaurant_model_policies
      where restaurant_id=new.restaurant_id and service_model=new.service_model;
  else
    select queue_enabled into v_feature from public.restaurant_model_policies
      where restaurant_id=new.restaurant_id and service_model=new.service_model;
  end if;
  if not coalesce(v_feature,false) then raise exception 'Entrada indisponível para este modelo' using errcode='23514'; end if;
  return new;
end $$;
drop trigger if exists reservations_guard_room_model on public.reservations;
create trigger reservations_guard_room_model before insert on public.reservations
for each row execute function private.guard_room_entry_model();
drop trigger if exists waitlist_guard_room_model on public.waitlist_entries;
create trigger waitlist_guard_room_model before insert on public.waitlist_entries
for each row execute function private.guard_room_entry_model();

create or replace function private.default_table_session_service_model()
returns trigger language plpgsql set search_path=public,private,pg_temp as $$
begin
  if new.service_model is null then
    select case
      when r.service_type='fine_dining' and 'fine_dining'::public.noowe_service_model=any(c.service_models)
        then 'fine_dining'::public.noowe_service_model
      when 'casual_dining'::public.noowe_service_model=any(c.service_models)
        then 'casual_dining'::public.noowe_service_model
      else 'fine_dining'::public.noowe_service_model end
    into new.service_model from public.restaurant_model_configs c
      join public.restaurants r on r.id=c.restaurant_id where c.restaurant_id=new.restaurant_id;
  end if;
  return new;
end $$;
drop trigger if exists table_sessions_default_service_model on public.table_sessions;
create trigger table_sessions_default_service_model before insert on public.table_sessions
for each row execute function private.default_table_session_service_model();

alter table public.capacity_requests drop constraint if exists capacity_requests_source_check;
alter table public.capacity_requests add constraint capacity_requests_source_check
  check(source in ('user_invite','table_qr','guest_link','companion'));
alter table public.capacity_requests add column if not exists payload jsonb not null default '{}'::jsonb;

alter table public.table_session_invites add column if not exists token_hash text;
update public.table_session_invites set token_hash=encode(sha256(token::bytea),'hex') where token_hash is null;
create unique index if not exists uq_table_session_invites_token_hash on public.table_session_invites(token_hash);

create or replace function public.customer_create_table_invite(p_table_session_id uuid)
returns text language plpgsql security definer set search_path=public,private,extensions,pg_temp as $$
declare v_raw text:=encode(gen_random_bytes(24),'hex'); v_hash text; v_ttl integer; v_session public.table_sessions;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
  select s.* into v_session from public.table_sessions s where s.id=p_table_session_id and s.status='active'
    and private.is_table_session_participant(s.id);
  if v_session.id is null then raise exception 'Table session not accessible' using errcode='P0001'; end if;
  if not exists(select 1 from public.restaurant_model_policies where restaurant_id=v_session.restaurant_id
    and service_model=v_session.service_model and guest_link_enabled) then
    raise exception 'Convite por link indisponível neste modelo' using errcode='23514'; end if;
  select guest_link_ttl_min into v_ttl from public.restaurant_model_configs where restaurant_id=v_session.restaurant_id;
  v_hash:=encode(sha256(v_raw::bytea),'hex');
  insert into public.table_session_invites(table_session_id,token,token_hash,created_by,expires_at)
    values(p_table_session_id,v_hash,v_hash,auth.uid(),now()+make_interval(mins=>v_ttl));
  return 'https://noowebr.com/t/invite/'||v_raw;
end $$;

create or replace function public.customer_join_table_invite(p_token text)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_invite public.table_session_invites; v_session public.table_sessions; v_table public.tables; v_name text;
  v_occupied integer; v_request_id uuid; v_ttl integer;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
  select * into v_invite from public.table_session_invites where token_hash=encode(sha256(p_token::bytea),'hex')
    and revoked_at is null and expires_at>now();
  if v_invite.id is null then raise exception 'Invalid or expired invitation' using errcode='P0001'; end if;
  select * into v_session from public.table_sessions where id=v_invite.table_session_id and status='active' for update;
  if v_session.id is null then raise exception 'This table session has ended' using errcode='P0001'; end if;
  select * into v_table from public.tables where id=v_session.table_id;
  if (select enforce_table_capacity from public.restaurant_model_configs where restaurant_id=v_session.restaurant_id)
    and not private.is_table_session_participant(v_session.id) then
    select coalesce(sum(seat_count),0)::integer into v_occupied from public.table_session_participants where table_session_id=v_session.id;
    if v_occupied+1>v_table.seats then
      select capacity_request_ttl_min into v_ttl from public.restaurant_model_configs where restaurant_id=v_session.restaurant_id;
      insert into public.capacity_requests(restaurant_id,table_session_id,table_id,requested_user_id,source,
        seat_count,occupied_seats_at_request,capacity_at_request,expires_at)
      values(v_session.restaurant_id,v_session.id,v_session.table_id,auth.uid(),'guest_link',1,
        v_occupied,v_table.seats::integer,now()+make_interval(mins=>v_ttl))
      on conflict(table_session_id,requested_user_id) where status='pending'
      do update set expires_at=excluded.expires_at returning id into v_request_id;
      return jsonb_build_object('status','awaiting_capacity','capacityRequestId',v_request_id,
        'restaurantId',v_session.restaurant_id,'tableId',v_session.table_id,'serviceModel',v_session.service_model);
    end if;
  end if;
  select full_name into v_name from public.profiles where id=auth.uid();
  perform private.join_table_session_participant(v_session.id,auth.uid(),1);
  return jsonb_build_object('restaurantId',v_session.restaurant_id,'tableId',v_session.table_id,
    'tableSessionId',v_session.id,'tableNumber',v_table.table_number,'serviceModel',v_session.service_model);
end $$;

alter function public.customer_add_table_companion(uuid,text,boolean,smallint,text)
  rename to customer_add_table_companion_legacy_v1;
revoke all on function public.customer_add_table_companion_legacy_v1(uuid,text,boolean,smallint,text) from public,anon,authenticated;

create function public.customer_add_table_companion(
  p_table_session_id uuid,p_name text,p_is_kid boolean default false,
  p_kid_age smallint default null,p_kid_allergies text default null
) returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_session public.table_sessions; v_table public.tables; v_occupied integer; v_ttl integer; v_request_id uuid;
begin
  select * into v_session from public.table_sessions where id=p_table_session_id and status='active' for update;
  if v_session.id is null or not private.is_table_session_participant(v_session.id) then
    raise exception 'Table session not accessible' using errcode='P0001'; end if;
  select * into v_table from public.tables where id=v_session.table_id;
  select coalesce(sum(seat_count),0)::integer into v_occupied from public.table_session_participants
    where table_session_id=v_session.id;
  if (select enforce_table_capacity from public.restaurant_model_configs where restaurant_id=v_session.restaurant_id)
    and v_occupied+1>v_table.seats then
    select capacity_request_ttl_min into v_ttl from public.restaurant_model_configs where restaurant_id=v_session.restaurant_id;
    insert into public.capacity_requests(restaurant_id,table_session_id,table_id,requested_user_id,source,
      seat_count,occupied_seats_at_request,capacity_at_request,expires_at,payload)
    values(v_session.restaurant_id,v_session.id,v_session.table_id,auth.uid(),'companion',1,
      v_occupied,v_table.seats::integer,now()+make_interval(mins=>v_ttl),jsonb_build_object(
        'name',nullif(trim(p_name),''),'isKid',coalesce(p_is_kid,false),'kidAge',p_kid_age,'kidAllergies',nullif(trim(p_kid_allergies),'')))
    returning id into v_request_id;
    perform private.log_audit(v_session.restaurant_id,'capacity_request.created','capacity_request',v_request_id,
      'lotacao_excedida',null,jsonb_build_object('source','companion','occupied',v_occupied,'capacity',v_table.seats),auth.uid());
    return jsonb_build_object('status','awaiting_capacity','capacityRequestId',v_request_id);
  end if;
  return public.customer_add_table_companion_legacy_v1(p_table_session_id,p_name,p_is_kid,p_kid_age,p_kid_allergies);
end $$;
grant execute on function public.customer_add_table_companion(uuid,text,boolean,smallint,text) to authenticated;

alter function public.restaurant_resolve_capacity_request(uuid,text,public.noowe_capacity_decision_reason,text)
  rename to restaurant_resolve_capacity_request_legacy_v1;
revoke all on function public.restaurant_resolve_capacity_request_legacy_v1(uuid,text,public.noowe_capacity_decision_reason,text)
  from public,anon,authenticated;

create function public.restaurant_resolve_capacity_request(
  p_request_id uuid,p_decision text,p_reason public.noowe_capacity_decision_reason,p_note text default null
) returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_request public.capacity_requests; v_before jsonb; v_diner public.table_session_participants; v_name text;
begin
  select * into v_request from public.capacity_requests where id=p_request_id for update;
  if v_request.source is distinct from 'companion' then
    return public.restaurant_resolve_capacity_request_legacy_v1(p_request_id,p_decision,p_reason,p_note);
  end if;
  perform private.require_restaurant_role(v_request.restaurant_id,private.capacity_decider_roles(v_request.restaurant_id));
  if v_request.status<>'pending' then
    if (p_decision='approve' and v_request.status='approved') or (p_decision='reject' and v_request.status='rejected') then
      return private.capacity_request_json(p_request_id)||jsonb_build_object('idempotentReplay',true); end if;
    raise exception 'Solicitação já resolvida' using errcode='23514';
  end if;
  if v_request.expires_at<=now() then
    update public.capacity_requests set status='expired',updated_at=now() where id=p_request_id;
    return private.capacity_request_json(p_request_id);
  end if;
  if p_decision not in ('approve','reject')
    or (p_decision='approve' and p_reason not in ('cadeira_extra','crianca_colo'))
    or (p_decision='reject' and p_reason<>'recusado') then
    raise exception 'Decisão ou motivo inválido' using errcode='22023'; end if;
  v_before:=to_jsonb(v_request);
  update public.capacity_requests set status=case when p_decision='approve' then 'approved' else 'rejected' end,
    decision_reason=p_reason,decision_note=nullif(trim(p_note),''),decided_by=auth.uid(),decided_at=now(),updated_at=now()
    where id=p_request_id returning * into v_request;
  if p_decision='approve' then
    v_name:=nullif(trim(v_request.payload->>'name'),'');
    if v_name is null then raise exception 'Nome do acompanhante inválido' using errcode='23514'; end if;
    insert into public.table_session_participants(table_session_id,user_id,display_name,is_host,is_kid,added_by,
      kid_age,kid_allergies,seat_count)
    values(v_request.table_session_id,null,v_name,false,coalesce((v_request.payload->>'isKid')::boolean,false),
      v_request.requested_user_id,(v_request.payload->>'kidAge')::smallint,v_request.payload->>'kidAllergies',v_request.seat_count)
    returning * into v_diner;
  end if;
  perform private.log_audit(v_request.restaurant_id,'capacity_request.'||v_request.status::text,
    'capacity_request',p_request_id,p_reason::text||coalesce(': '||nullif(trim(p_note),''),''),v_before,to_jsonb(v_request),auth.uid());
  return private.capacity_request_json(p_request_id)||case when v_diner.id is not null
    then jsonb_build_object('companionId',v_diner.id) else '{}'::jsonb end;
end $$;
grant execute on function public.restaurant_resolve_capacity_request(uuid,text,public.noowe_capacity_decision_reason,text) to authenticated;

update public.order_items set
  unit_price_cents = round(unit_price * 100)::bigint,
  total_price_cents = round(total_price * 100)::bigint
where unit_price_cents is null or total_price_cents is null;

update public.orders o set
  service_model = case
    when o.order_type = 'pickup' then 'quick_service'::public.noowe_service_model
    when coalesce(r.service_type, '') = 'fine_dining' then 'fine_dining'::public.noowe_service_model
    else 'casual_dining'::public.noowe_service_model end,
  origin_type = case when o.order_type = 'pickup' then 'counter'::public.noowe_order_origin
    when o.table_session_id is not null then 'table_session'::public.noowe_order_origin
    else 'waitlist'::public.noowe_order_origin end,
  subtotal_cents = coalesce(o.subtotal_cents, round(coalesce(o.subtotal, 0) * 100)::bigint),
  service_fee_cents = coalesce(o.service_fee_cents, round(coalesce(o.tax_amount, 0) * 100)::bigint),
  tip_cents = coalesce(o.tip_cents, round(coalesce(o.tip_amount, 0) * 100)::bigint),
  discount_cents = coalesce(o.discount_cents, round(coalesce(o.discount_amount, 0) * 100)::bigint),
  total_cents = coalesce(o.total_cents, round(coalesce(o.total_amount, 0) * 100)::bigint),
  payment_status = case when o.status::text in ('completed','delivered','picked_up')
    then 'confirmed'::public.noowe_payment_status else o.payment_status end,
  fulfillment_status = case o.status::text
    when 'preparing' then 'preparing'::public.noowe_fulfillment_status
    when 'checking' then 'checking'::public.noowe_fulfillment_status
    when 'ready' then 'ready'::public.noowe_fulfillment_status
    when 'delivered' then 'delivered'::public.noowe_fulfillment_status
    when 'picked_up' then 'picked_up'::public.noowe_fulfillment_status
    when 'cancelled' then 'cancelled'::public.noowe_fulfillment_status
    else 'received'::public.noowe_fulfillment_status end,
  service_model_review_required = o.order_type <> 'pickup' and o.table_session_id is null
from public.restaurants r where r.id = o.restaurant_id and o.service_model is null;

update public.table_sessions s set service_model =
  case when r.service_type = 'fine_dining' then 'fine_dining'::public.noowe_service_model
       else 'casual_dining'::public.noowe_service_model end
from public.restaurants r where r.id = s.restaurant_id and s.service_model is null;

create index if not exists idx_orders_model_payment_fulfillment
  on public.orders (restaurant_id, service_model, payment_status, fulfillment_status, created_at);
create unique index if not exists uq_orders_pickup_code
  on public.orders (restaurant_id, pickup_code) where pickup_code is not null;

create table if not exists public.counter_qr_codes (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  label text not null default 'Balcão',
  qr_code_data text not null unique,
  token_hash text not null unique,
  is_active boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pickup_slot_reservations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  order_id uuid not null unique references public.orders(id) on delete cascade,
  slot_start timestamptz not null,
  status text not null default 'reserved' check (status in ('reserved','released','fulfilled','expired')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_pickup_slots_capacity
  on public.pickup_slot_reservations (restaurant_id, slot_start, status);

create table if not exists public.quick_quality_checks (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  status text not null check (status in ('passed','failed')),
  checklist jsonb not null check (jsonb_typeof(checklist) = 'object'),
  reason text,
  checked_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index if not exists idx_quick_quality_order on public.quick_quality_checks(order_id, created_at desc);

create table if not exists public.quick_stamp_events (
  order_id uuid primary key references public.orders(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  customer_id uuid not null references public.profiles(id) on delete cascade,
  stamp_card_id uuid references public.stamp_cards(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.payment_provider_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_event_id text not null,
  gateway_transaction_id uuid not null references public.gateway_transactions(id) on delete cascade,
  outcome public.noowe_payment_status not null,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);

alter table public.counter_qr_codes enable row level security;
alter table public.pickup_slot_reservations enable row level security;
alter table public.quick_quality_checks enable row level security;
alter table public.quick_stamp_events enable row level security;
alter table public.payment_provider_events enable row level security;
revoke insert, update, delete on public.pickup_slot_reservations, public.quick_quality_checks,
  public.quick_stamp_events, public.payment_provider_events from anon, authenticated;

create or replace function public.restaurant_generate_counter_qr(p_restaurant_id uuid,p_label text default 'Balcão')
returns jsonb language plpgsql security definer set search_path=public,private,extensions,pg_temp as $$
declare v_raw text:=encode(gen_random_bytes(24),'hex'); v_data text; v_row public.counter_qr_codes;
begin
  perform private.require_restaurant_role(p_restaurant_id,array['owner','manager']::public.user_roles_role_enum[]);
  if not exists(select 1 from public.restaurant_model_policies where restaurant_id=p_restaurant_id
    and service_model='quick_service' and counter_qr_enabled) then
    raise exception 'QR de balcão indisponível' using errcode='23514'; end if;
  v_data:='noowe://counter/'||v_raw;
  update public.counter_qr_codes set is_active=false,updated_at=now()
    where restaurant_id=p_restaurant_id and label=coalesce(nullif(trim(p_label),''),'Balcão') and is_active;
  insert into public.counter_qr_codes(restaurant_id,label,qr_code_data,token_hash)
    values(p_restaurant_id,coalesce(nullif(trim(p_label),''),'Balcão'),v_data,encode(sha256(v_raw::bytea),'hex'))
    returning * into v_row;
  return jsonb_build_object('id',v_row.id,'restaurantId',v_row.restaurant_id,
    'label',v_row.label,'qrData',v_row.qr_code_data,'createdAt',v_row.created_at);
end $$;
grant execute on function public.restaurant_generate_counter_qr(uuid,text) to authenticated,service_role;

create or replace function private.release_quick_resources_on_cancel()
returns trigger language plpgsql security definer set search_path=public,private,pg_temp as $$
begin
  if new.status::text='cancelled' and old.status::text<>'cancelled' then
    new.fulfillment_status:='cancelled';
    update public.pickup_slot_reservations set status='released'
      where order_id=new.id and status='reserved';
    if new.payment_status='confirmed' then
      new.payment_status:='refunded';
      update public.gateway_transactions set status='refunded',refunded_amount_cents=amount_cents,updated_at=now()
        where order_id=new.id and status='completed';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists orders_release_quick_resources_on_cancel on public.orders;
create trigger orders_release_quick_resources_on_cancel before update of status on public.orders
for each row when(new.service_model='quick_service') execute function private.release_quick_resources_on_cancel();

create or replace function public.get_restaurant_model_capabilities_v2(
  p_restaurant_id uuid, p_service_model public.noowe_service_model
) returns jsonb language plpgsql stable security definer
set search_path = public, private, pg_temp as $$
declare v_config public.restaurant_model_configs; v_policy public.restaurant_model_policies;
begin
  select * into v_config from public.restaurant_model_configs
    where restaurant_id = p_restaurant_id and p_service_model = any(service_models);
  select * into v_policy from public.restaurant_model_policies
    where restaurant_id = p_restaurant_id and service_model = p_service_model;
  if v_config.restaurant_id is null or v_policy.restaurant_id is null or not exists (
    select 1 from public.restaurants where id = p_restaurant_id and is_active
  ) then raise exception 'Service model is not enabled for this restaurant' using errcode = '22023'; end if;

  return jsonb_build_object(
    'contractVersion', 2,
    'enabledServiceModels', to_jsonb(v_config.service_models),
    'serviceModel', p_service_model,
    'capabilities', jsonb_build_object(
      'contractVersion', 2,
      'reservations', v_policy.reservation_enabled,
      'reservationRequired', v_policy.reservation_required,
      'virtualQueue', v_policy.queue_enabled,
      'queueIsPrimaryEntry', v_policy.queue_as_primary_entry,
      'orderWhileWaiting', v_policy.order_while_waiting,
      'tableSession', p_service_model <> 'quick_service',
      'tableCheckIn', v_policy.table_check_in_enabled,
      'tableQr', v_policy.table_qr_enabled,
      'counterQr', v_policy.counter_qr_enabled,
      'guestLink', v_policy.guest_link_enabled,
      'userInvite', v_policy.user_invite_enabled,
      'splitBill', cardinality(v_policy.split_modes) > 0,
      'splitModes', to_jsonb(v_policy.split_modes),
      'serviceFee', v_policy.service_fee_bps > 0,
      'staffCalls', cardinality(v_policy.staff_call_types) > 0,
      'staffCallTypes', to_jsonb(v_policy.staff_call_types),
      'familyMode', p_service_model = 'casual_dining' and v_config.family_mode_enabled,
      'parties', p_service_model = 'casual_dining',
      'comboBuilder', p_service_model = 'quick_service',
      'prepaidRequired', v_policy.prepaid_required,
      'pickupCode', p_service_model = 'quick_service',
      'pickupSlots', p_service_model = 'quick_service' and v_policy.pickup_capacity_per_slot is not null,
      'qualityCheck', p_service_model = 'quick_service',
      'loyaltyMode', v_policy.loyalty_mode,
      'consumptionUnit', case p_service_model when 'fine_dining' then 'table_with_guests'
        when 'casual_dining' then 'per_person' else 'individual_cart' end,
      'orderTracking', case p_service_model when 'fine_dining' then 'item_with_preparer'
        when 'casual_dining' then 'table_order' else 'pickup_steps' end
    ),
    'policies', jsonb_build_object(
      'serviceFeeBps', case when p_service_model <> 'quick_service' then v_policy.service_fee_bps else null end,
      'tipPresetsBps', to_jsonb(v_policy.tip_presets_bps),
      'queueCallToleranceMin', case when v_policy.queue_enabled then v_config.queue_call_tolerance_min else null end,
      'reservationNoShowMin', case when v_policy.reservation_enabled then v_config.reservation_no_show_min else null end,
      'guestLinkTtlMin', case when v_policy.guest_link_enabled then v_config.guest_link_ttl_min else null end,
      'userInviteTtlMin', case when v_policy.user_invite_enabled then v_config.user_invite_ttl_min else null end,
      'userSearchMinChars', case when v_policy.user_invite_enabled then v_config.user_search_min_chars else null end,
      'capacityRequestTtlMin', case when p_service_model <> 'quick_service' then v_config.capacity_request_ttl_min else null end,
      'requireGuestAccount', v_config.require_guest_account,
      'enforceTableCapacity', p_service_model <> 'quick_service' and v_config.enforce_table_capacity,
      'capacityOverrideRoles', case when p_service_model <> 'quick_service' then to_jsonb(v_config.capacity_override_roles) else '[]'::jsonb end,
      'splitFixedRemainder', case when p_service_model <> 'quick_service' then to_jsonb(v_config.split_fixed_remainder) else null end,
      'tipAllocation', case when p_service_model <> 'quick_service' then to_jsonb(v_config.tip_allocation) else null end,
      'comboDiscountBps', case when p_service_model = 'quick_service' then v_policy.combo_discount_bps else null end,
      'pickupCapacityPerSlot', case when p_service_model = 'quick_service' then v_policy.pickup_capacity_per_slot else null end,
      'pickupExpiryMin', case when p_service_model = 'quick_service' then v_policy.pickup_expiry_min else null end,
      'stampsPerReward', case when p_service_model = 'quick_service' then v_policy.stamps_per_reward else null end
    )
  );
end $$;
revoke all on function public.get_restaurant_model_capabilities_v2(uuid, public.noowe_service_model) from public;
grant execute on function public.get_restaurant_model_capabilities_v2(uuid, public.noowe_service_model) to anon, authenticated, service_role;

-- Compatibility entrypoint: all old consumers now receive the strict V2 shape.
create or replace function public.get_restaurant_model_capabilities(
  p_restaurant_id uuid, p_service_model public.noowe_service_model
) returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select public.get_restaurant_model_capabilities_v2(p_restaurant_id, p_service_model)
$$;

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

create or replace function public.customer_check_in(
  p_qr_data text, p_service_model public.noowe_service_model
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
  if v_reservation_id is null and v_waitlist_id is null then
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
revoke all on function public.customer_check_in(text,public.noowe_service_model) from public;
grant execute on function public.customer_check_in(text,public.noowe_service_model) to authenticated;

create or replace function public.customer_call_waiter(
  p_restaurant_id uuid,p_table_id uuid,p_message text default null,p_call_type text default 'help'
) returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_call public.service_calls; v_session public.table_sessions; v_policy public.restaurant_model_policies;
  v_type text:=lower(trim(p_call_type));
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
  select s.* into v_session from public.table_sessions s
    where s.restaurant_id=p_restaurant_id and s.table_id=p_table_id and s.status='active'
      and private.is_table_session_participant(s.id) order by s.started_at desc limit 1;
  if v_session.id is null then raise exception 'Active table session required' using errcode='P0001'; end if;
  select * into v_policy from public.restaurant_model_policies
    where restaurant_id=p_restaurant_id and service_model=v_session.service_model;
  if v_policy.restaurant_id is null or not(v_type=any(v_policy.staff_call_types)) then
    raise exception 'Tipo de chamada indisponível neste modelo' using errcode='23514';
  end if;
  select * into v_call from public.service_calls where restaurant_id=p_restaurant_id
    and table_id=p_table_id and user_id=auth.uid() and call_type=v_type
    and status in ('pending','acknowledged') order by created_at desc limit 1;
  if v_call.id is null then
    insert into public.service_calls(restaurant_id,table_id,user_id,call_type,status,message,called_at,created_at,updated_at)
    values(p_restaurant_id,p_table_id,auth.uid(),v_type,'pending',nullif(trim(p_message),''),now(),now(),now())
    returning * into v_call;
  end if;
  return to_jsonb(v_call);
end $$;

create or replace function public.customer_create_order_v2(
  p_restaurant_id uuid,
  p_service_model public.noowe_service_model,
  p_items jsonb,
  p_client_request_id uuid,
  p_table_session_id uuid default null,
  p_waitlist_entry_id uuid default null,
  p_pickup_slot_start timestamptz default null
) returns jsonb language plpgsql security definer
set search_path = public, private, pg_temp as $$
declare v_policy public.restaurant_model_policies; v_session public.table_sessions; v_result jsonb; v_existing public.orders;
  v_order_id uuid; v_capacity integer; v_expiry integer; v_code text; v_discount_cents bigint := 0;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_client_request_id is null then raise exception 'Idempotency key required' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || ':' || p_client_request_id::text,0));
  select * into v_existing from public.orders where customer_id=auth.uid() and client_request_id=p_client_request_id;
  if v_existing.id is not null then
    return jsonb_build_object('id',v_existing.id,'restaurant_id',v_existing.restaurant_id,
      'table_id',v_existing.table_id,'table_session_id',v_existing.table_session_id,
      'service_model',v_existing.service_model,'status',v_existing.status,
      'payment_status',v_existing.payment_status,'fulfillment_status',v_existing.fulfillment_status,
      'subtotal',v_existing.subtotal,'total_amount',v_existing.total_amount,
      'pickup_code',v_existing.pickup_code,'pickup_expires_at',v_existing.pickup_expires_at,
      'order_items',private.order_items_json(v_existing.id),'idempotentReplay',true);
  end if;
  select * into v_policy from public.restaurant_model_policies
    where restaurant_id = p_restaurant_id and service_model = p_service_model;
  if v_policy.restaurant_id is null then raise exception 'Modelo de serviço indisponível' using errcode = '22023'; end if;

  if p_service_model = 'quick_service' then
    if p_table_session_id is not null or p_waitlist_entry_id is not null then
      raise exception 'Quick Service não usa mesa ou fila' using errcode = '23514';
    end if;
    if p_pickup_slot_start is not null and v_policy.pickup_capacity_per_slot is not null then
      perform pg_advisory_xact_lock(hashtextextended(p_restaurant_id::text || ':' || p_pickup_slot_start::text, 0));
      select count(*) into v_capacity from public.pickup_slot_reservations
      where restaurant_id = p_restaurant_id and slot_start = p_pickup_slot_start and status = 'reserved';
      if v_capacity >= v_policy.pickup_capacity_per_slot then
        raise exception 'Horário de retirada esgotado' using errcode = 'P0004';
      end if;
    end if;
    v_result := public.place_order(p_restaurant_id, 'pickup', p_items, null, null, null, null);
  else
    if (p_table_session_id is null) = (p_waitlist_entry_id is null) then
      raise exception 'Pedido de salão exige exatamente uma origem: mesa ou fila' using errcode = '23514';
    end if;
    if p_table_session_id is not null then
      select * into v_session from public.table_sessions where id = p_table_session_id
        and restaurant_id = p_restaurant_id and status = 'active' for update;
      if v_session.id is null or not private.is_table_session_participant(v_session.id) then
        raise exception 'Sessão de mesa inválida' using errcode = 'P0001';
      end if;
      if v_session.service_model is distinct from p_service_model then
        raise exception 'Modelo da mesa incompatível' using errcode = '23514';
      end if;
    elsif not v_policy.order_while_waiting or not exists (
      select 1 from public.waitlist_entries where id = p_waitlist_entry_id
        and restaurant_id = p_restaurant_id and customer_id = auth.uid() and status::text in ('waiting','called','arrived')
    ) then raise exception 'Entrada de fila inválida para pedido' using errcode = 'P0001'; end if;
    v_result := public.place_order(p_restaurant_id, 'dine_in', p_items, v_session.table_id, null, null, null);
  end if;

  v_order_id := (v_result->>'id')::uuid;
  v_expiry := v_policy.pickup_expiry_min;
  if p_service_model = 'quick_service' then
    v_code := upper(substr(replace(v_order_id::text, '-', ''), 1, 6));
    -- A combo is represented by three server-priced lines carrying the same
    -- combo_group. The client identifies the grouping; it never supplies price.
    select coalesce(round(sum(mi.price * greatest(1,coalesce((item->>'quantity')::integer,1)))
      * v_policy.combo_discount_bps / 10000 * 100)::bigint,0)
    into v_discount_cents
    from jsonb_array_elements(p_items) item
    join public.menu_items mi on mi.id=(item->>'menu_item_id')::uuid and mi.restaurant_id=p_restaurant_id
    where nullif(item->>'combo_group','') is not null;
  end if;
  update public.orders set
    client_request_id = p_client_request_id,
    service_model = p_service_model,
    origin_type = case when p_service_model = 'quick_service' then 'counter'::public.noowe_order_origin
      when p_table_session_id is not null then 'table_session'::public.noowe_order_origin
      else 'waitlist'::public.noowe_order_origin end,
    table_session_id = p_table_session_id,
    waitlist_entry_id = p_waitlist_entry_id,
    payment_status = 'pending', fulfillment_status = 'received',
    subtotal_cents = round(coalesce(subtotal,0) * 100)::bigint,
    discount_cents = v_discount_cents,
    total_cents = greatest(0,round(coalesce(total_amount,0) * 100)::bigint-v_discount_cents),
    discount_amount = v_discount_cents::numeric/100,
    total_amount = greatest(0,coalesce(total_amount,0)-v_discount_cents::numeric/100),
    pickup_code = v_code,
    pickup_expires_at = case when v_code is not null then now() + make_interval(mins => v_expiry) end,
    pickup_slot_start = p_pickup_slot_start
  where id = v_order_id;
  if p_pickup_slot_start is not null then
    insert into public.pickup_slot_reservations(restaurant_id, order_id, slot_start, expires_at)
    values (p_restaurant_id, v_order_id, p_pickup_slot_start, now() + make_interval(mins => v_expiry));
  end if;
  return v_result || jsonb_build_object('service_model',p_service_model,'payment_status','pending',
    'discount_amount',v_discount_cents::numeric/100,
    'total_amount',greatest(0,coalesce((v_result->>'total_amount')::numeric,0)-v_discount_cents::numeric/100),
    'fulfillment_status','received','pickup_code',v_code,'pickup_expires_at',
    case when v_code is not null then now() + make_interval(mins => v_expiry) end);
end $$;
revoke all on function public.customer_create_order_v2(uuid,public.noowe_service_model,jsonb,uuid,uuid,uuid,timestamptz) from public;
grant execute on function public.customer_create_order_v2(uuid,public.noowe_service_model,jsonb,uuid,uuid,uuid,timestamptz) to authenticated;

create or replace function private.process_simulated_payment_event(
  p_transaction_id uuid, p_provider_event_id text, p_outcome public.noowe_payment_status
) returns jsonb language plpgsql security definer
set search_path = public, private, pg_temp as $$
declare v_tx public.gateway_transactions; v_order public.orders; v_status text;
begin
  select * into v_tx from public.gateway_transactions where id = p_transaction_id for update;
  if v_tx.id is null or v_tx.provider <> 'simulated' then raise exception 'Payment transaction not found' using errcode = 'P0002'; end if;
  insert into public.payment_provider_events(provider,provider_event_id,gateway_transaction_id,outcome)
    values ('simulated',p_provider_event_id,v_tx.id,p_outcome) on conflict do nothing;
  if not found then
    select * into v_order from public.orders where id = v_tx.order_id;
    return jsonb_build_object('transactionId',v_tx.id,'orderId',v_tx.order_id,
      'paymentStatus',v_order.payment_status,'idempotentReplay',true);
  end if;
  v_status := case p_outcome when 'confirmed' then 'completed' when 'failed' then 'failed'
    when 'refunded' then 'refunded' else 'pending' end;
  update public.gateway_transactions set status = v_status, updated_at = now() where id = v_tx.id;
  update public.orders set payment_status = p_outcome,
    status = case when p_outcome = 'confirmed' and service_model = 'quick_service'
      then 'confirmed'::public.orders_status_enum else status end,
    updated_at = now() where id = v_tx.order_id returning * into v_order;
  if p_outcome = 'failed' then
    update public.pickup_slot_reservations set status = 'released' where order_id = v_order.id and status = 'reserved';
  end if;
  return jsonb_build_object('transactionId',v_tx.id,'orderId',v_order.id,
    'paymentStatus',v_order.payment_status,'idempotentReplay',false);
end $$;
revoke all on function private.process_simulated_payment_event(uuid,text,public.noowe_payment_status) from public, anon, authenticated;

create or replace function public.customer_start_payment(
  p_order_id uuid, p_payment_method text, p_idempotency_key uuid
) returns jsonb language plpgsql security definer
set search_path = public, private, pg_temp as $$
declare v_order public.orders; v_tx public.gateway_transactions; v_result jsonb; v_key text;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_idempotency_key is null then raise exception 'Idempotency key required' using errcode = '22023'; end if;
  if p_payment_method not in ('pix','credit','credit_card','debit_card','apple','apple_pay','google','google_pay','tap','tap_to_pay','wallet') then
    raise exception 'Forma de pagamento inválida' using errcode = '22023';
  end if;
  v_key := 'order-payment:' || auth.uid() || ':' || p_idempotency_key;
  perform pg_advisory_xact_lock(hashtextextended(v_key,0));
  select * into v_tx from public.gateway_transactions where idempotency_key = v_key;
  if v_tx.id is not null then
    select * into v_order from public.orders where id = v_tx.order_id;
    return jsonb_build_object('transactionId',v_tx.id,'orderId',v_order.id,
      'paymentStatus',v_order.payment_status,'idempotentReplay',true);
  end if;
  select * into v_order from public.orders where id = p_order_id and customer_id = auth.uid() for update;
  if v_order.id is null then raise exception 'Pedido não encontrado' using errcode = 'P0002'; end if;
  if v_order.total_cents is null or v_order.total_cents < 0 then raise exception 'Total inválido' using errcode = '23514'; end if;
  insert into public.gateway_transactions(
    restaurant_id,order_id,customer_id,provider,payment_method,amount,amount_cents,
    refunded_amount_cents,status,idempotency_key,metadata,created_at,updated_at
  ) values (
    v_order.restaurant_id,v_order.id,auth.uid(),'simulated',p_payment_method,
    v_order.total_cents::numeric/100,v_order.total_cents,0,'pending',v_key,
    jsonb_build_object('service_model',v_order.service_model,'simulated',true),now(),now()
  ) returning * into v_tx;
  -- The simulated provider adapter is synchronous, but confirmation still
  -- enters through the same private, idempotent event boundary as a webhook.
  v_result := private.process_simulated_payment_event(v_tx.id,'simulated:' || v_tx.id,'confirmed');
  return v_result || jsonb_build_object('simulated',true);
end $$;
revoke all on function public.customer_start_payment(uuid,text,uuid) from public;
grant execute on function public.customer_start_payment(uuid,text,uuid) to authenticated;

create or replace function public.restaurant_update_order_item_status(p_item_id uuid, p_status text)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_item public.order_items; v_order public.orders; v_current text; v_next text := lower(trim(p_status));
  v_all_ready boolean; v_any_preparing boolean; v_all_cancelled boolean;
begin
  select oi.* into v_item from public.order_items oi
    where oi.id=p_item_id for update;
  if v_item.id is null then raise exception 'Item não encontrado' using errcode='P0002'; end if;
  select * into v_order from public.orders where id=v_item.order_id for update;
  perform private.require_restaurant_role(v_order.restaurant_id);
  if v_order.service_model='quick_service' and v_order.payment_status<>'confirmed' then
    raise exception 'Pagamento Quick ainda não confirmado' using errcode='23514';
  end if;
  v_current := case v_item.status::text when 'pending' then 'received' else v_item.status::text end;
  if not ((v_current='received' and v_next in ('preparing','cancelled'))
    or (v_current='preparing' and v_next in ('ready','cancelled'))
    or v_current=v_next) then raise exception 'Transição de item inválida: % -> %',v_current,v_next using errcode='23514'; end if;
  update public.order_items set status=(case when v_next='received' then 'pending' else v_next end)::public.order_items_status_enum,
    prepared_at=case when v_next='ready' then coalesce(prepared_at,now()) else prepared_at end, updated_at=now()
    where id=v_item.id;
  select bool_and(status::text in ('ready','delivered','cancelled')),
    bool_or(status::text='preparing'),bool_and(status::text='cancelled')
  into v_all_ready,v_any_preparing,v_all_cancelled from public.order_items where order_id=v_order.id;
  update public.orders set fulfillment_status=case
      when v_all_cancelled then 'cancelled'::public.noowe_fulfillment_status
      when v_all_ready and service_model='quick_service' then 'checking'::public.noowe_fulfillment_status
      when v_all_ready then 'ready'::public.noowe_fulfillment_status
      when v_any_preparing then 'preparing'::public.noowe_fulfillment_status
      else 'received'::public.noowe_fulfillment_status end,
    status=case when v_all_cancelled then 'cancelled'::public.orders_status_enum
      when v_all_ready and service_model='quick_service' then 'preparing'::public.orders_status_enum
      when v_all_ready then 'ready'::public.orders_status_enum
      when v_any_preparing then 'preparing'::public.orders_status_enum else status end,
    updated_at=now() where id=v_order.id;
  return jsonb_build_object('orderId',v_order.id,'itemId',v_item.id,'status',v_next);
end $$;
grant execute on function public.restaurant_update_order_item_status(uuid,text) to authenticated, service_role;

alter function public.restaurant_update_order_status(uuid,text,integer)
  rename to restaurant_update_order_status_legacy_v1;
revoke all on function public.restaurant_update_order_status_legacy_v1(uuid,text,integer) from public,anon,authenticated;

create function public.restaurant_update_order_status(
  p_order_id uuid,p_status text,p_estimated_time integer default null
) returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_order public.orders; v_next text:=lower(trim(p_status)); v_result jsonb;
begin
  select * into v_order from public.orders where id=p_order_id for update;
  if v_order.id is null then raise exception 'Order not found' using errcode='P0002'; end if;
  perform private.require_restaurant_role(v_order.restaurant_id);
  if v_order.service_model='quick_service' then
    if v_next in ('confirmed','preparing','ready','delivered','picked_up') and v_order.payment_status<>'confirmed' then
      raise exception 'Pagamento Quick ainda não confirmado' using errcode='23514'; end if;
    if v_next='ready' then raise exception 'Quick Service exige conferência antes de ficar pronto' using errcode='23514'; end if;
    if v_next in ('delivered','picked_up') then raise exception 'Use a confirmação de retirada com código' using errcode='23514'; end if;
  elsif v_next='ready' and exists(
    select 1 from public.order_items where order_id=v_order.id and status::text not in ('ready','delivered','cancelled')
  ) then raise exception 'O pedido só fica pronto quando todos os itens terminarem' using errcode='23514';
  end if;
  v_result:=public.restaurant_update_order_status_legacy_v1(p_order_id,p_status,p_estimated_time);
  update public.orders set fulfillment_status=case v_next
      when 'preparing' then 'preparing'::public.noowe_fulfillment_status
      when 'ready' then 'ready'::public.noowe_fulfillment_status
      when 'delivered' then 'delivered'::public.noowe_fulfillment_status
      when 'completed' then 'delivered'::public.noowe_fulfillment_status
      when 'cancelled' then 'cancelled'::public.noowe_fulfillment_status
      else fulfillment_status end
    where id=p_order_id;
  return v_result||jsonb_build_object('payment_status',v_order.payment_status,
    'fulfillment_status',(select fulfillment_status from public.orders where id=p_order_id));
end $$;
revoke all on function public.restaurant_update_order_status(uuid,text,integer) from public;
grant execute on function public.restaurant_update_order_status(uuid,text,integer) to authenticated,service_role;

create or replace function public.restaurant_complete_quality_check(
  p_order_id uuid, p_passed boolean, p_checklist jsonb, p_reason text default null
) returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_order public.orders;
begin
  select * into v_order from public.orders where id=p_order_id for update;
  if v_order.id is null then raise exception 'Pedido não encontrado' using errcode='P0002'; end if;
  perform private.require_restaurant_role(v_order.restaurant_id);
  if v_order.service_model<>'quick_service' or v_order.payment_status<>'confirmed'
    or v_order.fulfillment_status<>'checking' then raise exception 'Pedido não está aguardando conferência' using errcode='23514'; end if;
  if p_checklist is null or jsonb_typeof(p_checklist)<>'object' or p_checklist='{}'::jsonb then
    raise exception 'Checklist obrigatório' using errcode='22023'; end if;
  if not p_passed and nullif(trim(p_reason),'') is null then raise exception 'Motivo obrigatório' using errcode='22023'; end if;
  insert into public.quick_quality_checks(order_id,restaurant_id,status,checklist,reason,checked_by)
    values(v_order.id,v_order.restaurant_id,case when p_passed then 'passed' else 'failed' end,p_checklist,p_reason,auth.uid());
  update public.orders set fulfillment_status=case when p_passed then 'ready' else 'preparing' end,
    status=case when p_passed then 'ready'::public.orders_status_enum else 'preparing'::public.orders_status_enum end,
    actual_ready_at=case when p_passed then now() else actual_ready_at end, updated_at=now() where id=v_order.id;
  return jsonb_build_object('orderId',v_order.id,'fulfillmentStatus',case when p_passed then 'ready' else 'preparing' end);
end $$;
grant execute on function public.restaurant_complete_quality_check(uuid,boolean,jsonb,text) to authenticated, service_role;

create or replace function public.restaurant_confirm_pickup(p_order_id uuid, p_pickup_code text)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_order public.orders; v_card public.stamp_cards; v_required integer;
begin
  select * into v_order from public.orders where id=p_order_id for update;
  if v_order.id is null then raise exception 'Pedido não encontrado' using errcode='P0002'; end if;
  perform private.require_restaurant_role(v_order.restaurant_id);
  if v_order.service_model<>'quick_service' or v_order.fulfillment_status<>'ready'
    or v_order.pickup_code<>upper(trim(p_pickup_code)) or v_order.pickup_expires_at<now() then
    raise exception 'Código inválido, expirado ou pedido não está pronto' using errcode='23514'; end if;
  update public.orders set fulfillment_status='picked_up',status='delivered',completed_at=now(),updated_at=now() where id=v_order.id;
  update public.pickup_slot_reservations set status='fulfilled' where order_id=v_order.id and status='reserved';
  select stamps_per_reward into v_required from public.restaurant_model_policies
    where restaurant_id=v_order.restaurant_id and service_model='quick_service';
  if not exists(select 1 from public.quick_stamp_events where order_id=v_order.id) then
    select * into v_card from public.stamp_cards where restaurant_id=v_order.restaurant_id
      and user_id=v_order.customer_id and service_type='quick_service' order by created_at limit 1 for update;
    if v_card.id is null then
      insert into public.stamp_cards(restaurant_id,user_id,service_type,current_stamps,required_stamps,
        reward_description,completed_cycles,completed,created_at,updated_at)
      values(v_order.restaurant_id,v_order.customer_id,'quick_service',1,v_required,'Recompensa Quick Service',0,false,now(),now()) returning * into v_card;
    else
      update public.stamp_cards set current_stamps=current_stamps+1,
        completed=(current_stamps+1)>=required_stamps,
        completed_at=case when (current_stamps+1)>=required_stamps then now() else completed_at end,
        updated_at=now() where id=v_card.id returning * into v_card;
    end if;
    insert into public.quick_stamp_events(order_id,restaurant_id,customer_id,stamp_card_id)
      values(v_order.id,v_order.restaurant_id,v_order.customer_id,v_card.id);
  end if;
  return jsonb_build_object('orderId',v_order.id,'fulfillmentStatus','picked_up','stampAwarded',true);
end $$;
grant execute on function public.restaurant_confirm_pickup(uuid,text) to authenticated, service_role;

-- Canonical split plan. Existing allocation/receipt machinery remains the
-- settlement engine, now guarded by the model policy instead of UI literals.
create table if not exists public.bill_split_plans (
  id uuid primary key default gen_random_uuid(),
  table_session_id uuid not null references public.table_sessions(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete restrict,
  split_mode public.noowe_split_mode not null,
  base_cents bigint not null check(base_cents>0),
  fee_cents bigint not null check(fee_cents>=0),
  tip_cents bigint not null check(tip_cents>=0),
  item_ids uuid[],
  status text not null default 'committed' check(status in ('committed','paid','cancelled','superseded')),
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(created_by,idempotency_key)
);
alter table public.bill_split_plans enable row level security;
drop policy if exists bill_split_plans_own on public.bill_split_plans;
create policy bill_split_plans_own on public.bill_split_plans for select to authenticated
  using(created_by=auth.uid() or private.has_restaurant_role(restaurant_id));
revoke insert,update,delete on public.bill_split_plans from anon,authenticated;

create or replace function private.assert_split_mode_enabled(
  p_table_session_id uuid,p_mode public.noowe_split_mode
) returns public.restaurant_model_policies language plpgsql stable security definer
set search_path=public,private,pg_temp as $$
declare v_session public.table_sessions; v_policy public.restaurant_model_policies;
begin
  select * into v_session from public.table_sessions where id=p_table_session_id and status='active';
  if v_session.id is null or not private.is_table_session_participant(v_session.id) then
    raise exception 'Table session not accessible' using errcode='P0001'; end if;
  select * into v_policy from public.restaurant_model_policies
    where restaurant_id=v_session.restaurant_id and service_model=v_session.service_model;
  if v_policy.restaurant_id is null or not(p_mode=any(v_policy.split_modes)) then
    raise exception 'Modo de divisão não habilitado' using errcode='23514'; end if;
  return v_policy;
end $$;

create or replace function public.customer_split_preview(
  p_table_session_id uuid,p_split_mode public.noowe_split_mode,
  p_amount_cents bigint default null,p_item_ids uuid[] default null,p_tip_bps integer default 0
) returns jsonb language plpgsql stable security definer set search_path=public,private,pg_temp as $$
declare v_policy public.restaurant_model_policies; v_available bigint; v_base bigint; v_payers integer; v_fee bigint; v_tip bigint;
begin
  v_policy:=private.assert_split_mode_enabled(p_table_session_id,p_split_mode);
  if p_tip_bps<0 or p_tip_bps>10000 or not(p_tip_bps=any(v_policy.tip_presets_bps) or p_tip_bps=0) then
    raise exception 'Gorjeta não habilitada' using errcode='22023'; end if;
  select coalesce(sum(remaining_cents),0)::bigint into v_available from private.table_unpaid_items(p_table_session_id)
    where (p_split_mode<>'by_owner' or customer_id=auth.uid())
      and (p_split_mode<>'by_item' or item_id=any(coalesce(p_item_ids,array[]::uuid[])));
  if p_split_mode='equal' then
    select greatest(count(distinct customer_id),1) into v_payers
      from private.table_unpaid_items(p_table_session_id) where remaining_cents>0;
    v_base:=(v_available+v_payers-1)/v_payers;
  elsif p_split_mode='fixed_amount' then v_base:=p_amount_cents;
  else v_base:=v_available; end if;
  if p_split_mode='by_item' and (coalesce(cardinality(p_item_ids),0)=0 or v_available=0) then
    raise exception 'Selecione itens ainda não pagos' using errcode='22023'; end if;
  if v_base is null or v_base<=0 or v_base>v_available then
    raise exception 'Valor inválido ou conta já quitada' using errcode='22023'; end if;
  v_fee:=round(v_base*v_policy.service_fee_bps::numeric/10000)::bigint;
  v_tip:=round(v_base*p_tip_bps::numeric/10000)::bigint;
  return jsonb_build_object('tableSessionId',p_table_session_id,'splitMode',p_split_mode,
    'baseCents',v_base,'serviceFeeCents',v_fee,'tipCents',v_tip,
    'totalCents',v_base+v_fee+v_tip,'itemIds',coalesce(to_jsonb(p_item_ids),'[]'::jsonb));
end $$;
grant execute on function public.customer_split_preview(uuid,public.noowe_split_mode,bigint,uuid[],integer) to authenticated;

create or replace function public.customer_split_commit(
  p_table_session_id uuid,p_split_mode public.noowe_split_mode,p_idempotency_key uuid,
  p_amount_cents bigint default null,p_item_ids uuid[] default null,p_tip_bps integer default 0
) returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_preview jsonb; v_session public.table_sessions; v_plan public.bill_split_plans;
begin
  if p_idempotency_key is null then raise exception 'Idempotency key required' using errcode='22023'; end if;
  select * into v_plan from public.bill_split_plans where created_by=auth.uid() and idempotency_key=p_idempotency_key;
  if v_plan.id is not null then return to_jsonb(v_plan)||jsonb_build_object('idempotentReplay',true); end if;
  v_preview:=public.customer_split_preview(p_table_session_id,p_split_mode,p_amount_cents,p_item_ids,p_tip_bps);
  select * into v_session from public.table_sessions where id=p_table_session_id;
  insert into public.bill_split_plans(table_session_id,restaurant_id,created_by,split_mode,
    base_cents,fee_cents,tip_cents,item_ids,idempotency_key)
  values(p_table_session_id,v_session.restaurant_id,auth.uid(),p_split_mode,
    (v_preview->>'baseCents')::bigint,(v_preview->>'serviceFeeCents')::bigint,
    (v_preview->>'tipCents')::bigint,p_item_ids,p_idempotency_key) returning * into v_plan;
  return to_jsonb(v_plan)||jsonb_build_object('preview',v_preview,'idempotentReplay',false);
end $$;
grant execute on function public.customer_split_commit(uuid,public.noowe_split_mode,uuid,bigint,uuid[],integer) to authenticated;

-- Preserve the former settlement body behind the canonical policy guard.
alter function public.customer_pay_table_bill(uuid,numeric,text,numeric,text,uuid,uuid[])
  rename to customer_pay_table_bill_legacy_v1;
revoke all on function public.customer_pay_table_bill_legacy_v1(uuid,numeric,text,numeric,text,uuid,uuid[]) from public,anon,authenticated;

create function public.customer_pay_table_bill(
  p_table_session_id uuid,p_tip_percent numeric default 0,p_payment_method text default 'pix',
  p_base_amount numeric default null,p_split_mode text default 'mine',p_idempotency_key uuid default null,
  p_item_ids uuid[] default null
) returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_mode public.noowe_split_mode;
begin
  v_mode:=case p_split_mode when 'mine' then 'by_owner' when 'equal' then 'equal'
    when 'byItem' then 'by_item' when 'fixed' then 'fixed_amount' else null end;
  if v_mode is null then raise exception 'Modo de divisão inválido' using errcode='22023'; end if;
  perform private.assert_split_mode_enabled(p_table_session_id,v_mode);
  return public.customer_pay_table_bill_legacy_v1(p_table_session_id,p_tip_percent,p_payment_method,
    p_base_amount,p_split_mode,p_idempotency_key,p_item_ids);
end $$;
revoke all on function public.customer_pay_table_bill(uuid,numeric,text,numeric,text,uuid,uuid[]) from public;
grant execute on function public.customer_pay_table_bill(uuid,numeric,text,numeric,text,uuid,uuid[]) to authenticated;

create or replace function public.customer_pay_bill_share(
  p_split_plan_id uuid,p_payment_method text,p_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_plan public.bill_split_plans; v_result jsonb; v_legacy_mode text;
begin
  select * into v_plan from public.bill_split_plans where id=p_split_plan_id and created_by=auth.uid() for update;
  if v_plan.id is null then raise exception 'Plano de divisão não encontrado' using errcode='P0002'; end if;
  if v_plan.status='paid' then return jsonb_build_object('splitPlanId',v_plan.id,'status','paid','idempotentReplay',true); end if;
  v_legacy_mode:=case v_plan.split_mode when 'by_owner' then 'mine' when 'equal' then 'equal'
    when 'by_item' then 'byItem' else 'fixed' end;
  v_result:=public.customer_pay_table_bill(v_plan.table_session_id,
    case when v_plan.base_cents>0 then v_plan.tip_cents::numeric*100/v_plan.base_cents else 0 end,
    p_payment_method,v_plan.base_cents::numeric/100,v_legacy_mode,p_idempotency_key,v_plan.item_ids);
  update public.bill_split_plans set status='paid',updated_at=now() where id=v_plan.id;
  return v_result||jsonb_build_object('splitPlanId',v_plan.id,'status','paid');
end $$;
grant execute on function public.customer_pay_bill_share(uuid,text,uuid) to authenticated;

-- KDS safety net for legacy restaurant_get_orders consumers.
create or replace function private.quick_order_may_enter_production(p_order public.orders)
returns boolean language sql immutable set search_path=pg_catalog,public as $$
  select p_order.service_model is distinct from 'quick_service'::public.noowe_service_model
    or p_order.payment_status = 'confirmed'
$$;

create or replace function public.restaurant_get_kds_queue(
  p_restaurant_id uuid, p_station_id uuid default null
) returns jsonb language plpgsql stable security definer
set search_path = public, private, pg_temp as $$
declare result jsonb;
begin
  perform private.require_restaurant_role(p_restaurant_id,
    array['owner','manager','chef','cook','barman']::public.user_roles_role_enum[]);
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',oi.id,'order_id',o.id,'restaurant_id',o.restaurant_id,
    'service_model',o.service_model,'payment_status',o.payment_status,
    'fulfillment_status',o.fulfillment_status,'table_id',o.table_id,
    'table_number',t.table_number,'customer_name',p.full_name,
    'menu_item_id',oi.menu_item_id,'name',coalesce(mi.name,'Item'),
    'quantity',oi.quantity,'status',oi.status,'order_status',o.status,
    'station_id',coalesce(oi.station_id,mi.station_id),'course',coalesce(oi.course,mi.course),
    'special_instructions',oi.special_instructions,'customizations',oi.customizations,
    'fire_at',oi.fire_at,'expected_ready_at',oi.expected_ready_at,
    'created_at',oi.created_at,'order_created_at',o.created_at
  ) order by coalesce(oi.fire_at,o.created_at),oi.created_at),'[]'::jsonb) into result
  from public.order_items oi join public.orders o on o.id=oi.order_id
  left join public.menu_items mi on mi.id=oi.menu_item_id
  left join public.tables t on t.id=o.table_id left join public.profiles p on p.id=o.customer_id
  where o.restaurant_id=p_restaurant_id
    and o.status::text in ('confirmed','preparing','open_for_additions')
    and oi.status::text in ('pending','preparing')
    and private.quick_order_may_enter_production(o)
    and (p_station_id is null or coalesce(oi.station_id,mi.station_id)=p_station_id);
  return result;
end $$;

do $$
declare t text;
begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    foreach t in array array['quick_quality_checks','pickup_slot_reservations'] loop
      execute format('alter table public.%I replica identity full',t);
      if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
        execute format('alter publication supabase_realtime add table public.%I',t);
      end if;
    end loop;
  end if;
end $$;
