-- Fixes two payment-integrity bugs in restaurant_record_payment /
-- private.loyalty_award_points (both currently defined in
-- 20260624213000_schema_additions_and_rpc_fixes.sql and
-- 20260624208000_loyalty_rpc.sql):
--   1. p_amount was never validated (a negative or zero amount was accepted).
--   2. idempotency_key was generated server-side on every call, so a client
--      retry (timeout, double-tap) created a brand-new gateway_transactions
--      row and re-ran loyalty_award_points every time.
--   3. loyalty_award_points appended order_id to awarded_order_ids without
--      ever checking whether it was already there, so a duplicate payment
--      call also duplicated loyalty points and total_spent.

create or replace function public.restaurant_record_payment(
  p_order_id       uuid,
  p_payment_method text,
  p_amount         numeric,
  p_tip_amount     numeric default 0,
  p_notes          text    default null,
  p_idempotency_key text   default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_order record;
  v_updated_order record;
  v_tx_id uuid;
  v_existing record;
  v_key text;
begin
  select * into v_order from public.orders where id = p_order_id;
  if v_order.id is null then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  perform private.require_restaurant_role(
    v_order.restaurant_id,
    array['owner','manager','waiter']::public.user_roles_role_enum[]
  );

  if p_amount is null or p_amount <= 0 then
    raise exception 'Invalid payment amount: %', p_amount using errcode = '22023';
  end if;

  if p_payment_method not in ('cash','credit_card','debit_card','pix','wallet','voucher','other') then
    raise exception 'Invalid payment method: %', p_payment_method using errcode = '22023';
  end if;

  -- Idempotent retry: if the client already sent this exact key for this
  -- order, return the transaction that was recorded the first time instead
  -- of creating a duplicate.
  if p_idempotency_key is not null then
    select * into v_existing
    from public.gateway_transactions
    where order_id = p_order_id
      and idempotency_key = p_idempotency_key
    limit 1;

    if v_existing.id is not null then
      return jsonb_build_object(
        'transaction_id', v_existing.id,
        'order_id', p_order_id,
        'payment_method', v_existing.payment_method,
        'amount', v_existing.amount,
        'tip_amount', p_tip_amount,
        'status', v_existing.status,
        'idempotent_replay', true
      );
    end if;
  end if;

  v_key := coalesce(p_idempotency_key, gen_random_uuid()::text);

  insert into public.gateway_transactions(
    restaurant_id, order_id, customer_id, provider, payment_method,
    amount, amount_cents, status, idempotency_key, metadata, created_at, updated_at
  )
  values(
    v_order.restaurant_id, p_order_id, v_order.customer_id,
    'manual', p_payment_method,
    p_amount, (p_amount * 100)::numeric(12,2), 'completed',
    v_key,
    jsonb_build_object('tip_amount', p_tip_amount, 'notes', p_notes),
    now(), now()
  )
  returning id into v_tx_id;

  update public.orders
  set
    payment_method = p_payment_method,
    tip_amount     = coalesce(tip_amount, 0) + p_tip_amount,
    status         = case when status::text not in ('delivered','completed') then 'completed' else status end,
    completed_at   = case when completed_at is null then now() else completed_at end,
    updated_at     = now()
  where id = p_order_id
  returning * into v_updated_order;

  if v_order.customer_id is not null then
    perform private.loyalty_award_points(
      v_order.customer_id,
      v_order.restaurant_id,
      p_order_id,
      p_amount
    );
  end if;

  return jsonb_build_object(
    'transaction_id', v_tx_id,
    'order_id', p_order_id,
    'payment_method', p_payment_method,
    'amount', p_amount,
    'tip_amount', p_tip_amount,
    'status', 'completed'
  );
end;
$$;

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
  v_existing record;
begin
  select * into v_config
  from public.loyalty_configs
  where restaurant_id = p_restaurant_id
  limit 1;

  if v_config.id is null then return; end if;

  select * into v_existing
  from public.loyalty_programs
  where user_id = p_user_id and restaurant_id = p_restaurant_id;

  -- Already awarded for this order: skip instead of double-counting points
  -- and total_spent on a duplicate/retried payment call.
  if v_existing.id is not null
     and v_order_id_str = any(string_to_array(coalesce(v_existing.awarded_order_ids, ''), ',')) then
    return;
  end if;

  v_points_to_add := floor(p_amount_spent * coalesce(v_config.points_per_real, 1));

  if v_points_to_add <= 0 then return; end if;

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
