-- QA 25/11/2026.
--  P2-3: Relatórios e Financeiro usam a mesma receita do painel principal (private.revenue_cents): com a comanda aberta,
--        entra o consumo já pago; ao encerrar, o pedido.
--  VM-06: a tela do caixa lista o dinheiro lançado antes da abertura, inclusive para o Gerente e antes de o caixa abrir.
--  EQ-07: shifts.date guarda o dia como 00:00 UTC. A data da escala é a data UTC desse valor, comparada com o dia local.
--  OP-04: comanda encerrada fecha as tarefas dela.

-- EQ-07: a data da escala, como dia de calendário.
create or replace function private.shift_day(p_date timestamptz)
returns date language sql immutable set search_path = pg_temp as $$ select (p_date at time zone 'UTC')::date $$;
revoke all on function private.shift_day(timestamptz) from public, anon;
grant execute on function private.shift_day(timestamptz) to authenticated, service_role;

create or replace function public.restaurant_get_shifts(p_restaurant_id uuid, p_from timestamptz default null, p_to timestamptz default null)
returns jsonb language plpgsql stable security definer set search_path = public, private, pg_temp as $$
declare
  v_from date := coalesce((p_from at time zone 'America/Sao_Paulo')::date, date_trunc('week', current_date)::date);
  v_to   date := coalesce((p_to at time zone 'America/Sao_Paulo')::date, (date_trunc('week', current_date) + interval '7 days')::date);
  result jsonb;
begin
  perform private.require_restaurant_role(p_restaurant_id, array['owner','manager']::public.user_roles_role_enum[]);
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id, 'staff_id', s.staff_id, 'staff_name', p.full_name, 'date', s.date, 'start_time', s.start_time,
      'end_time', s.end_time, 'role', s.role, 'area', s.area, 'station_id', s.station_id,
      'station_name', coalesce(c.display_name, c.name), 'status', s.status, 'notes', s.notes
    ) order by s.date asc, s.start_time asc), '[]'::jsonb)
  into result
  from public.shifts s
  join public.profiles p on p.id = s.staff_id
  left join public.cook_stations c on c.id = s.station_id
  where s.restaurant_id = p_restaurant_id
    and private.shift_day(s.date) >= v_from
    and private.shift_day(s.date) < v_to;
  return result;
end $$;

create or replace function public.restaurant_get_my_shifts(p_restaurant_id uuid, p_from timestamptz default null, p_to timestamptz default null)
returns jsonb language plpgsql stable security definer set search_path = public, private, pg_temp as $$
declare v_from date := coalesce((p_from at time zone 'America/Sao_Paulo')::date, (now() at time zone 'America/Sao_Paulo')::date);
  v_to date := coalesce((p_to at time zone 'America/Sao_Paulo')::date, v_from + 14);
begin
  perform private.require_restaurant_role(p_restaurant_id,
    array['owner','manager','chef','waiter','barman','maitre','cook','cashier','host']::public.user_roles_role_enum[]);
  return coalesce((select jsonb_agg(private.shift_json(s) order by s.date, s.start_time) from public.shifts s
    where s.restaurant_id = p_restaurant_id and s.staff_id = auth.uid() and private.shift_day(s.date) >= v_from
      and private.shift_day(s.date) < v_to and s.status not in ('cancelled', 'canceled')), '[]'::jsonb);
end $$;

create or replace function public.restaurant_get_day_team_shifts(p_restaurant_id uuid, p_area text)
returns jsonb language plpgsql stable security definer set search_path = public, private, pg_temp as $$
declare v_day date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if p_area = 'floor' then
    perform private.require_restaurant_role(p_restaurant_id, array['owner','manager','maitre']::public.user_roles_role_enum[]);
  elsif p_area = 'kitchen' then
    perform private.require_restaurant_role(p_restaurant_id, array['owner','manager','chef']::public.user_roles_role_enum[]);
  else
    raise exception 'Área inválida' using errcode = '22023';
  end if;
  return coalesce((select jsonb_agg(private.shift_json(s) order by s.start_time, s.staff_id) from public.shifts s
    where s.restaurant_id = p_restaurant_id and s.status not in ('cancelled', 'canceled') and private.shift_day(s.date) = v_day
      and case p_area when 'floor' then s.role in ('waiter', 'maitre', 'host') or (s.area is not null and s.station_id is null)
                      else s.role in ('chef', 'cook') or s.station_id is not null end), '[]'::jsonb);
