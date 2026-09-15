-- Payment RPCs
-- Covers: record payment on order, get payment methods config, generate PIX (stub),
--         close bill, get bills for table

alter table public.gateway_transactions
  add column if not exists customer_id uuid,
  add column if not exists amount numeric(12, 2);

alter table public.gateway_configs
  add column if not exists gateway_type text,
  add column if not exists supported_methods jsonb,
  add column if not exists pix_key text,
  add column if not exists merchant_name text;

alter table public.orders
  add column if not exists payment_method text;

alter table public.gateway_transactions enable row level security;
alter table public.gateway_configs enable row level security;
alter table public.bills enable row level security;

drop policy if exists "gateway_transactions_staff" on public.gateway_transactions;
create policy "gateway_transactions_staff" on public.gateway_transactions
  for all using (
    private.has_restaurant_role(restaurant_id, array['owner','manager','waiter']::public.user_roles_role_enum[])
    or customer_id = auth.uid()
  );

drop policy if exists "gateway_configs_staff" on public.gateway_configs;
create policy "gateway_configs_staff" on public.gateway_configs
  for all using (
    private.has_restaurant_role(restaurant_id, array['owner','manager']::public.user_roles_role_enum[])
  );

drop policy if exists "bills_staff" on public.bills;
create policy "bills_staff" on public.bills
  for all using (
    private.has_restaurant_role(restaurant_id, array['owner','manager','waiter']::public.user_roles_role_enum[])
  );

-- ─── record payment for an order ─────────────────────────────────────────────
create or replace function public.restaurant_record_payment(
  p_order_id       uuid,
  p_payment_method text,
  p_amount         numeric,
  p_tip_amount     numeric default 0,
  p_notes          text    default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_order record;
  v_updated_order record;
  v_tx record;
begin
  select * into v_order from public.orders where id = p_order_id;
  if v_order.id is null then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  perform private.require_restaurant_role(
    v_order.restaurant_id,
    array['owner','manager','waiter']::public.user_roles_role_enum[]
  );

  if p_payment_method not in ('cash','credit_card','debit_card','pix','wallet','voucher','other') then
    raise exception 'Invalid payment method: %', p_payment_method using errcode = '22023';
  end if;

  -- record transaction
  insert into public.gateway_transactions(
    restaurant_id, order_id, customer_id, payment_method, amount,
    status, metadata, created_at, updated_at
  )
  values(
    v_order.restaurant_id, p_order_id, v_order.customer_id, p_payment_method, p_amount,
    'completed', jsonb_build_object('tip_amount', p_tip_amount, 'notes', p_notes),
    now(), now()
  )
  returning * into v_tx;

  -- update order payment info
  update public.orders
  set
    payment_method  = p_payment_method,
    tip_amount      = coalesce(tip_amount, 0) + p_tip_amount,
    status          = case when status::text not in ('delivered','completed') then 'completed' else status end,
    completed_at    = case when completed_at is null then now() else completed_at end,
    updated_at      = now()
  where id = p_order_id
  returning * into v_updated_order;

  -- award loyalty points
  if v_order.customer_id is not null then
    perform private.loyalty_award_points(
      v_order.customer_id,
      v_order.restaurant_id,
      p_order_id,
      p_amount
    );
  end if;

  return jsonb_build_object(
    'transaction_id', v_tx.id,
    'order_id', p_order_id,
    'payment_method', p_payment_method,
    'amount', p_amount,
    'tip_amount', p_tip_amount,
    'status', 'completed'
  );
end;
$$;

-- ─── get bills for restaurant ─────────────────────────────────────────────────
create or replace function public.restaurant_get_bills(
  p_restaurant_id uuid,
  p_status text default null,
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
    array['owner','manager','waiter']::public.user_roles_role_enum[]
  );

  select coalesce(jsonb_agg(to_jsonb(b) order by b.created_at desc), '[]'::jsonb)
  into result
  from public.bills b
  where b.restaurant_id = p_restaurant_id
    and (p_status is null or b.status = p_status)
  limit greatest(1, least(coalesce(p_limit, 50), 200));

  return result;
end;
$$;

-- ─── get payment gateway config ───────────────────────────────────────────────
create or replace function public.restaurant_get_gateway_config(
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

  select jsonb_build_object(
    'id', gc.id,
    'gateway_type', gc.gateway_type,
    'is_active', gc.is_active,
    'supported_methods', gc.supported_methods,
    'pix_key', gc.pix_key,
    'merchant_name', gc.merchant_name
  )
  into result
  from public.gateway_configs gc
  where gc.restaurant_id = p_restaurant_id and gc.is_active = true
  limit 1;

  return result;
end;
$$;

revoke all on function public.restaurant_record_payment(uuid, text, numeric, numeric, text) from public;
revoke all on function public.restaurant_get_bills(uuid, text, integer) from public;
revoke all on function public.restaurant_get_gateway_config(uuid) from public;

grant execute on function public.restaurant_record_payment(uuid, text, numeric, numeric, text) to authenticated, service_role;
grant execute on function public.restaurant_get_bills(uuid, text, integer) to authenticated, service_role;
grant execute on function public.restaurant_get_gateway_config(uuid) to authenticated, service_role;
