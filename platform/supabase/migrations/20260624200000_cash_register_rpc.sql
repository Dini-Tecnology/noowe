-- Cash Register RPCs
-- Covers: open session, add movement (sangria/reforco/sale), close session, history

create index if not exists idx_cash_register_sessions_restaurant_status
  on public.cash_register_sessions(restaurant_id, status);

create index if not exists idx_cash_register_movements_session
  on public.cash_register_movements(session_id, created_at desc);

-- ─── get current open session + movements ────────────────────────────────────
create or replace function public.restaurant_get_cash_register(
  p_restaurant_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_session record;
  v_movements jsonb;
begin
  perform private.require_restaurant_role(
    p_restaurant_id,
    array['owner','manager','waiter']::public.user_roles_role_enum[]
  );

  select s.*
  into v_session
  from public.cash_register_sessions s
  where s.restaurant_id = p_restaurant_id
    and s.status = 'open'
  order by s.opened_at desc
  limit 1;

  if v_session.id is null then
    return jsonb_build_object('session', null, 'history', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', m.id,
      'type', m.type,
      'amount', m.amount,
      'is_cash', m.is_cash,
      'description', m.description,
      'order_id', m.order_id,
      'created_by', m.created_by,
      'created_at', m.created_at
    ) order by m.created_at desc
  ), '[]'::jsonb)
  into v_movements
  from public.cash_register_movements m
  where m.session_id = v_session.id;

  return jsonb_build_object(
    'session', jsonb_build_object(
      'id', v_session.id,
      'restaurant_id', v_session.restaurant_id,
      'opening_balance', v_session.opening_balance,
      'expected_balance', v_session.expected_balance,
      'actual_balance', v_session.actual_balance,
      'difference', v_session.difference,
      'status', v_session.status,
      'opened_at', v_session.opened_at,
      'closed_at', v_session.closed_at,
      'opened_by', v_session.opened_by,
      'closed_by', v_session.closed_by,
      'closing_notes', v_session.closing_notes,
      'movements', v_movements
    ),
    'history', '[]'::jsonb
  );
end;
$$;

-- ─── get session history ──────────────────────────────────────────────────────
create or replace function public.restaurant_get_cash_register_history(
  p_restaurant_id uuid,
  p_limit integer default 20
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
  perform private.require_restaurant_role(
    p_restaurant_id,
    array['owner','manager']::public.user_roles_role_enum[]
  );

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', s.id,
      'opening_balance', s.opening_balance,
      'expected_balance', s.expected_balance,
      'actual_balance', s.actual_balance,
      'difference', s.difference,
      'status', s.status,
      'opened_at', s.opened_at,
      'closed_at', s.closed_at,
      'opened_by', s.opened_by,
      'closed_by', s.closed_by,
      'closing_notes', s.closing_notes
    ) order by s.opened_at desc
  ), '[]'::jsonb)
  into result
  from public.cash_register_sessions s
  where s.restaurant_id = p_restaurant_id
    and s.status = 'closed'
  limit greatest(1, least(coalesce(p_limit, 20), 100));

  return result;
end;
$$;

