-- Cupom aplicado na comanda não muda o total do pedido: vendeu R$ 120 com R$ 18 de cupom, a receita somava R$ 120 (pendência 92).
-- Receita Bruta segue sendo o vendido, antes do desconto. O painel e o Financeiro passam a descontar o cupom do que foi pago.
create or replace function private.coupon_discounts_cents(p_restaurant_id uuid, p_from timestamptz, p_to timestamptz)
returns bigint language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(sum(b.coupon_discount_cents), 0)::bigint from public.bill_shares b
  where b.restaurant_id = p_restaurant_id and b.status = 'paid' and b.paid_at >= p_from and b.paid_at < p_to
$$;
revoke all on function private.coupon_discounts_cents(uuid, timestamptz, timestamptz) from public, anon, authenticated;

create or replace function private.revenue_cents(
  p_restaurant_id uuid, p_from timestamptz, p_to timestamptz
) returns bigint language sql stable as $$
  select
    coalesce((select sum(coalesce(o.total_cents, round(coalesce(o.total_amount, o.subtotal, 0) * 100)::bigint))
      from public.orders o
      where o.restaurant_id = p_restaurant_id
        and o.created_at >= p_from
        and o.created_at <  p_to
        and private.counts_as_revenue(o.status::text, o.payment_status::text)
        and not (o.payment_status::text is distinct from 'confirmed' and exists (
          select 1 from public.table_sessions s where s.id = o.table_session_id and s.status = 'active'))), 0)::bigint
    -- Comanda aberta: o consumo já pago, sem taxa nem gorjeta, e já sem o cupom.
    + coalesce((select sum(b.base_cents)
      from public.bill_shares b
      join public.table_sessions s on s.id = b.table_session_id
      where b.restaurant_id = p_restaurant_id
        and b.status = 'paid'
        and s.status = 'active'
        and b.paid_at >= p_from
        and b.paid_at <  p_to), 0)::bigint
    - private.coupon_discounts_cents(p_restaurant_id, p_from, p_to)
$$;

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
  v_from timestamptz := coalesce(p_from, private.restaurant_day_start());
  v_to   timestamptz := coalesce(p_to, (private.restaurant_day_start() + interval '1 day'));
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
    'total_discounts',     coalesce(sum(o.discount_amount), 0) + private.coupon_discounts_cents(p_restaurant_id, v_from, v_to) / 100.0,
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
          and private.counts_as_revenue(o2.status::text, o2.payment_status::text)
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
    and private.counts_as_revenue(o.status::text, o.payment_status::text);

  return result;
end;
$$;

create or replace function public.restaurant_get_financial_dashboard(
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
  v_from timestamptz := coalesce(p_from, private.restaurant_day_start());
  v_to   timestamptz := coalesce(p_to, (private.restaurant_day_start() + interval '1 day'));
  v_prev_from timestamptz := v_from - (v_to - v_from);
  result jsonb;
begin
  perform private.require_restaurant_role(
    p_restaurant_id,
    array['owner','manager']::public.user_roles_role_enum[]
  );

  select jsonb_build_object(
    'period', jsonb_build_object('from', v_from, 'to', v_to),
    'gross_revenue', coalesce(sum(o.total_amount), 0),
    'coupon_discounts', private.coupon_discounts_cents(p_restaurant_id, v_from, v_to) / 100.0,
    'orders_count', count(*),
    'average_ticket', coalesce(avg(o.total_amount) filter (where o.total_amount > 0), 0),
    'previous_gross_revenue', (
      select coalesce(sum(total_amount), 0)
      from public.orders
      where restaurant_id = p_restaurant_id
        and created_at >= v_prev_from
        and created_at < v_from
        and private.counts_as_revenue(status::text, payment_status::text)
    ),
    -- Cost of goods sold requires a per-item cost, which menu_items does not
    -- track yet — surface this honestly instead of fabricating a number,
    -- mirroring the existing ChefCostView "not available" messaging.
    'cost_of_goods_available', false,
    'revenue_composition', (
      select coalesce(jsonb_agg(
        jsonb_build_object('category', category_name, 'amount', total)
        order by total desc
      ), '[]'::jsonb)
      from (
        select
          coalesce(mc.name, 'Outros') as category_name,
          sum(oi.total_price) as total
        from public.order_items oi
        join public.orders o2 on o2.id = oi.order_id
        left join public.menu_items mi on mi.id = oi.menu_item_id
        left join public.menu_categories mc on mc.id = mi.category_id
        where o2.restaurant_id = p_restaurant_id
          and o2.created_at >= v_from
          and o2.created_at < v_to
          and private.counts_as_revenue(o2.status::text, o2.payment_status::text)
        group by mc.name
      ) c
    )
  )
  into result
  from public.orders o
  where o.restaurant_id = p_restaurant_id
    and o.created_at >= v_from
    and o.created_at < v_to
    and private.counts_as_revenue(o.status::text, o.payment_status::text);

  return result;
end;
$$;