end $$;

-- O dia fechado trava a escala do mesmo dia de calendário.
create or replace function private.shift_day_still_open()
returns trigger language plpgsql security definer set search_path = public, private, pg_temp as $$
begin
  if exists (select 1 from public.operational_days d where d.restaurant_id = new.restaurant_id and d.status = 'closed'
      and d.business_date in (private.shift_day(new.date), case when tg_op = 'UPDATE' then private.shift_day(old.date) end)) then
    raise exception 'Este dia já foi fechado: a escala dele não muda mais' using errcode = 'P0001';
  end if;
  return new;
end $$;

-- VM-06: o que entrou antes da abertura aparece na tela do caixa.
create or replace function public.restaurant_get_cash_register(p_restaurant_id uuid)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v public.cash_register_sessions; v_owner boolean; v_manage boolean; s public.restaurant_cash_settings; v_pending jsonb;
begin
  perform private.require_restaurant_role(p_restaurant_id, array['owner','manager','cashier','waiter']::public.user_roles_role_enum[]);
  v_owner := private.has_restaurant_role(p_restaurant_id, array['owner']::public.user_roles_role_enum[]);
  v_manage := v_owner or private.has_restaurant_role(p_restaurant_id, array['manager','cashier']::public.user_roles_role_enum[]);
  -- Ainda sem caixa aberto: o dinheiro do dia que espera a abertura.
  v_pending := case when v_manage then coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'type', o.type, 'amount', o.amount_cents::numeric / 100,
      'amount_cents', o.amount_cents, 'is_cash', true, 'description', coalesce(o.description || ' · ', '') || 'Lançado antes da abertura',
      'order_id', o.order_id, 'created_by', o.created_by, 'created_at', o.created_at, 'before_opening', true) order by o.created_at desc)
    from private.cash_outside_register o where o.restaurant_id = p_restaurant_id and o.movement_id is null
      and o.operational_day_id is not distinct from (private.operational_day_current(p_restaurant_id)).id), '[]'::jsonb) else '[]'::jsonb end;
  select * into v from public.cash_register_sessions where restaurant_id = p_restaurant_id and status = 'open' order by opened_at desc limit 1;
  if v.id is null then return jsonb_build_object('session', null, 'history', '[]'::jsonb, 'before_opening', v_pending); end if;
  -- Garçom só precisa saber se o caixa está aberto.
  if not v_manage then
    return jsonb_build_object('session', jsonb_build_object('id', v.id, 'status', v.status, 'opened_at', v.opened_at), 'history', '[]'::jsonb);
  end if;
  s := private.cash_settings(p_restaurant_id);
  return jsonb_build_object('session', jsonb_build_object('id', v.id, 'restaurant_id', v.restaurant_id,
      'opening_balance', v.opening_cents::numeric / 100, 'opening_cents', v.opening_cents,
      'expected_balance', case when v_owner then v.expected_cents::numeric / 100 end,
      'expected_cents', case when v_owner then v.expected_cents end,
      'status', v.status, 'opened_at', v.opened_at, 'opened_by', v.opened_by,
      'suggest_sangria', s.sangria_suggest_cents is not null and v.expected_cents >= s.sangria_suggest_cents,
      'movements', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'type', m.type, 'amount', m.amount_cents::numeric / 100, 'amount_cents', m.amount_cents,
          'is_cash', m.is_cash, 'description', m.description, 'order_id', m.order_id, 'created_by', m.created_by, 'created_at', m.created_at,
          'before_opening', m.before_opening) order by m.created_at desc)
        from public.cash_register_movements m where m.session_id = v.id and (v_owner or m.before_opening or m.type in ('sangria', 'reforco'))), '[]'::jsonb)),
    'history', '[]'::jsonb, 'before_opening', '[]'::jsonb);
