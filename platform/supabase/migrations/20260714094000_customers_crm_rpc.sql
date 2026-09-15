-- CRM de Clientes: customer list + summary for the restaurant owner/manager view.
-- Reuses public.loyalty_programs, which already tracks total_visits/total_spent/
-- tier/last_visit per (user_id, restaurant_id) incrementally via
-- private.loyalty_award_points — no need to re-aggregate from orders.
create or replace function public.restaurant_get_customers(
  p_restaurant_id uuid,
  p_limit integer default 50
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

  select jsonb_build_object(
    'summary', jsonb_build_object(
      'total_customers', (
        select count(*) from public.loyalty_programs
        where restaurant_id = p_restaurant_id and is_active = true
      ),
      'new_last_30_days', (
        select count(*) from public.loyalty_programs
        where restaurant_id = p_restaurant_id and is_active = true
          and created_at >= now() - interval '30 days'
      ),
      'recurrence_rate', (
        select case when count(*) = 0 then 0
          else round(100.0 * count(*) filter (where total_visits > 1) / count(*), 0)
        end
        from public.loyalty_programs
        where restaurant_id = p_restaurant_id and is_active = true
      )
    ),
    'customers', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'user_id', lp.user_id,
          'full_name', p.full_name,
          'avatar_url', p.avatar_url,
          'tier', lp.tier,
          'total_visits', lp.total_visits,
          'total_spent', lp.total_spent,
          'last_visit', lp.last_visit
        ) order by lp.total_spent desc
      ), '[]'::jsonb)
      from public.loyalty_programs lp
      join public.profiles p on p.id = lp.user_id
      where lp.restaurant_id = p_restaurant_id
        and lp.is_active = true
      limit greatest(1, least(coalesce(p_limit, 50), 200))
    )
  )
  into result;

  return result;
end;
$$;

revoke all on function public.restaurant_get_customers(uuid, integer) from public;
grant execute on function public.restaurant_get_customers(uuid, integer) to authenticated, service_role;
