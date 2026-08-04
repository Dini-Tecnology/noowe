-- Customer app production backend: direct Supabase contracts, strict RLS and
-- operational completion without an in-app payment dependency.

alter table public.orders add column if not exists client_request_id uuid;
create unique index if not exists uq_orders_customer_request
  on public.orders(customer_id, client_request_id)
  where client_request_id is not null;

alter table public.favorites alter column created_at set default now();
alter table public.favorites alter column updated_at set default now();
create unique index if not exists uq_favorites_user_restaurant
  on public.favorites(user_id, restaurant_id);

alter table public.reviews alter column created_at set default now();
alter table public.reviews alter column updated_at set default now();
alter table public.reviews alter column deleted_at drop not null;
alter table public.reviews alter column is_verified set default false;
alter table public.reviews alter column is_visible set default true;
alter table public.reviews alter column helpful_count set default 0;

alter table public.reservation_guests alter column status set default 'pending';
alter table public.reservation_guests alter column is_host set default false;
alter table public.reservation_guests alter column invited_at set default now();
alter table public.reservation_guests alter column has_arrived set default false;
alter table public.reservation_guests alter column requires_host_approval set default false;
alter table public.reservation_guests alter column updated_at set default now();

alter table public.loyalty_programs alter column created_at set default now();
alter table public.loyalty_programs alter column updated_at set default now();
create unique index if not exists uq_loyalty_user_restaurant
  on public.loyalty_programs(user_id, restaurant_id);

-- Imported legacy tables had UUID columns without relationships. NOT VALID
-- preserves historical rows while enforcing every new client write.
alter table public.favorites add constraint favorites_user_id_fkey foreign key (user_id) references public.profiles(id) on delete cascade not valid;
alter table public.favorites add constraint favorites_restaurant_id_fkey foreign key (restaurant_id) references public.restaurants(id) on delete cascade not valid;
alter table public.reviews add constraint reviews_user_id_fkey foreign key (user_id) references public.profiles(id) on delete cascade not valid;
alter table public.reviews add constraint reviews_restaurant_id_fkey foreign key (restaurant_id) references public.restaurants(id) on delete cascade not valid;
alter table public.reviews add constraint reviews_order_id_fkey foreign key (order_id) references public.orders(id) on delete set null not valid;
alter table public.reservation_guests add constraint reservation_guests_reservation_id_fkey foreign key (reservation_id) references public.reservations(id) on delete cascade not valid;
alter table public.reservation_guests add constraint reservation_guests_guest_user_id_fkey foreign key (guest_user_id) references public.profiles(id) on delete set null not valid;
alter table public.loyalty_programs add constraint loyalty_programs_user_id_fkey foreign key (user_id) references public.profiles(id) on delete cascade not valid;
alter table public.loyalty_programs add constraint loyalty_programs_restaurant_id_fkey foreign key (restaurant_id) references public.restaurants(id) on delete cascade not valid;
alter table public.stamp_cards add constraint stamp_cards_user_id_fkey foreign key (user_id) references public.profiles(id) on delete cascade not valid;
alter table public.stamp_cards add constraint stamp_cards_restaurant_id_fkey foreign key (restaurant_id) references public.restaurants(id) on delete cascade not valid;
alter table public.table_sessions add constraint table_sessions_restaurant_id_fkey foreign key (restaurant_id) references public.restaurants(id) on delete cascade not valid;
alter table public.table_sessions add constraint table_sessions_table_id_fkey foreign key (table_id) references public.tables(id) on delete cascade not valid;
alter table public.table_sessions add constraint table_sessions_qr_code_id_fkey foreign key (qr_code_id) references public.table_qr_codes(id) on delete set null not valid;
alter table public.table_sessions add constraint table_sessions_customer_id_fkey foreign key (customer_id) references public.profiles(id) on delete set null not valid;

create table if not exists public.device_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  token text not null unique,
  platform text not null check (platform in ('ios', 'android')),
  device_info jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_device_push_tokens_user_active
  on public.device_push_tokens(user_id, is_active);

