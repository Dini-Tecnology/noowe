-- Notifications RPCs
-- Covers: get user notifications, mark read, mark all read, create (internal)

-- ─── get notifications ────────────────────────────────────────────────────────
create or replace function public.get_my_notifications(
  p_unread_only boolean default false,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  result jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', n.id,
      'title', n.title,
      'message', n.message,
      'notification_type', n.notification_type,
      'related_id', n.related_id,
      'related_type', n.related_type,
      'is_read', n.is_read,
      'read_at', n.read_at,
      'metadata', n.metadata,
      'created_at', n.created_at
    ) order by n.created_at desc
  ), '[]'::jsonb)
  into result
  from public.notifications n
  where n.user_id = v_user_id
    and (not p_unread_only or n.is_read = false)
  limit greatest(1, least(coalesce(p_limit, 50), 200));

  return result;
end;
$$;

-- ─── mark notification read ───────────────────────────────────────────────────
create or replace function public.mark_notification_read(
  p_notification_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_updated record;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  update public.notifications
  set is_read = true, read_at = now()
  where id = p_notification_id and user_id = v_user_id
  returning * into v_updated;

  if v_updated.id is null then
    raise exception 'Notification not found' using errcode = 'P0002';
  end if;

  return to_jsonb(v_updated);
end;
$$;

-- ─── mark all read ────────────────────────────────────────────────────────────
create or replace function public.mark_all_notifications_read()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_count integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  update public.notifications
  set is_read = true, read_at = now()
  where user_id = v_user_id and is_read = false;

  get diagnostics v_count = row_count;
  return jsonb_build_object('updated', v_count);
end;
$$;

-- ─── internal: create notification for a user ─────────────────────────────────
create or replace function private.create_notification(
  p_user_id uuid,
  p_title text,
  p_message text,
  p_type text default 'system',
  p_related_id uuid default null,
  p_related_type text default null,
  p_metadata jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_id uuid;
begin
  insert into public.notifications(
    user_id, title, message, notification_type, related_id, related_type, metadata, is_read, created_at
  )
  values(
    p_user_id, p_title, p_message,
    p_type::public.notifications_notification_type_enum,
    p_related_id,
    case when p_related_type is not null then p_related_type::public.notifications_related_type_enum else null end,
    p_metadata, false, now()
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- ─── get unread count ──────────────────────────────────────────────────────────
create or replace function public.get_notification_unread_count()
returns integer
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_count integer;
begin
  if v_user_id is null then return 0; end if;

  select count(*) into v_count
  from public.notifications
  where user_id = v_user_id and is_read = false;

  return v_count;
end;
$$;

revoke all on function public.get_my_notifications(boolean, integer) from public;
revoke all on function public.mark_notification_read(uuid) from public;
revoke all on function public.mark_all_notifications_read() from public;
revoke all on function public.get_notification_unread_count() from public;
revoke all on function private.create_notification(uuid,text,text,text,uuid,text,jsonb) from public;

grant execute on function public.get_my_notifications(boolean, integer) to authenticated, service_role;
grant execute on function public.mark_notification_read(uuid) to authenticated, service_role;
grant execute on function public.mark_all_notifications_read() to authenticated, service_role;
grant execute on function public.get_notification_unread_count() to authenticated, service_role;
grant execute on function private.create_notification(uuid,text,text,text,uuid,text,jsonb) to service_role;

-- RLS for notifications (users see only their own)
alter table public.notifications enable row level security;

drop policy if exists "notifications_own" on public.notifications;
create policy "notifications_own" on public.notifications
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());
