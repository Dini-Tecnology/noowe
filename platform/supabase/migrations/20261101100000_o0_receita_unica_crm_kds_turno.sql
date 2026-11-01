-- O0 — Correções imediatas (docs/fatias/O0-correcoes-e-hold.md)
--
-- Uma só fonte de receita para Painel, Relatórios e Financeiro, o dia do restaurante no
-- fuso do restaurante (não o do servidor), CRM alimentado por comandas pagas e reservas,
-- leitura do KDS para garçom e maître e turno do dia no fuso do restaurante.
--
-- As quatro RPCs de receita e `restaurant_get_staff` são cópias fiéis das definições
-- anteriores; mudam só o critério de receita e as janelas de data.

-- Fuso do restaurante: um ponto só. Ainda não há coluna por restaurante.
create or replace function private.restaurant_time_zone()
returns text language sql immutable as $$ select 'America/Sao_Paulo'::text $$;

create or replace function private.restaurant_day_start()
returns timestamptz language sql stable as $$
  select date_trunc('day', now() at time zone private.restaurant_time_zone())
         at time zone private.restaurant_time_zone()
$$;

create or replace function private.restaurant_month_start()
returns timestamptz language sql stable as $$
  select date_trunc('month', now() at time zone private.restaurant_time_zone())
         at time zone private.restaurant_time_zone()
$$;

-- Critério único de receita: pedido não cancelado que foi entregue/concluído ou cujo
-- pagamento foi confirmado (comanda paga por parcela e pedido Quick pré-pago contam).
create or replace function private.counts_as_revenue(p_status text, p_payment_status text)
returns boolean language sql immutable as $$
  select coalesce(p_status, '') <> 'cancelled'
     and coalesce(p_payment_status, '') <> 'refunded'
     and (coalesce(p_status, '') in ('delivered', 'completed')
          or coalesce(p_payment_status, '') = 'confirmed')
$$;

create or replace function private.revenue_cents(
  p_restaurant_id uuid, p_from timestamptz, p_to timestamptz
) returns bigint language sql stable as $$
  select coalesce(sum(coalesce(o.total_cents, round(coalesce(o.total_amount, o.subtotal, 0) * 100)::bigint)), 0)::bigint
  from public.orders o
  where o.restaurant_id = p_restaurant_id
    and o.created_at >= p_from
    and o.created_at <  p_to
    and private.counts_as_revenue(o.status::text, o.payment_status::text)
$$;

-- public.restaurant_get_dashboard_snapshot (de 20260624130000_restaurant_operations_rpc.sql)
create or replace function public.restaurant_get_dashboard_snapshot(
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
    'restaurant_id', p_restaurant_id,
    'generated_at', now(),
    'orders_today', (
      select count(*)
      from public.orders o
      where o.restaurant_id = p_restaurant_id
        and o.created_at >= private.restaurant_day_start()
        and o.created_at < (private.restaurant_day_start() + interval '1 day')
    ),
    'active_orders', (
      select count(*)
      from public.orders o
      where o.restaurant_id = p_restaurant_id
        and o.status::text in ('pending', 'confirmed', 'preparing', 'ready', 'open_for_additions')
    ),
    'revenue_today', (
      private.revenue_cents(p_restaurant_id, private.restaurant_day_start(),
        private.restaurant_day_start() + interval '1 day')::numeric / 100
    ),
    'tables', (
      select jsonb_build_object(
        'total', count(*),
        'occupied', count(*) filter (where status = 'occupied'),
        'available', count(*) filter (where status = 'available'),
        'reserved', count(*) filter (where status = 'reserved'),
        'cleaning', count(*) filter (where status = 'cleaning')
      )
      from public.tables t
      where t.restaurant_id = p_restaurant_id
    ),
    'open_calls', (
      select count(*)
      from public.waiter_calls wc
      where wc.restaurant_id = p_restaurant_id
        and wc.status in ('pending', 'acknowledged')
    ),
    'kds_queue', (
      select count(*)
      from public.order_items oi
      join public.orders o on o.id = oi.order_id
      where o.restaurant_id = p_restaurant_id
        and o.status::text in ('confirmed', 'preparing', 'open_for_additions')
        and oi.status::text in ('pending', 'preparing')
    )
  )
  into result;

  return result;
end;
$$;

