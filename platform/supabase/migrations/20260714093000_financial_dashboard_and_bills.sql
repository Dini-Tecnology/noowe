-- Contas a Pagar (accounts payable) — the app already has `public.bills`
-- (description/supplier/category/amount/due_date/status) plus a
-- restaurant_get_bills(uuid, text, integer) RPC over it (20260624211000).
-- Only the create/update-status/delete RPCs were missing; add those instead
-- of duplicating the table.
alter table public.bills enable row level security;

drop policy if exists bills_staff on public.bills;
create policy bills_staff on public.bills
  for all using (
    private.has_restaurant_role(restaurant_id, array['owner','manager']::public.user_roles_role_enum[])
  )
  with check (
    private.has_restaurant_role(restaurant_id, array['owner','manager']::public.user_roles_role_enum[])
  );

-- ─── financial dashboard (painel financeiro) ───────────────────────────────────
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
  v_from timestamptz := coalesce(p_from, current_date::timestamptz);
  v_to   timestamptz := coalesce(p_to, (current_date + 1)::timestamptz);
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
        and status::text in ('delivered', 'completed')
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
          and o2.status::text in ('delivered', 'completed')
        group by mc.name
      ) c
    )
  )
  into result
  from public.orders o
  where o.restaurant_id = p_restaurant_id
    and o.created_at >= v_from
    and o.created_at < v_to
    and o.status::text in ('delivered', 'completed');

  return result;
end;
$$;

-- ─── bills (contas a pagar) create/update/delete ───────────────────────────────
create or replace function public.restaurant_create_bill(
  p_restaurant_id uuid,
  p_supplier_name text,
  p_amount numeric,
  p_due_date timestamptz,
  p_category text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_bill record;
begin
  perform private.require_restaurant_role(
    p_restaurant_id,
    array['owner','manager']::public.user_roles_role_enum[]
  );

  insert into public.bills(
    restaurant_id, description, supplier, category, amount, due_date, status, is_recurring, created_at, updated_at
  )
  values (
    p_restaurant_id, p_supplier_name, p_supplier_name, coalesce(p_category, 'Fornecedores'),
    p_amount, p_due_date, 'pending', false, now(), now()
  )
  returning * into v_bill;

  return to_jsonb(v_bill);
end;
$$;

create or replace function public.restaurant_update_bill_status(
  p_bill_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_bill record;
  v_updated record;
begin
  select * into v_bill from public.bills where id = p_bill_id;
  if v_bill.id is null then
    raise exception 'Bill not found' using errcode = 'P0002';
  end if;

  perform private.require_restaurant_role(
    v_bill.restaurant_id,
    array['owner','manager']::public.user_roles_role_enum[]
  );

  if p_status not in ('pending', 'paid', 'overdue') then
    raise exception 'Invalid status: %', p_status using errcode = '22023';
  end if;

  update public.bills
  set status = p_status,
      paid_date = case when p_status = 'paid' then now() else paid_date end,
      updated_at = now()
  where id = p_bill_id
  returning * into v_updated;

  return to_jsonb(v_updated);
end;
$$;

create or replace function public.restaurant_delete_bill(
  p_bill_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_bill record;
begin
  select * into v_bill from public.bills where id = p_bill_id;
  if v_bill.id is null then
    raise exception 'Bill not found' using errcode = 'P0002';
  end if;

  perform private.require_restaurant_role(
    v_bill.restaurant_id,
    array['owner','manager']::public.user_roles_role_enum[]
  );

  delete from public.bills where id = p_bill_id;

  return jsonb_build_object('id', p_bill_id, 'deleted', true);
end;
$$;

-- ─── satisfação (avg review rating) + recorrência (repeat customer rate) ───────
create or replace function public.restaurant_get_satisfaction_recurrence(
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
    array['owner','manager']::public.user_roles_role_enum[]
  );

  select jsonb_build_object(
    'average_rating', (
      select round(avg(rating)::numeric, 1)
      from public.reviews
      where restaurant_id = p_restaurant_id
        and created_at >= v_from
        and created_at < v_to
        and is_visible = true
        and deleted_at is null
    ),
    'review_count', (
      select count(*)
      from public.reviews
      where restaurant_id = p_restaurant_id
        and created_at >= v_from
        and created_at < v_to
        and is_visible = true
        and deleted_at is null
    ),
    'recurrence_rate', (
      select case when count(*) = 0 then 0
        else round(100.0 * count(*) filter (where order_count > 1) / count(*), 1)
      end
      from (
        select customer_id, count(*) as order_count
        from public.orders
        where restaurant_id = p_restaurant_id
          and created_at >= v_from
          and created_at < v_to
          and status::text in ('delivered', 'completed')
          and customer_id is not null
        group by customer_id
      ) c
    )
  )
  into result;

  return result;
end;
$$;

revoke all on function public.restaurant_get_financial_dashboard(uuid, timestamptz, timestamptz) from public;
revoke all on function public.restaurant_create_bill(uuid, text, numeric, timestamptz, text) from public;
revoke all on function public.restaurant_update_bill_status(uuid, text) from public;
revoke all on function public.restaurant_delete_bill(uuid) from public;
revoke all on function public.restaurant_get_satisfaction_recurrence(uuid, timestamptz, timestamptz) from public;

grant execute on function public.restaurant_get_financial_dashboard(uuid, timestamptz, timestamptz) to authenticated, service_role;
grant execute on function public.restaurant_create_bill(uuid, text, numeric, timestamptz, text) to authenticated, service_role;
grant execute on function public.restaurant_update_bill_status(uuid, text) to authenticated, service_role;
grant execute on function public.restaurant_delete_bill(uuid) to authenticated, service_role;
grant execute on function public.restaurant_get_satisfaction_recurrence(uuid, timestamptz, timestamptz) to authenticated, service_role;