-- ─── open session ─────────────────────────────────────────────────────────────
create or replace function public.restaurant_open_cash_register(
  p_restaurant_id uuid,
  p_opening_balance numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile record;
  v_existing_id uuid;
  v_session record;
begin
  perform private.require_restaurant_role(
    p_restaurant_id,
    array['owner','manager','waiter']::public.user_roles_role_enum[]
  );

  select id into v_existing_id
  from public.cash_register_sessions
  where restaurant_id = p_restaurant_id and status = 'open'
  limit 1;

  if v_existing_id is not null then
    raise exception 'Cash register already open' using errcode = '23505';
  end if;

  select full_name into v_profile from public.profiles where id = v_user_id;

  insert into public.cash_register_sessions(
    restaurant_id, opened_by, opening_balance, expected_balance, status, opened_at
  )
  values(
    p_restaurant_id,
    coalesce(v_profile.full_name, v_user_id::text),
    p_opening_balance,
    p_opening_balance,
    'open',
    now()
  )
  returning * into v_session;

  return jsonb_build_object(
    'id', v_session.id,
    'restaurant_id', v_session.restaurant_id,
    'opening_balance', v_session.opening_balance,
    'expected_balance', v_session.expected_balance,
    'status', v_session.status,
    'opened_at', v_session.opened_at,
    'opened_by', v_session.opened_by,
    'movements', '[]'::jsonb
  );
end;
$$;

-- ─── add cash movement ────────────────────────────────────────────────────────
create or replace function public.restaurant_add_cash_movement(
  p_session_id uuid,
  p_type text,
  p_amount numeric,
  p_description text default null,
  p_is_cash boolean default true,
  p_order_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile record;
  v_session record;
  v_movement record;
  v_delta numeric;
begin
  select * into v_session
  from public.cash_register_sessions
  where id = p_session_id and status = 'open';

  if v_session.id is null then
    raise exception 'Cash register session not found or already closed' using errcode = 'P0002';
  end if;

  perform private.require_restaurant_role(
    v_session.restaurant_id,
    array['owner','manager','waiter']::public.user_roles_role_enum[]
  );

  if p_type not in ('sale','sangria','reforco','refund') then
    raise exception 'Invalid movement type: %', p_type using errcode = '22023';
  end if;

  select full_name into v_profile from public.profiles where id = v_user_id;

  insert into public.cash_register_movements(
    session_id, type, amount, is_cash, description, order_id, created_by, created_at
  )
  values(
    p_session_id, p_type, p_amount, p_is_cash, p_description, p_order_id,
    coalesce(v_profile.full_name, v_user_id::text), now()
  )
  returning * into v_movement;

  -- update expected_balance
  v_delta := case p_type
    when 'sale'    then  p_amount
    when 'reforco' then  p_amount
    when 'sangria' then -p_amount
    when 'refund'  then -p_amount
    else 0
  end;

  update public.cash_register_sessions
  set expected_balance = expected_balance + v_delta
  where id = p_session_id;

  return to_jsonb(v_movement);
end;
$$;

-- ─── close session ────────────────────────────────────────────────────────────
create or replace function public.restaurant_close_cash_register(
  p_session_id uuid,
  p_actual_balance numeric,
  p_closing_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile record;
  v_session record;
  v_updated record;
begin
  select * into v_session
  from public.cash_register_sessions
  where id = p_session_id and status = 'open';

  if v_session.id is null then
    raise exception 'Cash register session not found or already closed' using errcode = 'P0002';
  end if;

  perform private.require_restaurant_role(
    v_session.restaurant_id,
    array['owner','manager']::public.user_roles_role_enum[]
  );

  select full_name into v_profile from public.profiles where id = v_user_id;

  update public.cash_register_sessions
  set
    status = 'closed',
    actual_balance = p_actual_balance,
    difference = p_actual_balance - expected_balance,
    closed_at = now(),
    closed_by = coalesce(v_profile.full_name, v_user_id::text),
    closing_notes = p_closing_notes
  where id = p_session_id
  returning * into v_updated;

  return to_jsonb(v_updated);
end;
$$;

revoke all on function public.restaurant_get_cash_register(uuid) from public;
revoke all on function public.restaurant_get_cash_register_history(uuid, integer) from public;
revoke all on function public.restaurant_open_cash_register(uuid, numeric) from public;
revoke all on function public.restaurant_add_cash_movement(uuid, text, numeric, text, boolean, uuid) from public;
revoke all on function public.restaurant_close_cash_register(uuid, numeric, text) from public;

grant execute on function public.restaurant_get_cash_register(uuid) to authenticated, service_role;
grant execute on function public.restaurant_get_cash_register_history(uuid, integer) to authenticated, service_role;
grant execute on function public.restaurant_open_cash_register(uuid, numeric) to authenticated, service_role;
grant execute on function public.restaurant_add_cash_movement(uuid, text, numeric, text, boolean, uuid) to authenticated, service_role;
grant execute on function public.restaurant_close_cash_register(uuid, numeric, text) to authenticated, service_role;

alter table public.cash_register_sessions enable row level security;
alter table public.cash_register_movements enable row level security;

drop policy if exists "cash_register_sessions_staff" on public.cash_register_sessions;
create policy "cash_register_sessions_staff" on public.cash_register_sessions
  for all using (
    private.has_restaurant_role(restaurant_id, array['owner','manager','waiter']::public.user_roles_role_enum[])
  );

drop policy if exists "cash_register_movements_staff" on public.cash_register_movements;
create policy "cash_register_movements_staff" on public.cash_register_movements
  for all using (
    exists (
      select 1 from public.cash_register_sessions s
      where s.id = session_id
        and private.has_restaurant_role(s.restaurant_id, array['owner','manager','waiter']::public.user_roles_role_enum[])
    )
  );