-- public.restaurant_get_reports (de 20260709124000_fase3_screens_rpc.sql)
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
  v_from timestamptz := coalesce(p_from, private.restaurant_month_start());
  v_to   timestamptz := coalesce(p_to, (private.restaurant_day_start() + interval '1 day'));
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
      'completed', count(*) filter (where private.counts_as_revenue(status::text, payment_status::text)),
      'cancelled', count(*) filter (where status::text = 'cancelled'),
      'completion_rate', round(
        100.0 * count(*) filter (where private.counts_as_revenue(status::text, payment_status::text))
          / nullif(count(*), 0), 1
      )
    ),
    'revenue', jsonb_build_object(
      'total', coalesce(sum(total_amount) filter (where private.counts_as_revenue(status::text, payment_status::text)), 0),
      'average', coalesce(avg(total_amount) filter (where private.counts_as_revenue(status::text, payment_status::text)), 0),
      'tips', coalesce(sum(tip_amount) filter (where private.counts_as_revenue(status::text, payment_status::text)), 0)
    ),
    'customers', jsonb_build_object(
      'unique_served', count(distinct customer_id) filter (where private.counts_as_revenue(status::text, payment_status::text))
    ),
    'service_time', jsonb_build_object(
      'average_minutes', round(extract(epoch from avg(
        completed_at - created_at
      ) filter (where private.counts_as_revenue(status::text, payment_status::text) and completed_at is not null)) / 60.0, 1)
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
          and private.counts_as_revenue(o2.status::text, o2.payment_status::text)
        group by 1
      ) d
    ),
    'by_order_type', jsonb_build_object(
      'dine_in',  coalesce(sum(total_amount) filter (where order_type = 'dine_in'  and private.counts_as_revenue(status::text, payment_status::text)), 0),
      'pickup',   coalesce(sum(total_amount) filter (where order_type = 'pickup'   and private.counts_as_revenue(status::text, payment_status::text)), 0),
      'delivery', coalesce(sum(total_amount) filter (where order_type = 'delivery' and private.counts_as_revenue(status::text, payment_status::text)), 0)
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

-- public.restaurant_get_financial_summary (de 20260624201000_financial_reports_rpc.sql)
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

-- public.restaurant_get_financial_dashboard (de 20260714093000_financial_dashboard_and_bills.sql)
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

-- public.restaurant_get_staff (de 20260721193000_manager_approvals_and_staff_overview.sql)
create or replace function public.restaurant_get_staff(
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
    array['owner','manager']::public.user_roles_role_enum[]
  );

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'role_id', ur.id,
      'id', ur.id,
      'user_id', p.id,
      'full_name', p.full_name,
      'email', p.email,
      'phone', p.phone,
      'avatar_url', p.avatar_url,
      'role', ur.role,
      'is_active', ur.is_active,
      'shift', case when current_shift.id is null then null else jsonb_build_object(
        'id', current_shift.id,
        'start_time', current_shift.start_time,
        'end_time', current_shift.end_time,
        'status', current_shift.status
      ) end,
      'sales_value', coalesce(performance.sales_value, 0),
      'tips_value', coalesce(performance.tips_value, 0),
      'operational_status', case
        when not ur.is_active then 'inactive'
        when current_shift.status = 'in_progress' then 'on_shift'
        when current_shift.id is not null then 'scheduled'
        else 'active'
      end,
      'created_at', ur.created_at,
      'updated_at', ur.updated_at
    ) order by ur.is_active desc, ur.role, p.full_name
  ), '[]'::jsonb)
  into result
  from public.user_roles ur
  join public.profiles p on p.id = ur.user_id
  left join lateral (
    select s.id, s.start_time, s.end_time, s.status
    from public.shifts s
    where s.restaurant_id = p_restaurant_id
      and s.staff_id = ur.user_id
      and s.date >= (private.restaurant_day_start() at time zone private.restaurant_time_zone())::date
      and s.date < (private.restaurant_day_start() at time zone private.restaurant_time_zone())::date + 1
      and s.status not in ('cancelled', 'no_show')
    order by case when s.status = 'in_progress' then 0 else 1 end, s.start_time
    limit 1
  ) current_shift on true
  left join lateral (
    select
      (select coalesce(sum(o.total_amount), 0)
       from public.orders o
       where o.restaurant_id = p_restaurant_id
         and o.waiter_id = ur.user_id
         and o.created_at >= date_trunc('day', now())
         and o.created_at < date_trunc('day', now()) + interval '1 day'
         and private.counts_as_revenue(o.status::text, o.payment_status::text)) as sales_value,
      (select coalesce(sum(tp.amount), 0)
       from public.tips tp
       where tp.restaurant_id = p_restaurant_id
         and tp.staff_id = ur.user_id
         and tp.created_at >= date_trunc('day', now())
         and tp.created_at < date_trunc('day', now()) + interval '1 day'
         and tp.status not in ('cancelled', 'refunded')) as tips_value
  ) performance on true
  where ur.restaurant_id = p_restaurant_id;

  return result;
end;
$$;

