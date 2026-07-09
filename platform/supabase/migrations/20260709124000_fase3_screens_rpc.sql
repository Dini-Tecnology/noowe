-- Backend additions to connect the remaining mocked v2 screens (Loyalty, ServiceConfig/
-- CasualDining, Tips staff count, Reports extension) to real data.

-- ─── Loyalty stats (members + redemptions this month) ────────────────────────
create or replace function public.restaurant_get_loyalty_stats(
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
  perform private.require_restaurant_role(
    p_restaurant_id,
    array['owner', 'manager']::public.user_roles_role_enum[]
  );

  select jsonb_build_object(
    'active_members', count(*) filter (where is_active),
    'redemptions_this_month', coalesce(sum(
      coalesce(jsonb_array_length(rewards_claimed), 0)
    ) filter (where updated_at >= date_trunc('month', now())), 0)
  )
  into result
  from public.loyalty_programs
  where restaurant_id = p_restaurant_id;

  return result;
end;
$$;

revoke all on function public.restaurant_get_loyalty_stats(uuid) from public;
grant execute on function public.restaurant_get_loyalty_stats(uuid) to authenticated, service_role;

-- ─── Service configs (ServiceConfigScreen + CasualDiningScreen) ──────────────
alter table public.restaurant_service_configs enable row level security;

drop policy if exists "restaurant_service_configs_staff" on public.restaurant_service_configs;
create policy "restaurant_service_configs_staff" on public.restaurant_service_configs
  for all using (
    private.has_restaurant_role(restaurant_id, array['owner', 'manager']::public.user_roles_role_enum[])
  );

create or replace function public.restaurant_get_service_configs(
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

  select coalesce(jsonb_agg(to_jsonb(c) order by c.service_type), '[]'::jsonb)
  into result
  from public.restaurant_service_configs c
  where c.restaurant_id = p_restaurant_id;

  return result;
end;
$$;

revoke all on function public.restaurant_get_service_configs(uuid) from public;
grant execute on function public.restaurant_get_service_configs(uuid) to authenticated, service_role;

-- ─── Tips: staff currently on shift ───────────────────────────────────────────
create or replace function public.restaurant_get_active_shift_count(
  p_restaurant_id uuid
)
returns integer
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select count(*)::int
  from public.shifts
  where restaurant_id = p_restaurant_id
    and date::date = current_date
    and status = 'in_progress';
$$;

revoke all on function public.restaurant_get_active_shift_count(uuid) from public;
grant execute on function public.restaurant_get_active_shift_count(uuid) to authenticated, service_role;

-- ─── Reports: unique customers served + average service time ────────────────
create or replace function public.restaurant_get_reports(
  p_restaurant_id uuid,
  p_from timestamptz default null,
  p_to   timestamptz default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_from timestamptz := coalesce(p_from, date_trunc('month', current_date)::timestamptz);
  v_to   timestamptz := coalesce(p_to, (current_date + 1)::timestamptz);
  result jsonb;
begin
  perform private.require_restaurant_role(
    p_restaurant_id,
    array['owner', 'manager']::public.user_roles_role_enum[]
  );

  select jsonb_build_object(
    'period', jsonb_build_object('from', v_from, 'to', v_to),
    'orders', jsonb_build_object(
      'total', count(*),
      'completed', count(*) filter (where status::text in ('delivered', 'completed')),
      'cancelled', count(*) filter (where status::text = 'cancelled'),
      'completion_rate', round(
        100.0 * count(*) filter (where status::text in ('delivered', 'completed'))
          / nullif(count(*), 0), 1
      )
    ),
    'revenue', jsonb_build_object(
      'total', coalesce(sum(total_amount) filter (where status::text in ('delivered', 'completed')), 0),
      'average', coalesce(avg(total_amount) filter (where status::text in ('delivered', 'completed')), 0),
      'tips', coalesce(sum(tip_amount) filter (where status::text in ('delivered', 'completed')), 0)
    ),
    'customers', jsonb_build_object(
      'unique_served', count(distinct customer_id) filter (where status::text in ('delivered', 'completed'))
    ),
    'service_time', jsonb_build_object(
      'average_minutes', round(extract(epoch from avg(
        completed_at - created_at
      ) filter (where status::text in ('delivered', 'completed') and completed_at is not null)) / 60.0, 1)
    ),
    'by_day', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'date', day,
          'orders', cnt,
          'revenue', rev
        ) order by day
      ), '[]'::jsonb)
      from (
        select
          date_trunc('day', o2.created_at at time zone 'America/Sao_Paulo')::date as day,
          count(*) as cnt,
          coalesce(sum(o2.total_amount), 0) as rev
        from public.orders o2
        where o2.restaurant_id = p_restaurant_id
          and o2.created_at >= v_from
          and o2.created_at <  v_to
          and o2.status::text in ('delivered', 'completed')
        group by 1
      ) d
    ),
    'by_order_type', jsonb_build_object(
      'dine_in',  coalesce(sum(total_amount) filter (where order_type = 'dine_in'  and status::text in ('delivered', 'completed')), 0),
      'pickup',   coalesce(sum(total_amount) filter (where order_type = 'pickup'   and status::text in ('delivered', 'completed')), 0),
      'delivery', coalesce(sum(total_amount) filter (where order_type = 'delivery' and status::text in ('delivered', 'completed')), 0)
    )
  )
  into result
  from public.orders
  where restaurant_id = p_restaurant_id
    and created_at >= v_from
    and created_at <  v_to;

  return result;
end;
$$;
