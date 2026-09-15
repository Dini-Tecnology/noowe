-- Service Calls / Waiter Calls RPCs
-- Covers: list calls, acknowledge, resolve, create call (from customer side)

create index if not exists idx_service_calls_restaurant_status
  on public.service_calls(restaurant_id, status, called_at desc);

-- ─── get service calls ────────────────────────────────────────────────────────
create or replace function public.restaurant_get_service_calls(
  p_restaurant_id uuid,
  p_status text[] default null,
  p_limit integer default 100
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $$
declare
  result jsonb;
begin
  perform private.require_restaurant_role(p_restaurant_id);

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', sc.id,
      'restaurant_id', sc.restaurant_id,
      'table_id', sc.table_id,
      'table_number', t.table_number,
      'user_id', sc.user_id,
      'call_type', sc.call_type,
      'status', sc.status,
      'message', sc.message,
      'called_at', sc.called_at,
      'acknowledged_at', sc.acknowledged_at,
      'acknowledged_by', sc.acknowledged_by,
      'resolved_at', sc.resolved_at,
      'resolved_by', sc.resolved_by,
      'created_at', sc.created_at,
      'caller', jsonb_build_object(
        'id', p.id,
        'full_name', p.full_name
      )
    ) order by sc.called_at desc
  ), '[]'::jsonb)
  into result
  from public.service_calls sc
  left join public.tables t on t.id = sc.table_id
  left join public.profiles p on p.id = sc.user_id
  where sc.restaurant_id = p_restaurant_id
    and (p_status is null or sc.status = any(p_status))
  limit greatest(1, least(coalesce(p_limit, 100), 200));

  return result;
end;
$$;

-- ─── acknowledge call ─────────────────────────────────────────────────────────
create or replace function public.restaurant_acknowledge_service_call(
  p_call_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile record;
  v_call record;
  v_updated record;
begin
  select * into v_call from public.service_calls where id = p_call_id;
  if v_call.id is null then
    raise exception 'Service call not found' using errcode = 'P0002';
  end if;

  perform private.require_restaurant_role(v_call.restaurant_id);

  select full_name into v_profile from public.profiles where id = v_user_id;

  update public.service_calls
  set
    status = 'acknowledged',
    acknowledged_at = now(),
    acknowledged_by = coalesce(v_profile.full_name, v_user_id::text),
    updated_at = now()
  where id = p_call_id and status = 'pending'
  returning * into v_updated;

  if v_updated.id is null then
    select * into v_updated from public.service_calls where id = p_call_id;
  end if;

  return to_jsonb(v_updated);
end;
$$;

-- ─── resolve call ─────────────────────────────────────────────────────────────
create or replace function public.restaurant_resolve_service_call(
  p_call_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile record;
  v_call record;
  v_updated record;
begin
  select * into v_call from public.service_calls where id = p_call_id;
  if v_call.id is null then
    raise exception 'Service call not found' using errcode = 'P0002';
  end if;

  perform private.require_restaurant_role(v_call.restaurant_id);

  select full_name into v_profile from public.profiles where id = v_user_id;

  update public.service_calls
  set
    status = 'resolved',
    resolved_at = now(),
    resolved_by = coalesce(v_profile.full_name, v_user_id::text),
    updated_at = now()
  where id = p_call_id and status in ('pending','acknowledged')
  returning * into v_updated;

  if v_updated.id is null then
    select * into v_updated from public.service_calls where id = p_call_id;
  end if;

  return to_jsonb(v_updated);
end;
$$;

-- ─── create call (customer / staff) ──────────────────────────────────────────
create or replace function public.create_service_call(
  p_restaurant_id uuid,
  p_table_id uuid default null,
  p_call_type text default 'waiter',
  p_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_call record;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_call_type not in ('waiter','manager','help','emergency') then
    raise exception 'Invalid call type: %', p_call_type using errcode = '22023';
  end if;

  insert into public.service_calls(
    restaurant_id, table_id, user_id, call_type, status, message,
    called_at, created_at, updated_at
  )
  values(
    p_restaurant_id, p_table_id, v_user_id, p_call_type, 'pending', p_message,
    now(), now(), now()
  )
  returning * into v_call;

  return to_jsonb(v_call);
end;
$$;

-- ─── call stats ───────────────────────────────────────────────────────────────
create or replace function public.restaurant_get_call_stats(
  p_restaurant_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $$
declare
  result jsonb;
begin
  perform private.require_restaurant_role(p_restaurant_id);

  select jsonb_build_object(
    'pending_count',        count(*) filter (where status = 'pending'),
    'acknowledged_count',   count(*) filter (where status = 'acknowledged'),
    'resolved_today_count', count(*) filter (where status = 'resolved' and resolved_at >= current_date::timestamptz),
    'avg_response_time_ms', avg(
      extract(epoch from (acknowledged_at - called_at)) * 1000
    ) filter (where acknowledged_at is not null)
  )
  into result
  from public.service_calls
  where restaurant_id = p_restaurant_id
    and created_at >= current_date::timestamptz;

  return result;
end;
$$;

revoke all on function public.restaurant_get_service_calls(uuid, text[], integer) from public;
revoke all on function public.restaurant_acknowledge_service_call(uuid) from public;
revoke all on function public.restaurant_resolve_service_call(uuid) from public;
revoke all on function public.create_service_call(uuid, uuid, text, text) from public;
revoke all on function public.restaurant_get_call_stats(uuid) from public;

grant execute on function public.restaurant_get_service_calls(uuid, text[], integer) to authenticated, service_role;
grant execute on function public.restaurant_acknowledge_service_call(uuid) to authenticated, service_role;
grant execute on function public.restaurant_resolve_service_call(uuid) to authenticated, service_role;
grant execute on function public.create_service_call(uuid, uuid, text, text) to authenticated, service_role;
grant execute on function public.restaurant_get_call_stats(uuid) to authenticated, service_role;

alter table public.service_calls enable row level security;

drop policy if exists "service_calls_staff_read" on public.service_calls;
create policy "service_calls_staff_read" on public.service_calls
  for select using (
    private.has_restaurant_role(restaurant_id, array['owner','manager','waiter','maitre','chef','barman']::public.user_roles_role_enum[])
    or user_id = auth.uid()
  );

drop policy if exists "service_calls_staff_update" on public.service_calls;
create policy "service_calls_staff_update" on public.service_calls
  for update using (
    private.has_restaurant_role(restaurant_id, array['owner','manager','waiter','maitre','chef','barman']::public.user_roles_role_enum[])
  );

drop policy if exists "service_calls_insert" on public.service_calls;
create policy "service_calls_insert" on public.service_calls
  for insert with check (auth.uid() is not null);

-- Add service_calls to realtime publication
alter publication supabase_realtime add table public.service_calls;
alter table public.service_calls replica identity full;