end $$;

-- OP-04: a comanda encerrada leva junto as tarefas dela (abertura da mesa e pedidos).
create or replace function private.close_session_tasks()
returns trigger language plpgsql security definer set search_path = public, private, pg_temp as $$
begin
  update public.staff_tasks t set status = 'done', completed_at = clock_timestamp(), updated_at = clock_timestamp()
    where t.restaurant_id = new.restaurant_id and t.status = 'open'
      and (t.dedupe_key = 'table.opened:' || new.id
        or t.entity_id = new.id
        or t.order_id in (select o.id from public.orders o where o.table_session_id = new.id));
  return null;
end $$;
revoke all on function private.close_session_tasks() from public, anon, authenticated;
create trigger trg_close_session_tasks after update of status on public.table_sessions
  for each row when (old.status = 'active' and new.status <> 'active') execute function private.close_session_tasks();

-- P2-3: a receita das telas de Relatórios e Financeiro é a mesma do painel principal.
create or replace function public.restaurant_get_financial_summary(p_restaurant_id uuid, p_from timestamptz default null, p_to timestamptz default null)
returns jsonb language plpgsql stable security definer set search_path = public, private, pg_temp as $$
declare
  v_from timestamptz := coalesce(p_from, private.restaurant_day_start());
  v_to   timestamptz := coalesce(p_to, (private.restaurant_day_start() + interval '1 day'));
  result jsonb;
begin
  perform private.require_restaurant_role(p_restaurant_id, array['owner','manager']::public.user_roles_role_enum[]);
  select jsonb_build_object(
    'period', jsonb_build_object('from', v_from, 'to', v_to),
    'total_revenue',       private.revenue_cents(p_restaurant_id, v_from, v_to)::numeric / 100,
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
      select coalesce(jsonb_agg(jsonb_build_object('name', item_name, 'quantity', total_qty, 'revenue', total_rev) order by total_qty desc), '[]'::jsonb)
      from (
        select coalesce(mi.name, 'Item') as item_name, sum(oi.quantity) as total_qty, sum(oi.total_price) as total_rev
        from public.order_items oi
        join public.orders o2 on o2.id = oi.order_id
        left join public.menu_items mi on mi.id = oi.menu_item_id
        where o2.restaurant_id = p_restaurant_id and o2.created_at >= v_from and o2.created_at < v_to
          and private.counts_as_revenue(o2.status::text, o2.payment_status::text)
        group by mi.name order by total_qty desc limit 10
      ) t
    )
  )
  into result
  from public.orders o
  where o.restaurant_id = p_restaurant_id and o.created_at >= v_from and o.created_at < v_to
    and private.counts_as_revenue(o.status::text, o.payment_status::text);
  return result;
end $$;

create or replace function public.restaurant_get_financial_dashboard(p_restaurant_id uuid, p_from timestamptz default null, p_to timestamptz default null)
returns jsonb language plpgsql stable security definer set search_path = public, private, pg_temp as $$
declare
  v_from timestamptz := coalesce(p_from, private.restaurant_day_start());
  v_to   timestamptz := coalesce(p_to, (private.restaurant_day_start() + interval '1 day'));
  v_prev_from timestamptz := v_from - (v_to - v_from);
  result jsonb;
