-- Customer profile journeys: paginated notification feed, destructive clear,
-- stable reservation confirmation codes and reusable invite links.

alter table public.reservations
  add column if not exists confirmation_code text;

update public.reservations
set confirmation_code = 'BN-' || upper(substr(replace(id::text, '-', ''), 1, 6))
where confirmation_code is null;

alter table public.reservations
  alter column confirmation_code set default (
    'BN-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
  ),
  alter column confirmation_code set not null;

create unique index if not exists uq_reservations_confirmation_code
  on public.reservations(confirmation_code);

create index if not exists idx_notifications_user_created
  on public.notifications(user_id, created_at desc, id desc);

create or replace function public.customer_list_notifications(
  p_limit integer default 20,
  p_cursor timestamptz default null
) returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with page as (
    select n.*
    from public.notifications n
    where n.user_id = auth.uid()
      and (p_cursor is null or n.created_at < p_cursor)
    order by n.created_at desc, n.id desc
    limit greatest(1, least(coalesce(p_limit, 20), 50)) + 1
  ), visible as (
    select * from page
    order by created_at desc, id desc
    limit greatest(1, least(coalesce(p_limit, 20), 50))
  )
  select jsonb_build_object(
    'data', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', n.id,
        'title', n.title,
        'message', n.message,
        'notification_type', n.notification_type,
        'related_id', n.related_id,
        'related_type', n.related_type,
        'is_read', n.is_read,
        'read_at', n.read_at,
        'metadata', coalesce(n.metadata, '{}'::jsonb),
        'created_at', n.created_at
      ) order by n.created_at desc, n.id desc) from visible n
    ), '[]'::jsonb),
    'next_cursor', case
      when (select count(*) from page) > greatest(1, least(coalesce(p_limit, 20), 50))
      then (select created_at from visible order by created_at asc, id asc limit 1)
      else null
    end
  );
$$;

create or replace function public.clear_my_notifications()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_count integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  delete from public.notifications where user_id = auth.uid();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.customer_create_reservation_invite(p_reservation_id uuid)
returns text language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_token text;
begin
  if not exists(select 1 from public.reservations where id = p_reservation_id
    and customer_id = auth.uid() and status::text in ('pending','confirmed') and reservation_time > now())
  then raise exception 'Reservation cannot be shared' using errcode = 'P0001'; end if;

  select invite_token into v_token
  from public.reservation_guests
  where reservation_id = p_reservation_id
    and invite_method = 'link'
    and invite_token is not null
    and guest_user_id is null
  order by invited_at desc
  limit 1;

  if v_token is null then
    v_token := encode(gen_random_bytes(24), 'hex');
    insert into public.reservation_guests(
      reservation_id, status, is_host, invited_by, invite_method,
      invite_token, has_arrived, requires_host_approval
    ) values (
      p_reservation_id, 'pending', false, auth.uid()::text, 'link',
      v_token, false, false
    );
  end if;

  return 'https://noowebr.com/reservations/invite/' || v_token;
end $$;

-- Availability is locked and checked in the same transaction, so a successful
-- customer booking can be confirmed immediately.
create or replace function public.customer_create_reservation(
  p_restaurant_id uuid, p_reservation_time timestamptz, p_party_size integer,
  p_special_requests text default null
) returns public.reservations language plpgsql security definer
set search_path = public, private, pg_temp as $$
declare v_capacity integer; v_reserved integer; v_result public.reservations; v_restaurant_name text;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_party_size < 1 or p_party_size > 20 or p_reservation_time < now() + interval '30 minutes'
  then raise exception 'Invalid reservation request' using errcode = '22023'; end if;
  select r.name into v_restaurant_name
  from public.restaurants r
  where r.id = p_restaurant_id and r.is_active
    and r.service_type in ('fine_dining', 'casual_dining')
    and coalesce((r.service_config->'feature_overrides'->>'reservations')::boolean, true)
    and coalesce((r.settings->'customer_experience'->>'onlineReservations')::boolean, true)
    and coalesce((r.settings->'customer_experience'->>'journeyReservation')::boolean, true);
  if v_restaurant_name is null
  then raise exception 'Reservations are unavailable for this restaurant' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtext(p_restaurant_id::text || date_trunc('hour', p_reservation_time)::text));
  select coalesce(sum(seats), 0)::integer into v_capacity from public.tables where restaurant_id = p_restaurant_id;
  select coalesce(sum(party_size), 0)::integer into v_reserved from public.reservations
    where restaurant_id = p_restaurant_id and status::text in ('pending','confirmed')
      and reservation_time between p_reservation_time - interval '90 minutes' and p_reservation_time + interval '90 minutes';
  if v_capacity = 0 or v_reserved + p_party_size > v_capacity
  then raise exception 'No availability for this time' using errcode = 'P0001'; end if;
  insert into public.reservations(restaurant_id, customer_id, reservation_time, party_size, special_requests, status)
    values(p_restaurant_id, auth.uid(), p_reservation_time, p_party_size, nullif(trim(p_special_requests), ''), 'confirmed')
    returning * into v_result;

  perform private.create_notification(
    auth.uid(),
    'Reserva confirmada!',
    v_restaurant_name || ' · ' || to_char(p_reservation_time at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI') ||
      ' · ' || p_party_size || case when p_party_size = 1 then ' pessoa' else ' pessoas' end,
    'reservation_confirmed',
    v_result.id,
    'reservation',
    jsonb_build_object('confirmation_code', v_result.confirmation_code, 'restaurant_id', p_restaurant_id)
  );
  return v_result;
end $$;

revoke all on function public.customer_list_notifications(integer,timestamptz) from public;
revoke all on function public.clear_my_notifications() from public;
grant execute on function public.customer_list_notifications(integer,timestamptz) to authenticated;
grant execute on function public.clear_my_notifications() to authenticated;

-- Dispatch persisted notifications to the provider-aware Edge Function. The
-- secrets are intentionally kept in Vault; when they are not provisioned the
-- row is still stored and the trigger exits without breaking the transaction.
create extension if not exists pg_net with schema extensions;

create or replace function private.dispatch_customer_notification_push()
returns trigger
language plpgsql
security definer
set search_path = public, private, vault, net, pg_temp
as $$
declare v_project_url text; v_service_key text;
begin
  select decrypted_secret into v_project_url
  from vault.decrypted_secrets where name = 'project_url' limit 1;
  select decrypted_secret into v_service_key
  from vault.decrypted_secrets where name = 'service_role_key' limit 1;
  if v_project_url is null or v_service_key is null then return new; end if;

  perform net.http_post(
    url := rtrim(v_project_url, '/') || '/functions/v1/send-push-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_key
    ),
    body := jsonb_build_object('record', to_jsonb(new))
  );
  return new;
exception when others then
  raise warning 'Push dispatch failed for notification %: %', new.id, sqlerrm;
  return new;
end;
$$;

drop trigger if exists trg_dispatch_customer_notification_push on public.notifications;
create trigger trg_dispatch_customer_notification_push
after insert on public.notifications
for each row execute function private.dispatch_customer_notification_push();
