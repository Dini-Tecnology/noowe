-- gen_random_bytes() lives in the pgcrypto extension, installed in the
-- `extensions` schema (Supabase default), not `public`. These two invite-link
-- functions pin `search_path` to `public, pg_temp` only, so the call fails
-- with "function gen_random_bytes(integer) does not exist" every time —
-- confirmed in postgres_logs, and the reason "Compartilhar reserva" and the
-- table QR guest invite never produce a link on the client.

create or replace function public.customer_create_reservation_invite(p_reservation_id uuid)
returns text language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
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

create or replace function public.customer_create_table_invite(p_table_session_id uuid)
returns text language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare v_token text := encode(gen_random_bytes(24), 'hex');
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if not exists (
    select 1 from public.table_sessions s
    join public.table_session_participants p on p.table_session_id = s.id
    where s.id = p_table_session_id and p.user_id = auth.uid() and s.status = 'active'
  ) then raise exception 'Table session not accessible' using errcode = 'P0001'; end if;
  insert into public.table_session_invites(table_session_id, token, created_by)
    values (p_table_session_id, v_token, auth.uid());
  return 'https://noowebr.com/t/invite/' || v_token;
end $$;