-- ─── CRM: clientes que pagaram comanda/pedido ou reservaram ────────────────────
-- Antes lia só `loyalty_programs`, que só enchia com restaurante com programa de pontos.
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

  with paid as (
    select o.customer_id as user_id,
           count(*) as visits,
           sum(coalesce(o.total_cents, round(coalesce(o.total_amount, 0) * 100)::bigint)) as spent_cents,
           min(o.created_at) as first_at,
           max(o.created_at) as last_at
    from public.orders o
    where o.restaurant_id = p_restaurant_id
      and o.customer_id is not null
      and private.counts_as_revenue(o.status::text, o.payment_status::text)
    group by o.customer_id
  ), booked as (
    select r.customer_id as user_id,
           count(*) as visits,
           min(r.reservation_time) as first_at,
           max(r.reservation_time) as last_at
    from public.reservations r
    where r.restaurant_id = p_restaurant_id
      and r.customer_id is not null
      and r.status::text in ('seated', 'completed', 'confirmed')
    group by r.customer_id
  ), people as (
    select user_id from paid
    union select user_id from booked
    union select lp.user_id from public.loyalty_programs lp
      where lp.restaurant_id = p_restaurant_id and lp.is_active = true
  ), merged as (
    select pe.user_id,
           coalesce(pd.visits, 0) + coalesce(bk.visits, 0) as total_visits,
           coalesce(pd.spent_cents, 0) as spent_cents,
           least(pd.first_at, bk.first_at, lp.created_at) as first_seen,
           greatest(pd.last_at, bk.last_at, lp.last_visit) as last_visit,
           coalesce(lp.tier::text, 'bronze') as tier
    from people pe
    left join paid pd on pd.user_id = pe.user_id
    left join booked bk on bk.user_id = pe.user_id
    left join public.loyalty_programs lp
      on lp.user_id = pe.user_id and lp.restaurant_id = p_restaurant_id and lp.is_active = true
  )
  select jsonb_build_object(
    'summary', jsonb_build_object(
      'total_customers', (select count(*) from merged),
      'new_last_30_days', (select count(*) from merged where first_seen >= now() - interval '30 days'),
      'recurrence_rate', (
        select case when count(*) = 0 then 0
          else round(100.0 * count(*) filter (where total_visits > 1) / count(*), 0) end
        from merged
      )
    ),
    'customers', (
      select coalesce(jsonb_agg(row order by spent desc), '[]'::jsonb)
      from (
        select m.spent_cents as spent,
               jsonb_build_object(
                 'user_id', m.user_id,
                 'full_name', p.full_name,
                 'avatar_url', p.avatar_url,
                 'tier', m.tier,
                 'total_visits', m.total_visits,
                 'total_spent', m.spent_cents::numeric / 100,
                 'last_visit', m.last_visit
               ) as row
        from merged m
        join public.profiles p on p.id = m.user_id
        order by m.spent_cents desc
        limit greatest(1, least(coalesce(p_limit, 50), 200))
      ) top
    )
  )
  into result;

  return result;
end;
$$;

-- ─── KDS: garçom e maître leem; itens prontos aparecem até serem entregues ───────
-- O garçom precisa ver "pronto" para retirar no passe. O pedido vira `ready` quando todos os
-- itens estão prontos, então o filtro por status do pedido escondia justo esses itens.
create or replace function public.restaurant_get_kds_queue(
  p_restaurant_id uuid, p_station_id uuid default null
) returns jsonb language plpgsql stable security definer
set search_path = public, private, pg_temp as $$
declare result jsonb;
begin
  perform private.require_restaurant_role(p_restaurant_id,
    array['owner','manager','chef','cook','barman','waiter','maitre']::public.user_roles_role_enum[]);
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',oi.id,'order_id',o.id,'restaurant_id',o.restaurant_id,
    'service_model',o.service_model,'payment_status',o.payment_status,
    'fulfillment_status',o.fulfillment_status,'table_id',o.table_id,
    'table_number',t.table_number,'customer_name',p.full_name,
    'menu_item_id',oi.menu_item_id,'name',coalesce(mi.name,'Item'),
    'quantity',oi.quantity,'status',oi.status,'order_status',o.status,
    'station_id',coalesce(oi.station_id,mi.station_id),'course',coalesce(oi.course,mi.course),
    'special_instructions',oi.special_instructions,'customizations',oi.customizations,
    'fire_at',oi.fire_at,'expected_ready_at',oi.expected_ready_at,
    'created_at',oi.created_at,'order_created_at',o.created_at
  ) order by coalesce(oi.fire_at,o.created_at),oi.created_at),'[]'::jsonb) into result
  from public.order_items oi join public.orders o on o.id=oi.order_id
  left join public.menu_items mi on mi.id=oi.menu_item_id
  left join public.tables t on t.id=o.table_id left join public.profiles p on p.id=o.customer_id
  where o.restaurant_id=p_restaurant_id
    and o.status::text in ('confirmed','preparing','ready','open_for_additions')
    and oi.status::text in ('pending','preparing','ready')
    and private.quick_order_may_enter_production(o)
    and (p_station_id is null or coalesce(oi.station_id,mi.station_id)=p_station_id);
  return result;
end $$;
