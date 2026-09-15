-- Schema additions and RPC fixes
-- Adds missing columns identified during backend implementation

-- ─── orders: add payment_method ───────────────────────────────────────────────
alter table public.orders
  add column if not exists payment_method text;

-- ─── restaurants: extended profile fields ─────────────────────────────────────
alter table public.restaurants
  add column if not exists cover_image_url text,
  add column if not exists cuisine_type text,
  add column if not exists price_range text,
  add column if not exists business_hours jsonb,
  add column if not exists features jsonb,
  add column if not exists settings jsonb,
  add column if not exists max_party_size integer,
  add column if not exists average_prep_time integer;

-- ─── gateway_configs: extended fields ─────────────────────────────────────────
alter table public.gateway_configs
  add column if not exists gateway_type text,
  add column if not exists supported_methods jsonb,
  add column if not exists pix_key text,
  add column if not exists merchant_name text;

-- ─── gateway_transactions: customer_id and amount as decimal ─────────────────
alter table public.gateway_transactions
  add column if not exists customer_id uuid,
  add column if not exists amount numeric(12, 2);

-- ─── fix restaurant_record_payment RPC (use correct schema) ──────────────────
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
  v_tx_id uuid;
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

  -- record transaction (use gateway_transactions schema)
  insert into public.gateway_transactions(
    restaurant_id, order_id, customer_id, provider, payment_method,
    amount, amount_cents, status, idempotency_key, metadata, created_at, updated_at
  )
  values(
    v_order.restaurant_id, p_order_id, v_order.customer_id,
    'manual', p_payment_method,
    p_amount, (p_amount * 100)::numeric(12,2), 'completed',
    gen_random_uuid()::text,
    jsonb_build_object('tip_amount', p_tip_amount, 'notes', p_notes),
    now(), now()
  )
  returning id into v_tx_id;

  -- update order
  update public.orders
  set
    payment_method = p_payment_method,
    tip_amount     = coalesce(tip_amount, 0) + p_tip_amount,
    status         = case when status::text not in ('delivered','completed') then 'completed' else status end,
    completed_at   = case when completed_at is null then now() else completed_at end,
    updated_at     = now()
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
    'transaction_id', v_tx_id,
    'order_id', p_order_id,
    'payment_method', p_payment_method,
    'amount', p_amount,
    'tip_amount', p_tip_amount,
    'status', 'completed'
  );
end;
$$;

-- ─── fix restaurant_get_gateway_config (use correct schema) ───────────────────
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
    'provider', gc.provider,
    'gateway_type', coalesce(gc.gateway_type, gc.provider),
    'is_active', gc.is_active,
    'supported_methods', gc.supported_methods,
    'pix_key', gc.pix_key,
    'merchant_name', gc.merchant_name,
    'settings', gc.settings
  )
  into result
  from public.gateway_configs gc
  where gc.restaurant_id = p_restaurant_id and gc.is_active = true
  limit 1;

  return result;
end;
$$;

-- ─── fix restaurant_update_profile (use actual restaurants columns) ────────────
create or replace function public.restaurant_update_profile(
  p_restaurant_id uuid,
  p_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_updated record;
begin
  perform private.require_restaurant_role(
    p_restaurant_id,
    array['owner','manager']::public.user_roles_role_enum[]
  );

  update public.restaurants
  set
    name              = coalesce(p_patch->>'name', name),
    description       = coalesce(p_patch->>'description', description),
    phone             = coalesce(p_patch->>'phone', phone),
    email             = coalesce(p_patch->>'email', email),
    logo_url          = coalesce(p_patch->>'logo_url', logo_url),
    cover_image_url   = coalesce(p_patch->>'cover_image_url', cover_image_url),
    banner_url        = coalesce(p_patch->>'banner_url', banner_url),
    cuisine_type      = coalesce(p_patch->>'cuisine_type', cuisine_type),
    price_range       = coalesce(p_patch->>'price_range', price_range),
    business_hours    = coalesce(p_patch->'business_hours', business_hours),
    opening_hours     = coalesce(p_patch->'opening_hours', opening_hours),
    features          = coalesce(p_patch->'features', features),
    settings          = coalesce(p_patch->'settings', settings),
    service_config    = coalesce(p_patch->'service_config', service_config),
    max_party_size    = coalesce((p_patch->>'max_party_size')::integer, max_party_size),
    average_prep_time = coalesce((p_patch->>'average_prep_time')::integer, average_prep_time),
    is_active         = coalesce((p_patch->>'is_active')::boolean, is_active),
    updated_at        = now()
  where id = p_restaurant_id
  returning * into v_updated;

  return to_jsonb(v_updated);
end;
$$;

-- ─── fix loyalty_programs: add unique constraint if not exists ─────────────────
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'uq_loyalty_programs_user_restaurant'
  ) then
    alter table public.loyalty_programs
      add constraint uq_loyalty_programs_user_restaurant
      unique (user_id, restaurant_id);
  end if;
end;
$$;

-- ─── kds_brain_configs: add unique on restaurant_id if not exists ──────────────
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'uq_kds_brain_configs_restaurant'
  ) then
    alter table public.kds_brain_configs
      add constraint uq_kds_brain_configs_restaurant
      unique (restaurant_id);
  end if;
end;
$$;

revoke all on function public.restaurant_record_payment(uuid, text, numeric, numeric, text) from public;
revoke all on function public.restaurant_get_gateway_config(uuid) from public;
revoke all on function public.restaurant_update_profile(uuid, jsonb) from public;

grant execute on function public.restaurant_record_payment(uuid, text, numeric, numeric, text) to authenticated, service_role;
grant execute on function public.restaurant_get_gateway_config(uuid) to authenticated, service_role;
grant execute on function public.restaurant_update_profile(uuid, jsonb) to authenticated, service_role;