begin
  perform private.require_restaurant_role(p_restaurant_id, array['owner','manager']::public.user_roles_role_enum[]);
  select jsonb_build_object(
    'period', jsonb_build_object('from', v_from, 'to', v_to),
    'gross_revenue', private.revenue_cents(p_restaurant_id, v_from, v_to)::numeric / 100,
    'coupon_discounts', private.coupon_discounts_cents(p_restaurant_id, v_from, v_to) / 100.0,
    'orders_count', count(*),
    'average_ticket', coalesce(avg(o.total_amount) filter (where o.total_amount > 0), 0),
    'previous_gross_revenue', private.revenue_cents(p_restaurant_id, v_prev_from, v_from)::numeric / 100,
    -- Cost of goods sold requires a per-item cost, which menu_items does not track yet.
    'cost_of_goods_available', false,
    'revenue_composition', (
      select coalesce(jsonb_agg(jsonb_build_object('category', category_name, 'amount', total) order by total desc), '[]'::jsonb)
      from (
        select coalesce(mc.name, 'Outros') as category_name, sum(oi.total_price) as total
        from public.order_items oi
        join public.orders o2 on o2.id = oi.order_id
        left join public.menu_items mi on mi.id = oi.menu_item_id
        left join public.menu_categories mc on mc.id = mi.category_id
        where o2.restaurant_id = p_restaurant_id and o2.created_at >= v_from and o2.created_at < v_to
          and private.counts_as_revenue(o2.status::text, o2.payment_status::text)
        group by mc.name
      ) c
    )
  )
  into result
  from public.orders o
  where o.restaurant_id = p_restaurant_id and o.created_at >= v_from and o.created_at < v_to
    and private.counts_as_revenue(o.status::text, o.payment_status::text);
  return result;
end $$;

create or replace function public.restaurant_get_reports(p_restaurant_id uuid, p_from timestamptz default null, p_to timestamptz default null)
returns jsonb language plpgsql stable security definer set search_path = public, private, pg_temp as $$
declare
  v_from timestamptz := coalesce(p_from, private.restaurant_month_start());
  v_to   timestamptz := coalesce(p_to, (private.restaurant_day_start() + interval '1 day'));
  result jsonb;
begin
  perform private.require_restaurant_role(p_restaurant_id, array['owner', 'manager']::public.user_roles_role_enum[]);
  select jsonb_build_object(
    'period', jsonb_build_object('from', v_from, 'to', v_to),
    'orders', jsonb_build_object(
      'total', count(*),
      'completed', count(*) filter (where private.counts_as_revenue(status::text, payment_status::text)),
      'cancelled', count(*) filter (where status::text = 'cancelled'),
      'completion_rate', round(100.0 * count(*) filter (where private.counts_as_revenue(status::text, payment_status::text)) / nullif(count(*), 0), 1)
    ),
    'revenue', jsonb_build_object(
      'total', private.revenue_cents(p_restaurant_id, v_from, v_to)::numeric / 100,
      'average', coalesce(avg(total_amount) filter (where private.counts_as_revenue(status::text, payment_status::text)), 0),
      'tips', coalesce(sum(tip_amount) filter (where private.counts_as_revenue(status::text, payment_status::text)), 0)
    ),
    'customers', jsonb_build_object(
      'unique_served', count(distinct customer_id) filter (where private.counts_as_revenue(status::text, payment_status::text))
    ),
    'service_time', jsonb_build_object(
      'average_minutes', round(extract(epoch from avg(completed_at - created_at)
        filter (where private.counts_as_revenue(status::text, payment_status::text) and completed_at is not null)) / 60.0, 1)
    ),
    'by_day', (
      select coalesce(jsonb_agg(jsonb_build_object('date', day, 'orders', cnt, 'revenue', rev) order by day), '[]'::jsonb)
      from (
        select date_trunc('day', o2.created_at at time zone 'America/Sao_Paulo')::date as day, count(*) as cnt, coalesce(sum(o2.total_amount), 0) as rev
        from public.orders o2
        where o2.restaurant_id = p_restaurant_id and o2.created_at >= v_from and o2.created_at < v_to
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
  where restaurant_id = p_restaurant_id and created_at >= v_from and created_at < v_to;
  return result;
end $$;
