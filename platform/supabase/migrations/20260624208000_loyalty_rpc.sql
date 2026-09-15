-- Loyalty Program RPCs
-- Covers: get customer loyalty, add points on order, redeem, get config

-- ─── get loyalty config for restaurant ───────────────────────────────────────
create or replace function public.restaurant_get_loyalty_config(
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

  select to_jsonb(lc)
  into result
  from public.loyalty_configs lc
  where lc.restaurant_id = p_restaurant_id
  limit 1;

  return result;
end;
$$;

-- ─── get or create customer loyalty record ────────────────────────────────────
create or replace function public.get_my_loyalty(
  p_restaurant_id uuid
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

  select to_jsonb(lp)
  into result
  from public.loyalty_programs lp
  where lp.restaurant_id = p_restaurant_id
    and lp.user_id = v_user_id
    and lp.is_active = true
  limit 1;

  return result;
end;
$$;

-- ─── award points (called after order completion) ─────────────────────────────
create or replace function private.loyalty_award_points(
  p_user_id uuid,
  p_restaurant_id uuid,
  p_order_id uuid,
  p_amount_spent numeric
)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_config record;
  v_points_to_add numeric;
  v_order_id_str text := p_order_id::text;
begin
  -- get loyalty config
  select * into v_config
  from public.loyalty_configs
  where restaurant_id = p_restaurant_id
  limit 1;

  if v_config.id is null then return; end if;

  -- basic: 1 point per real spent (configurable)
  v_points_to_add := floor(p_amount_spent * coalesce(v_config.points_per_real, 1));

  if v_points_to_add <= 0 then return; end if;

  -- upsert loyalty record
  insert into public.loyalty_programs(
    user_id, restaurant_id, points, total_visits, total_spent, tier,
    last_visit, rewards_claimed, available_rewards, awarded_order_ids,
    is_active, created_at, updated_at
  )
  values(
    p_user_id, p_restaurant_id, v_points_to_add, 1, p_amount_spent, 'bronze',
    now(), '[]'::jsonb, '[]'::jsonb, v_order_id_str,
    true, now(), now()
  )
  on conflict (user_id, restaurant_id)
  do update set
    points         = public.loyalty_programs.points + v_points_to_add,
    total_visits   = public.loyalty_programs.total_visits + 1,
    total_spent    = public.loyalty_programs.total_spent + p_amount_spent,
    last_visit     = now(),
    awarded_order_ids = public.loyalty_programs.awarded_order_ids || (',' || v_order_id_str),
    tier = case
      when (public.loyalty_programs.total_spent + p_amount_spent) >= 5000 then 'platinum'
      when (public.loyalty_programs.total_spent + p_amount_spent) >= 2000 then 'gold'
      when (public.loyalty_programs.total_spent + p_amount_spent) >= 500  then 'silver'
      else 'bronze'
    end,
    updated_at = now();
end;
$$;

revoke all on function public.restaurant_get_loyalty_config(uuid) from public;
revoke all on function public.get_my_loyalty(uuid) from public;
revoke all on function private.loyalty_award_points(uuid, uuid, uuid, numeric) from public;

grant execute on function public.restaurant_get_loyalty_config(uuid) to authenticated, service_role;
grant execute on function public.get_my_loyalty(uuid) to authenticated, service_role;
grant execute on function private.loyalty_award_points(uuid, uuid, uuid, numeric) to service_role;

alter table public.loyalty_programs enable row level security;
alter table public.loyalty_configs enable row level security;

drop policy if exists "loyalty_programs_own" on public.loyalty_programs;
create policy "loyalty_programs_own" on public.loyalty_programs
  for select using (
    user_id = auth.uid()
    or private.has_restaurant_role(restaurant_id, array['owner','manager']::public.user_roles_role_enum[])
  );

drop policy if exists "loyalty_configs_staff" on public.loyalty_configs;
create policy "loyalty_configs_staff" on public.loyalty_configs
  for all using (
    private.has_restaurant_role(restaurant_id, array['owner','manager']::public.user_roles_role_enum[])
  );
