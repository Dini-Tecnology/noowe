-- Financial Reports RPCs
-- Covers: revenue summary, transactions list, top items, payment breakdown

create index if not exists idx_orders_restaurant_date_status
  on public.orders(restaurant_id, created_at, status);

create index if not exists idx_order_items_menu_item
  on public.order_items(menu_item_id);

-- ─── financial summary ────────────────────────────────────────────────────────
create or replace function public.restaurant_get_financial_summary(
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
  v_from timestamptz := coalesce(p_from, current_date::timestamptz);
  v_to   timestamptz := coalesce(p_to, (current_date + 1)::timestamptz);
  result jsonb;
begin
  perform private.require_restaurant_role(
    p_restaurant_id,
    array['owner','manager']::public.user_roles_role_enum[]
  );

  select jsonb_build_object(
    'period', jsonb_build_object('from', v_from, 'to', v_to),
    'total_revenue',       coalesce(sum(o.total_amount), 0),
    'total_orders',        count(*),
    'average_order_value', coalesce(avg(o.total_amount) filter (where o.total_amount > 0), 0),
    'total_tips',          coalesce(sum(o.tip_amount), 0),
    'total_discounts',     coalesce(sum(o.discount_amount), 0),
    'total_tax',           coalesce(sum(o.tax_amount), 0),
    'payment_methods', jsonb_build_object(
      'credit_card', coalesce(sum(o.total_amount) filter (where o.payment_method = 'credit_card'), 0),
      'debit_card',  coalesce(sum(o.total_amount) filter (where o.payment_method = 'debit_card'), 0),
      'cash',        coalesce(sum(o.total_amount) filter (where o.payment_method = 'cash'), 0),
      'pix',         coalesce(sum(o.total_amount) filter (where o.payment_method = 'pix'), 0),
      'wallet',      coalesce(sum(o.total_amount) filter (where o.payment_method = 'wallet'), 0),
      'other',       coalesce(sum(o.total_amount) filter (where o.payment_method not in ('credit_card','debit_card','cash','pix','wallet') or o.payment_method is null), 0)
    ),
    'revenue_by_type', jsonb_build_object(
      'dine_in',  coalesce(sum(o.total_amount) filter (where o.order_type = 'dine_in'), 0),
      'pickup',   coalesce(sum(o.total_amount) filter (where o.order_type = 'pickup'), 0),
      'delivery', coalesce(sum(o.total_amount) filter (where o.order_type = 'delivery'), 0)
    ),
    'top_selling_items', (
      select coalesce(jsonb_agg(
        jsonb_build_object('name', item_name, 'quantity', total_qty, 'revenue', total_rev)
        order by total_qty desc
      ), '[]'::jsonb)
      from (
        select
          coalesce(mi.name, 'Item') as item_name,
          sum(oi.quantity) as total_qty,
          sum(oi.total_price) as total_rev
        from public.order_items oi
        join public.orders o2 on o2.id = oi.order_id
        left join public.menu_items mi on mi.id = oi.menu_item_id
        where o2.restaurant_id = p_restaurant_id
          and o2.created_at >= v_from
          and o2.created_at <  v_to
          and o2.status::text in ('delivered','completed')
        group by mi.name
        order by total_qty desc
        limit 10
      ) t
    )
  )
  into result
  from public.orders o
  where o.restaurant_id = p_restaurant_id
    and o.created_at >= v_from
    and o.created_at <  v_to
    and o.status::text in ('delivered','completed');

  return result;
end;
$$;

-- ─── recent transactions list ─────────────────────────────────────────────────
create or replace function public.restaurant_get_transactions(
  p_restaurant_id uuid,
  p_from timestamptz default null,
  p_to   timestamptz default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_from timestamptz := coalesce(p_from, current_date::timestamptz);
  v_to   timestamptz := coalesce(p_to, (current_date + 1)::timestamptz);
  result jsonb;
begin
  perform private.require_restaurant_role(
    p_restaurant_id,
    array['owner','manager']::public.user_roles_role_enum[]
  );

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', o.id,
      'type', 'order',
      'amount', o.total_amount,
      'tip_amount', o.tip_amount,
      'payment_method', o.payment_method,
      'order_type', o.order_type,
      'table_number', t.table_number,
      'status', o.status,
      'customer_name', p.full_name,
      'created_at', o.created_at
    ) order by o.created_at desc
  ), '[]'::jsonb)
  into result
  from public.orders o
  left join public.tables t on t.id = o.table_id
  left join public.profiles p on p.id = o.customer_id
  where o.restaurant_id = p_restaurant_id
    and o.created_at >= v_from
    and o.created_at <  v_to
    and o.status::text in ('delivered','completed','cancelled')
  limit greatest(1, least(coalesce(p_limit, 50), 200));

  return result;
end;
$$;

-- ─── tips summary ─────────────────────────────────────────────────────────────
create or replace function public.restaurant_get_tips_summary(
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
  v_from timestamptz := coalesce(p_from, current_date::timestamptz);
  v_to   timestamptz := coalesce(p_to, (current_date + 1)::timestamptz);
  result jsonb;
begin
  perform private.require_restaurant_role(
    p_restaurant_id,
    array['owner','manager']::public.user_roles_role_enum[]
  );

  select jsonb_build_object(
    'total_tips', coalesce(sum(tp.amount), 0),
    'tip_count', count(*),
    'average_tip', coalesce(avg(tp.amount), 0),
    'tips', coalesce(jsonb_agg(
      jsonb_build_object(
        'id', tp.id,
        'amount', tp.amount,
        'tip_type', tp.tip_type,
        'status', tp.status,
        'order_id', tp.order_id,
        'staff_id', tp.staff_id,
        'created_at', tp.created_at
      ) order by tp.created_at desc
    ), '[]'::jsonb)
  )
  into result
  from public.tips tp
  where tp.restaurant_id = p_restaurant_id
    and tp.created_at >= v_from
    and tp.created_at <  v_to;

  return result;
end;
$$;

revoke all on function public.restaurant_get_financial_summary(uuid, timestamptz, timestamptz) from public;
revoke all on function public.restaurant_get_transactions(uuid, timestamptz, timestamptz, integer) from public;
revoke all on function public.restaurant_get_tips_summary(uuid, timestamptz, timestamptz) from public;

grant execute on function public.restaurant_get_financial_summary(uuid, timestamptz, timestamptz) to authenticated, service_role;
grant execute on function public.restaurant_get_transactions(uuid, timestamptz, timestamptz, integer) to authenticated, service_role;
grant execute on function public.restaurant_get_tips_summary(uuid, timestamptz, timestamptz) to authenticated, service_role;

alter table public.financial_transactions enable row level security;
alter table public.tips enable row level security;

drop policy if exists "financial_transactions_staff" on public.financial_transactions;
create policy "financial_transactions_staff" on public.financial_transactions
  for all using (
    private.has_restaurant_role(restaurant_id, array['owner','manager']::public.user_roles_role_enum[])
  );

drop policy if exists "tips_staff" on public.tips;
create policy "tips_staff" on public.tips
  for all using (
    private.has_restaurant_role(restaurant_id, array['owner','manager','waiter']::public.user_roles_role_enum[])
    or customer_id = auth.uid()
    or staff_id = auth.uid()
  );