create table if not exists public.review_reports (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.reviews(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null,
  details text,
  created_at timestamptz not null default now(),
  unique(review_id, user_id)
);

create table if not exists public.promotion_redemptions (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references public.promotions(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  status text not null default 'reserved' check (status in ('reserved','applied','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_promotion_redemptions_user
  on public.promotion_redemptions(user_id, created_at desc);
create unique index if not exists uq_promotion_redemptions_active_user
  on public.promotion_redemptions(promotion_id, user_id)
  where status in ('reserved','applied');

alter table public.favorites enable row level security;
alter table public.reservation_guests enable row level security;
alter table public.reviews enable row level security;
alter table public.loyalty_programs enable row level security;
alter table public.stamp_cards enable row level security;
alter table public.table_sessions enable row level security;
alter table public.promotions enable row level security;
alter table public.device_push_tokens enable row level security;
alter table public.review_reports enable row level security;
alter table public.promotion_redemptions enable row level security;

grant select, insert, update, delete on public.favorites to authenticated;
grant select, insert, update, delete on public.reservation_guests to authenticated;
grant select on public.reviews to authenticated;
revoke insert, update, delete on public.reviews from authenticated;
grant select on public.loyalty_programs, public.stamp_cards, public.promotions to authenticated;
grant select, insert, update, delete on public.device_push_tokens to authenticated;
grant select, insert on public.review_reports to authenticated;
grant select on public.promotion_redemptions to authenticated;

drop policy if exists favorites_own on public.favorites;
create policy favorites_own on public.favorites for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists reservation_guests_host_or_guest on public.reservation_guests;
create policy reservation_guests_host_or_guest on public.reservation_guests
  for select to authenticated using (
    guest_user_id = auth.uid() or exists (
      select 1 from public.reservations r
      where r.id = reservation_id and r.customer_id = auth.uid()
    )
  );
drop policy if exists reservation_guests_host_write on public.reservation_guests;
create policy reservation_guests_host_write on public.reservation_guests
  for all to authenticated using (
    exists (select 1 from public.reservations r
      where r.id = reservation_id and r.customer_id = auth.uid())
  ) with check (
    exists (select 1 from public.reservations r
      where r.id = reservation_id and r.customer_id = auth.uid())
  );

drop policy if exists reviews_customer_insert on public.reviews;
create policy reviews_customer_insert on public.reviews for insert to authenticated
  with check (user_id = auth.uid() and exists (
    select 1 from public.orders o where o.id = order_id
      and o.customer_id = auth.uid() and o.restaurant_id = reviews.restaurant_id
      and o.status::text in ('delivered','completed')
  ));
drop policy if exists reviews_customer_update on public.reviews;
create policy reviews_customer_update on public.reviews for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists reviews_customer_delete on public.reviews;
create policy reviews_customer_delete on public.reviews for delete to authenticated
  using (user_id = auth.uid());

drop policy if exists loyalty_programs_own on public.loyalty_programs;
create policy loyalty_programs_own on public.loyalty_programs for select to authenticated
  using (user_id = auth.uid());
drop policy if exists stamp_cards_own on public.stamp_cards;
create policy stamp_cards_own on public.stamp_cards for select to authenticated
  using (user_id = auth.uid());
drop policy if exists table_sessions_customer on public.table_sessions;
create policy table_sessions_customer on public.table_sessions for select to authenticated
  using (customer_id = auth.uid() or primary_user_id = auth.uid());
drop policy if exists promotions_customer_active on public.promotions;
create policy promotions_customer_active on public.promotions for select to authenticated
  using (status = 'active' and valid_from <= now() and valid_until >= now());
drop policy if exists device_push_tokens_own on public.device_push_tokens;
create policy device_push_tokens_own on public.device_push_tokens for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists review_reports_own on public.review_reports;
create policy review_reports_own on public.review_reports for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists promotion_redemptions_own on public.promotion_redemptions;
create policy promotion_redemptions_own on public.promotion_redemptions for select to authenticated
  using (user_id = auth.uid());

-- Customers must use state-aware RPCs; staff transitions continue through the
-- existing restaurant_update_* RPCs.
drop policy if exists orders_update_customer on public.orders;
drop policy if exists reservations_update_customer on public.reservations;
revoke update on public.orders from authenticated;
revoke update on public.reservations from authenticated;

create or replace function public.customer_cancel_order(p_order_id uuid, p_reason text default null)
returns public.orders language plpgsql security definer
set search_path = public, private, pg_temp as $$
declare v_order public.orders;
begin
  update public.orders set status = 'cancelled', cancellation_reason = nullif(trim(p_reason), ''), updated_at = now()
  where id = p_order_id and customer_id = auth.uid() and status::text in ('pending','confirmed')
  returning * into v_order;
  if v_order.id is null then raise exception 'Order cannot be cancelled' using errcode = 'P0001'; end if;
  return v_order;
end $$;

create or replace function public.customer_cancel_reservation(p_reservation_id uuid, p_reason text default null)
returns public.reservations language plpgsql security definer
set search_path = public, private, pg_temp as $$
declare v_reservation public.reservations;
begin
  update public.reservations set status = 'cancelled', cancellation_reason = nullif(trim(p_reason), ''), updated_at = now()
  where id = p_reservation_id and customer_id = auth.uid()
    and status::text in ('pending','confirmed') and reservation_time > now()
  returning * into v_reservation;
  if v_reservation.id is null then raise exception 'Reservation cannot be cancelled' using errcode = 'P0001'; end if;
  return v_reservation;
end $$;

create or replace function public.customer_open_table_session(p_qr_data text)
returns jsonb language plpgsql security definer
set search_path = public, private, pg_temp as $$
declare v_qr public.table_qr_codes; v_table public.tables; v_session public.table_sessions;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select * into v_qr from public.table_qr_codes
    where qr_code_data = p_qr_data and is_active and (expires_at is null or expires_at > now())
      and signature = encode(sha256(qr_code_data::bytea), 'hex')
      and exists (select 1 from public.restaurants r where r.id = table_qr_codes.restaurant_id and r.is_active)
    order by created_at desc limit 1;
  if v_qr.id is null then raise exception 'Invalid or expired QR code' using errcode = '22023'; end if;
  select * into v_table from public.tables where id = v_qr.table_id and restaurant_id = v_qr.restaurant_id;
  select * into v_session from public.table_sessions
    where table_id = v_table.id and customer_id = auth.uid() and status = 'active'
    order by started_at desc limit 1;
  if v_session.id is null then
    insert into public.table_sessions(restaurant_id, table_id, qr_code_id, customer_id, primary_user_id,
      guest_user_ids, guest_count, status, started_at, last_activity, total_orders, total_spent, created_at, updated_at)
    values(v_table.restaurant_id, v_table.id, v_qr.id, auth.uid(), auth.uid(), '[]', 1, 'active', now(), now(), 0, 0, now(), now())
    returning * into v_session;
  end if;
  return jsonb_build_object('restaurantId', v_table.restaurant_id, 'tableId', v_table.id,
    'tableSessionId', v_session.id, 'tableNumber', v_table.table_number);
end $$;

create or replace function public.customer_place_order(
  p_restaurant_id uuid, p_table_session_id uuid, p_items jsonb, p_client_request_id uuid
) returns jsonb language plpgsql security definer
set search_path = public, private, pg_temp as $$
declare v_session public.table_sessions; v_existing public.orders; v_result jsonb; v_order_id uuid;
begin
  select * into v_existing from public.orders
    where customer_id = auth.uid() and client_request_id = p_client_request_id;
  if v_existing.id is not null then
    select jsonb_build_object('id', o.id, 'restaurant_id', o.restaurant_id, 'table_id', o.table_id,
      'status', o.status, 'subtotal', o.subtotal, 'total_amount', o.total_amount,
      'order_items', private.order_items_json(o.id)) into v_result from public.orders o where o.id = v_existing.id;
    return v_result;
  end if;
  select * into v_session from public.table_sessions where id = p_table_session_id
    and restaurant_id = p_restaurant_id and customer_id = auth.uid() and status = 'active';
  if v_session.id is null then raise exception 'Active table session required' using errcode = 'P0001'; end if;
  v_result := public.place_order(p_restaurant_id, 'dine_in', p_items, v_session.table_id, null, null, null);
  v_order_id := (v_result->>'id')::uuid;
  update public.orders set client_request_id = p_client_request_id,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('table_session_id', v_session.id)
    where id = v_order_id;
  update public.table_sessions set total_orders = total_orders + 1, last_activity = now(), updated_at = now()
    where id = v_session.id;
  return v_result;
end $$;

create or replace function public.customer_join_waitlist(
  p_restaurant_id uuid, p_party_size integer, p_preference text default 'qualquer', p_has_kids boolean default false
) returns public.waitlist_entries language plpgsql security definer
set search_path = public, private, pg_temp as $$
declare v_profile public.profiles; v_entry public.waitlist_entries; v_position integer;
begin
  if p_party_size < 1 or p_party_size > 20 then raise exception 'Invalid party size' using errcode = '22023'; end if;
  if exists(select 1 from public.waitlist_entries where customer_id = auth.uid() and restaurant_id = p_restaurant_id and status = 'waiting')
    then raise exception 'Already on waitlist' using errcode = '23505'; end if;
  select * into v_profile from public.profiles where id = auth.uid();
  select coalesce(max(position),0)+1 into v_position from public.waitlist_entries
    where restaurant_id = p_restaurant_id and status = 'waiting';
  insert into public.waitlist_entries(restaurant_id, customer_id, customer_name, customer_phone,
    party_size, preference, has_kids, status, position, created_at, updated_at)
  values(p_restaurant_id, auth.uid(), coalesce(v_profile.full_name,'Cliente'), v_profile.phone,
    p_party_size, p_preference::public.waitlist_entries_preference_enum, p_has_kids, 'waiting', v_position, now(), now())
  returning * into v_entry;
  return v_entry;
end $$;

create or replace function public.customer_update_waitlist(p_entry_id uuid, p_action text)
returns public.waitlist_entries language plpgsql security definer
set search_path = public, private, pg_temp as $$
declare v_entry public.waitlist_entries;
begin
  if p_action not in ('cancel','arrive') then raise exception 'Invalid action' using errcode = '22023'; end if;
  update public.waitlist_entries set
    status = case when p_action = 'cancel' then 'cancelled'::public.waitlist_entries_status_enum else status end,
    updated_at = now(),
    notes = case when p_action = 'arrive' then concat_ws(E'\n', notes, 'Chegada confirmada pelo cliente') else notes end
  where id = p_entry_id and customer_id = auth.uid() and status = 'waiting'
  returning * into v_entry;
  if v_entry.id is null then raise exception 'Waitlist entry cannot be updated' using errcode = 'P0001'; end if;
  return v_entry;
end $$;

create or replace function public.customer_register_push_token(
  p_token text, p_platform text, p_device_info jsonb default '{}'::jsonb
) returns uuid language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  insert into public.device_push_tokens(user_id, token, platform, device_info)
  values(auth.uid(), p_token, p_platform, coalesce(p_device_info,'{}'::jsonb))
  on conflict(token) do update set user_id = auth.uid(), platform = excluded.platform,
    device_info = excluded.device_info, is_active = true, last_seen_at = now(), updated_at = now()
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.customer_call_waiter(
  p_restaurant_id uuid, p_table_id uuid, p_message text default null
) returns jsonb language plpgsql security definer
set search_path = public, private, pg_temp as $$
declare v_call public.service_calls;
begin
  if not exists (
    select 1 from public.table_sessions s
    where s.restaurant_id = p_restaurant_id and s.table_id = p_table_id
      and (s.customer_id = auth.uid() or s.primary_user_id = auth.uid()) and s.status = 'active'
  ) then raise exception 'Active table session required' using errcode = 'P0001'; end if;
  select * into v_call from public.service_calls
    where restaurant_id = p_restaurant_id and table_id = p_table_id and user_id = auth.uid()
      and call_type = 'help' and status in ('pending','acknowledged')
    order by created_at desc limit 1;
  if v_call.id is null then
    insert into public.service_calls(restaurant_id, table_id, user_id, call_type, status, message,
      called_at, created_at, updated_at)
    values(p_restaurant_id, p_table_id, auth.uid(), 'help', 'pending', nullif(trim(p_message), ''),
      now(), now(), now()) returning * into v_call;
  end if;
  return to_jsonb(v_call);
end $$;

create or replace function public.customer_redeem_promotion(p_promotion_id uuid)
returns uuid language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_promotion public.promotions; v_id uuid;
begin
  select * into v_promotion from public.promotions where id = p_promotion_id for update;
  if v_promotion.id is null or v_promotion.status <> 'active'
    or v_promotion.valid_from > now() or v_promotion.valid_until < now()
    or (v_promotion.max_uses is not null and v_promotion.current_uses >= v_promotion.max_uses)
  then raise exception 'Promotion is not available' using errcode = 'P0001'; end if;
  insert into public.promotion_redemptions(promotion_id, user_id, status)
    values(p_promotion_id, auth.uid(), 'reserved') returning id into v_id;
  update public.promotions set current_uses = current_uses + 1, updated_at = now() where id = p_promotion_id;
  return v_id;
end $$;

create or replace function public.customer_create_reservation_invite(p_reservation_id uuid)
returns text language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_token text := encode(gen_random_bytes(24), 'hex');
begin
  if not exists(select 1 from public.reservations where id = p_reservation_id
    and customer_id = auth.uid() and status::text in ('pending','confirmed') and reservation_time > now())
  then raise exception 'Reservation cannot be shared' using errcode = 'P0001'; end if;
  insert into public.reservation_guests(reservation_id, status, is_host, invited_by, invite_method,
    invite_token, has_arrived, requires_host_approval)
  values(p_reservation_id, 'pending', false, auth.uid()::text, 'link', v_token, false, false);
  return 'https://noowebr.com/reservations/invite/' || v_token;
end $$;

create or replace function public.customer_create_review(
  p_order_id uuid, p_restaurant_id uuid, p_rating numeric, p_comment text default null
) returns public.reviews language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_review public.reviews;
begin
  if p_rating < 1 or p_rating > 5 then raise exception 'Rating must be between 1 and 5' using errcode = '22023'; end if;
  if not exists(select 1 from public.orders where id = p_order_id and customer_id = auth.uid()
    and restaurant_id = p_restaurant_id and status::text in ('delivered','completed'))
  then raise exception 'Only completed orders can be reviewed' using errcode = 'P0001'; end if;
  if exists(select 1 from public.reviews where order_id = p_order_id and user_id = auth.uid() and deleted_at is null)
  then raise exception 'Order already reviewed' using errcode = '23505'; end if;
  insert into public.reviews(user_id, restaurant_id, order_id, rating, comment)
    values(auth.uid(), p_restaurant_id, p_order_id, p_rating, nullif(trim(p_comment), '')) returning * into v_review;
  return v_review;
end $$;

create or replace function public.customer_update_review(p_review_id uuid, p_rating numeric, p_comment text default null)
returns public.reviews language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_review public.reviews;
begin
  if p_rating < 1 or p_rating > 5 then raise exception 'Rating must be between 1 and 5' using errcode = '22023'; end if;
  update public.reviews set rating = p_rating, comment = nullif(trim(p_comment), ''), updated_at = now()
    where id = p_review_id and user_id = auth.uid() and deleted_at is null returning * into v_review;
  if v_review.id is null then raise exception 'Review not found' using errcode = 'P0002'; end if;
  return v_review;
end $$;

create or replace function public.customer_delete_review(p_review_id uuid)
returns void language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  update public.reviews set deleted_at = now(), is_visible = false, updated_at = now()
    where id = p_review_id and user_id = auth.uid() and deleted_at is null;
  if not found then raise exception 'Review not found' using errcode = 'P0002'; end if;
end $$;

create or replace function public.customer_create_reservation(
  p_restaurant_id uuid, p_reservation_time timestamptz, p_party_size integer,
  p_special_requests text default null
) returns public.reservations language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_capacity integer; v_reserved integer; v_result public.reservations;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_party_size < 1 or p_party_size > 20 or p_reservation_time < now() + interval '30 minutes'
  then raise exception 'Invalid reservation request' using errcode = '22023'; end if;
  if not exists(select 1 from public.restaurants where id = p_restaurant_id and is_active and service_type = 'casual_dining')
  then raise exception 'Restaurant is unavailable' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtext(p_restaurant_id::text || date_trunc('hour', p_reservation_time)::text));
  select coalesce(sum(seats), 0)::integer into v_capacity from public.tables where restaurant_id = p_restaurant_id;
  select coalesce(sum(party_size), 0)::integer into v_reserved from public.reservations
    where restaurant_id = p_restaurant_id and status::text in ('pending','confirmed')
      and reservation_time between p_reservation_time - interval '90 minutes' and p_reservation_time + interval '90 minutes';
  if v_capacity = 0 or v_reserved + p_party_size > v_capacity
  then raise exception 'No availability for this time' using errcode = 'P0001'; end if;
  insert into public.reservations(restaurant_id, customer_id, reservation_time, party_size, special_requests, status)
    values(p_restaurant_id, auth.uid(), p_reservation_time, p_party_size, nullif(trim(p_special_requests), ''), 'pending')
    returning * into v_result;
  return v_result;
end $$;

create or replace function public.customer_accept_reservation_invite(p_token text)
returns uuid language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  update public.reservation_guests g set guest_user_id = auth.uid(), status = 'accepted',
    responded_at = now(), updated_at = now()
  where g.invite_token = p_token and g.status = 'pending' and exists (
    select 1 from public.reservations r where r.id = g.reservation_id
      and r.status::text in ('pending','confirmed') and r.reservation_time > now())
  returning g.reservation_id into v_id;
  if v_id is null then raise exception 'Invalid or expired invitation' using errcode = 'P0001'; end if;
  return v_id;
end $$;

create or replace function private.award_loyalty_on_operational_completion()
returns trigger language plpgsql security definer
set search_path = public, private, pg_temp as $$
begin
  if new.status::text in ('completed','delivered') and old.status::text not in ('completed','delivered') then
    perform private.loyalty_award_points(new.customer_id, new.restaurant_id, new.id, coalesce(new.total_amount,0));
  end if;
  return new;
end $$;
drop trigger if exists trg_award_loyalty_on_completion on public.orders;
create trigger trg_award_loyalty_on_completion after update of status on public.orders
  for each row execute function private.award_loyalty_on_operational_completion();

create or replace function private.notify_customer_state_change()
returns trigger language plpgsql security definer
set search_path = public, private, pg_temp as $$
declare v_title text; v_kind text; v_status text; v_customer uuid;
begin
  if tg_op <> 'UPDATE' or new.status::text = old.status::text then return new; end if;
  v_status := new.status::text;
  v_customer := new.customer_id;
  if tg_table_name = 'orders' then v_title := 'Atualização do pedido'; v_kind := 'order';
  elsif tg_table_name = 'reservations' then v_title := 'Atualização da reserva'; v_kind := 'reservation';
  else v_title := 'Atualização da fila'; v_kind := 'waitlist'; end if;
  if v_customer is not null then
    perform private.create_notification(v_customer, v_title, 'Novo status: ' || v_status,
      'system', new.id, case when v_kind = 'waitlist' then null else v_kind end,
      jsonb_build_object('screen', v_kind, 'id', new.id));
  end if;
  return new;
end $$;
drop trigger if exists trg_customer_order_notification on public.orders;
create trigger trg_customer_order_notification after update of status on public.orders
  for each row execute function private.notify_customer_state_change();
drop trigger if exists trg_customer_reservation_notification on public.reservations;
create trigger trg_customer_reservation_notification after update of status on public.reservations
  for each row execute function private.notify_customer_state_change();
drop trigger if exists trg_customer_waitlist_notification on public.waitlist_entries;
create trigger trg_customer_waitlist_notification after update of status on public.waitlist_entries
  for each row execute function private.notify_customer_state_change();

revoke all on function public.customer_cancel_order(uuid,text) from public;
revoke all on function public.customer_cancel_reservation(uuid,text) from public;
revoke all on function public.customer_open_table_session(text) from public;
revoke all on function public.customer_place_order(uuid,uuid,jsonb,uuid) from public;
revoke all on function public.customer_join_waitlist(uuid,integer,text,boolean) from public;
revoke all on function public.customer_update_waitlist(uuid,text) from public;
revoke all on function public.customer_register_push_token(text,text,jsonb) from public;
revoke all on function public.customer_call_waiter(uuid,uuid,text) from public;
revoke all on function public.customer_redeem_promotion(uuid) from public;
revoke all on function public.customer_create_reservation_invite(uuid) from public;
revoke all on function public.customer_create_review(uuid,uuid,numeric,text) from public;
revoke all on function public.customer_update_review(uuid,numeric,text) from public;
revoke all on function public.customer_delete_review(uuid) from public;
revoke all on function public.customer_create_reservation(uuid,timestamptz,integer,text) from public;
revoke all on function public.customer_accept_reservation_invite(text) from public;
grant execute on function public.customer_cancel_order(uuid,text) to authenticated;
grant execute on function public.customer_cancel_reservation(uuid,text) to authenticated;
grant execute on function public.customer_open_table_session(text) to authenticated;
grant execute on function public.customer_place_order(uuid,uuid,jsonb,uuid) to authenticated;
grant execute on function public.customer_join_waitlist(uuid,integer,text,boolean) to authenticated;
grant execute on function public.customer_update_waitlist(uuid,text) to authenticated;
grant execute on function public.customer_register_push_token(text,text,jsonb) to authenticated;
grant execute on function public.customer_call_waiter(uuid,uuid,text) to authenticated;
grant execute on function public.customer_redeem_promotion(uuid) to authenticated;
grant execute on function public.customer_create_reservation_invite(uuid) to authenticated;
grant execute on function public.customer_create_review(uuid,uuid,numeric,text) to authenticated;
grant execute on function public.customer_update_review(uuid,numeric,text) to authenticated;
grant execute on function public.customer_delete_review(uuid) to authenticated;
grant execute on function public.customer_create_reservation(uuid,timestamptz,integer,text) to authenticated;
grant execute on function public.customer_accept_reservation_invite(text) to authenticated;
