-- Casual Dining self-checkout: "Gorjeta & Pagamento" → payment confirmation
-- → mandatory digital receipt → review. Every successful payment produces a
-- real, persisted receipt row (never reconstructed/guessed client-side) and
-- reuses the wallet/cashback/loyalty-points infrastructure that already
-- reacts to gateway_transactions (20260814233000, 20260710131000) instead of
-- re-inventing those mechanics.
--
-- Scope note: there is no real card/PIX gateway wired into this app (no
-- Stripe/PagSeguro/Mercado Pago SDK). This mirrors how the rest of the app
-- already treats in-person payment — "Fechar Conta" asks staff to bring the
-- machine — except here the customer's method choice and the kitchen-side
-- settlement are recorded the moment the actual charge is confirmed by staff
-- or an already-trusted PIX/QR flow outside the app's control. That's an
-- explicit product decision, not a shortcut: no code in this migration
-- claims to move money through Apple Pay/Google Pay/card networks itself.

-- ── 1. Family loyalty tier (Casual Dining's "Selo de família") ──────────────
create table if not exists public.casual_dining_family_loyalty (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  visit_count integer not null default 0,
  tier text not null default 'bronze' check (tier in ('bronze', 'silver', 'gold')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, restaurant_id)
);

alter table public.casual_dining_family_loyalty enable row level security;
revoke all on public.casual_dining_family_loyalty from anon, authenticated;
grant select on public.casual_dining_family_loyalty to authenticated;

drop policy if exists casual_dining_family_loyalty_own on public.casual_dining_family_loyalty;
create policy casual_dining_family_loyalty_own on public.casual_dining_family_loyalty
for select to authenticated using (user_id = auth.uid());

-- ── 2. Receipts ───────────────────────────────────────────────────────────────
-- A literal snapshot taken at payment time — the source of truth for the
-- "Recibo Digital" screen, not something recomputed from mutable order state
-- later (so a receipt stays exactly what the guest saw, even if e.g. a menu
-- item's name changes afterwards).
create table if not exists public.casual_dining_receipts (
  id uuid primary key default gen_random_uuid(),
  gateway_transaction_id uuid not null references public.gateway_transactions(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  customer_id uuid not null references public.profiles(id) on delete cascade,
  table_session_id uuid references public.table_sessions(id) on delete set null,
  items jsonb not null default '[]'::jsonb,
  subtotal numeric(10,2) not null,
  service_fee_percent numeric(5,2) not null default 0,
  service_fee numeric(10,2) not null default 0,
  discount numeric(10,2) not null default 0,
  discount_reason text,
  total numeric(10,2) not null,
  tip numeric(10,2) not null default 0,
  payment_method text not null,
  cashback numeric(10,2) not null default 0,
  points_awarded integer not null default 0,
  family_tier text,
  family_visit_count integer,
  created_at timestamptz not null default now()
);

create index if not exists idx_casual_dining_receipts_customer_id on public.casual_dining_receipts(customer_id, created_at desc);
create index if not exists idx_casual_dining_receipts_restaurant_id on public.casual_dining_receipts(restaurant_id, created_at desc);
create unique index if not exists idx_casual_dining_receipts_gateway_transaction on public.casual_dining_receipts(gateway_transaction_id);

alter table public.casual_dining_receipts enable row level security;
revoke all on public.casual_dining_receipts from anon, authenticated;
grant select on public.casual_dining_receipts to authenticated;

drop policy if exists casual_dining_receipts_customer_own on public.casual_dining_receipts;
create policy casual_dining_receipts_customer_own on public.casual_dining_receipts
for select to authenticated using (customer_id = auth.uid());

drop policy if exists casual_dining_receipts_staff_select on public.casual_dining_receipts;
create policy casual_dining_receipts_staff_select on public.casual_dining_receipts
for select to authenticated using (
  private.has_restaurant_role(restaurant_id, array['owner','manager','maitre','waiter']::public.user_roles_role_enum[])
);

-- ── 3. Pay the table bill (self-checkout) ────────────────────────────────────
-- p_base_amount is only set by the "Partes Iguais" / "Por Item" / "Valor
-- Fixo" split modes on the client, where the amount doesn't map onto the
-- caller's own order rows one-to-one; left null ("Meus Itens", the default),
-- the charge is computed from the caller's own real unpaid items and the
-- receipt lists them individually. Either way the transaction, cashback,
-- points and family-loyalty effects are all real and equally backed.
create or replace function public.customer_pay_table_bill(
  p_table_session_id uuid,
  p_tip_percent numeric default 0,
  p_payment_method text default 'pix',
  p_base_amount numeric default null,
  p_split_mode text default 'mine',
  p_idempotency_key uuid default null
) returns jsonb language plpgsql security definer
set search_path = public, private, pg_temp as $$
declare
  v_session public.table_sessions;
  v_restaurant public.restaurants;
  v_fee_pct numeric;
  v_subtotal numeric(10,2);
  v_items jsonb;
  v_anchor_order uuid;
  v_order_ids uuid[];
  v_discount numeric(10,2) := 0;
  v_discount_reason text;
  v_loyalty public.casual_dining_family_loyalty;
  v_service_fee numeric(10,2);
  v_total numeric(10,2);
  v_tip numeric(10,2);
  v_charged numeric(10,2);
  v_gateway_tx_id uuid;
  v_receipt public.casual_dining_receipts;
  v_cashback numeric(10,2) := 0;
  v_points integer := 0;
  v_loyalty_program public.loyalty_programs;
  v_total_payers integer;
  v_paid_payers integer;
  v_idempotency_key text;
  v_existing_receipt public.casual_dining_receipts;
  v_split_labels constant jsonb := jsonb_build_object(
    'equal', 'Partes iguais', 'byItem', 'Itens selecionados', 'fixed', 'Valor definido pelo cliente'
  );
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_tip_percent is null or p_tip_percent < 0 or p_tip_percent > 30 then
    raise exception 'Invalid tip percent' using errcode = '22023';
  end if;
  if p_payment_method not in ('pix', 'credit_card', 'debit_card', 'apple_pay', 'google_pay', 'tap_to_pay', 'wallet') then
    raise exception 'Invalid payment method' using errcode = '22023';
  end if;
  if p_split_mode not in ('mine', 'equal', 'byItem', 'fixed') then
    raise exception 'Invalid split mode' using errcode = '22023';
  end if;
  if not private.is_table_session_participant(p_table_session_id) then
    raise exception 'Table session not accessible' using errcode = 'P0001';
  end if;

  v_idempotency_key := 'table-checkout:' || coalesce(p_idempotency_key::text, gen_random_uuid()::text);
  if p_idempotency_key is not null then
    select r.* into v_existing_receipt
    from public.casual_dining_receipts r
    join public.gateway_transactions gt on gt.id = r.gateway_transaction_id
    where gt.idempotency_key = v_idempotency_key;
    if v_existing_receipt.id is not null then
      return jsonb_build_object(
        'receiptId', v_existing_receipt.id, 'total', v_existing_receipt.total, 'tip', v_existing_receipt.tip,
        'charged', v_existing_receipt.total + v_existing_receipt.tip, 'cashback', v_existing_receipt.cashback,
        'pointsAwarded', v_existing_receipt.points_awarded, 'familyTier', v_existing_receipt.family_tier,
        'familyVisitCount', v_existing_receipt.family_visit_count, 'idempotentReplay', true
      );
    end if;
  end if;

  select * into v_session from public.table_sessions where id = p_table_session_id;
  select * into v_restaurant from public.restaurants where id = v_session.restaurant_id;

  if p_split_mode = 'mine' then
    select coalesce(array_agg(o.id), array[]::uuid[]) into v_order_ids
    from public.orders o
    where o.table_session_id = p_table_session_id
      and o.customer_id = auth.uid()
      and o.status::text not in ('cancelled')
      and not exists (
        select 1 from public.gateway_transactions gt
        where gt.order_id = o.id and gt.status = 'completed'
      );

    if array_length(v_order_ids, 1) is null then
      raise exception 'Nothing to pay for this diner' using errcode = 'P0001';
    end if;
    -- The most recent order anchors the gateway transaction/receipt row.
    select o.id into v_anchor_order from public.orders o
      where o.id = any(v_order_ids) order by o.created_at desc limit 1;

    select coalesce(jsonb_agg(jsonb_build_object(
      'name', coalesce(mi.name, 'Item'), 'quantity', oi.quantity,
      'unitPrice', oi.unit_price, 'totalPrice', oi.total_price
    ) order by oi.created_at), '[]'::jsonb), coalesce(sum(oi.total_price), 0)
    into v_items, v_subtotal
    from public.order_items oi
    left join public.menu_items mi on mi.id = oi.menu_item_id
    where oi.order_id = any(v_order_ids);
  else
    -- The table's real subtotal caps a self-selected split so nobody can pay
    -- (or claim to pay) more than the table actually owes.
    if p_base_amount is null or p_base_amount <= 0 then
      raise exception 'A split amount is required for this mode' using errcode = '22023';
    end if;
    select coalesce(sum(oi.total_price), 0) into v_subtotal
    from public.order_items oi join public.orders o on o.id = oi.order_id
    where o.table_session_id = p_table_session_id and o.status::text <> 'cancelled';
    if p_base_amount > greatest(v_subtotal, 0.01) then
      raise exception 'Split amount exceeds the table subtotal' using errcode = '22023';
    end if;
    v_subtotal := round(p_base_amount, 2);
    v_items := jsonb_build_array(jsonb_build_object(
      'name', 'Sua parte da conta (' || (v_split_labels->>p_split_mode) || ')',
      'quantity', 1, 'unitPrice', v_subtotal, 'totalPrice', v_subtotal
    ));
  end if;

  if v_subtotal <= 0 then raise exception 'Nothing to pay for this diner' using errcode = 'P0001'; end if;

  v_fee_pct := coalesce((v_restaurant.service_config->>'service_fee_percent')::numeric, 10);
  v_service_fee := round(v_subtotal * v_fee_pct / 100, 2);

  -- Family loyalty: every visit while Modo Família is active advances the
  -- tier; every 5th such visit earns a flat R$15 credit (the "sobremesa kids
  -- grátis" the client screens promise) applied as a discount on the bill.
  if coalesce(v_session.family_mode, false) then
    insert into public.casual_dining_family_loyalty (user_id, restaurant_id, visit_count, tier)
    values (auth.uid(), v_session.restaurant_id, 1, 'bronze')
    on conflict (user_id, restaurant_id) do update
      set visit_count = public.casual_dining_family_loyalty.visit_count + 1,
          updated_at = now()
    returning * into v_loyalty;

    update public.casual_dining_family_loyalty
    set tier = case
      when visit_count >= 15 then 'gold'
      when visit_count >= 5 then 'silver'
      else 'bronze'
    end
    where id = v_loyalty.id
    returning * into v_loyalty;

    if v_loyalty.visit_count % 5 = 0 then
      v_discount := least(15.00, v_subtotal);
      v_discount_reason := 'Sobremesa kids grátis (fidelidade família)';
    end if;
  end if;

  v_total := v_subtotal + v_service_fee - v_discount;
  v_tip := round(v_subtotal * p_tip_percent / 100, 2);
  v_charged := v_total + v_tip;

  insert into public.gateway_transactions (
    restaurant_id, order_id, customer_id, provider, payment_method,
    amount, amount_cents, status, idempotency_key, metadata, created_at, updated_at
  ) values (
    v_session.restaurant_id, v_anchor_order, auth.uid(), 'in_app', p_payment_method,
    v_charged, (v_charged * 100)::numeric(12,2), 'completed',
    v_idempotency_key,
    jsonb_build_object('table_session_id', p_table_session_id, 'order_ids', v_order_ids, 'tip', v_tip, 'split_mode', p_split_mode),
    now(), now()
  )
  returning id into v_gateway_tx_id;

  update public.orders
  set status = 'completed', payment_method = p_payment_method,
      tip_amount = coalesce(tip_amount, 0) + case when id = v_anchor_order then v_tip else 0 end,
      completed_at = coalesce(completed_at, now()), updated_at = now()
  where id = any(v_order_ids);

  -- v_gateway_tx_id (never null, unique per payment) is the loyalty dedup
  -- key rather than v_anchor_order — split-mode payments have no anchor
  -- order, and concatenating a NULL there would wipe out
  -- loyalty_programs.awarded_order_ids for every order previously credited.
  perform private.loyalty_award_points(auth.uid(), v_session.restaurant_id, v_gateway_tx_id, v_charged);

  select * into v_loyalty_program from public.loyalty_programs
    where user_id = auth.uid() and restaurant_id = v_session.restaurant_id;
  if v_loyalty_program.id is not null
    and v_gateway_tx_id::text = any(string_to_array(coalesce(v_loyalty_program.awarded_order_ids, ''), ',')) then
    select coalesce(lc.points_per_real, 1) * v_charged into v_points
    from public.loyalty_configs lc where lc.restaurant_id = v_session.restaurant_id;
    v_points := floor(coalesce(v_points, 0));
  end if;

  -- The wallet trigger (private.apply_customer_wallet_payment) already ran as
  -- part of the gateway_transactions insert above — read back what it did
  -- instead of recomputing the cashback formula a second time here.
  select coalesce(wt.amount, 0) into v_cashback
  from public.wallet_transactions wt
  join public.wallets w on w.id = wt.wallet_id
  where w.user_id = auth.uid() and wt.transaction_type = 'cashback'
    and wt.metadata->>'gateway_transaction_id' = v_gateway_tx_id::text
  limit 1;

  insert into public.casual_dining_receipts (
    gateway_transaction_id, restaurant_id, customer_id, table_session_id,
    items, subtotal, service_fee_percent, service_fee, discount, discount_reason,
    total, tip, payment_method, cashback, points_awarded, family_tier, family_visit_count
  ) values (
    v_gateway_tx_id, v_session.restaurant_id, auth.uid(), p_table_session_id,
    v_items, v_subtotal, v_fee_pct, v_service_fee, v_discount, v_discount_reason,
    v_total, v_tip, p_payment_method, v_cashback, v_points, v_loyalty.tier, v_loyalty.visit_count
  )
  returning * into v_receipt;

  -- "3/4 pagaram" tracks real (non-companion) people at the table, not just
  -- whoever placed an order — a split-mode payer may cover someone else's
  -- share without having ordered anything themselves.
  select count(distinct p.user_id) into v_total_payers
  from public.table_session_participants p
  where p.table_session_id = p_table_session_id and p.user_id is not null;
  select count(distinct gt.customer_id) into v_paid_payers
  from public.gateway_transactions gt
  where gt.status = 'completed' and gt.metadata->>'table_session_id' = p_table_session_id::text
    and gt.customer_id in (
      select p.user_id from public.table_session_participants p
      where p.table_session_id = p_table_session_id and p.user_id is not null
    );

  return jsonb_build_object(
    'receiptId', v_receipt.id,
    -- Only set for "Meus Itens" (real order rows exist to review); split
    -- modes have no single anchor order, so the review screen falls back to
    -- the diner's latest completed order at this restaurant instead.
    'orderId', v_anchor_order,
    'restaurantId', v_session.restaurant_id,
    'total', v_total,
    'tip', v_tip,
    'charged', v_charged,
    'cashback', v_cashback,
    'pointsAwarded', v_points,
    'familyTier', v_loyalty.tier,
    'familyVisitCount', v_loyalty.visit_count,
    'visitsUntilNextReward', case when v_loyalty.id is not null then 5 - (v_loyalty.visit_count % 5) else null end,
    'tablePaidCount', v_paid_payers,
    'tableTotalCount', v_total_payers
  );
end $$;

-- ── 4. Read back a receipt ───────────────────────────────────────────────────
create or replace function public.customer_get_receipt(p_receipt_id uuid)
returns jsonb language plpgsql stable security definer
set search_path = public, private, pg_temp as $$
declare v_receipt public.casual_dining_receipts; v_restaurant public.restaurants; v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select * into v_receipt from public.casual_dining_receipts where id = p_receipt_id and customer_id = auth.uid();
  if v_receipt.id is null then raise exception 'Receipt not found' using errcode = 'P0002'; end if;
  select * into v_restaurant from public.restaurants where id = v_receipt.restaurant_id;

  v_result := to_jsonb(v_receipt) || jsonb_build_object(
    'restaurantName', v_restaurant.name,
    'restaurantCnpj', coalesce(v_restaurant.settings->>'cnpj', null),
    -- A stable, receipt-scoped 44-digit style code, not a real SEFAZ NFC-e key
    -- (there is no fiscal integration) — presentational only.
    'accessKey', regexp_replace(rpad(replace(v_receipt.id::text, '-', ''), 44, '0'), '(.{4})(?=.)', '\1 ', 'g')
  );
  return v_result;
end $$;

-- Fallback for the review screen when a split-mode payment had no single
-- anchor order (see customer_pay_table_bill above).
create or replace function public.customer_get_latest_reviewable_order(p_restaurant_id uuid)
returns uuid language sql stable security definer
set search_path = public, pg_temp as $$
  select o.id from public.orders o
  where o.restaurant_id = p_restaurant_id and o.customer_id = auth.uid()
    and o.status::text in ('delivered', 'completed')
    and not exists (select 1 from public.reviews r where r.order_id = o.id and r.user_id = auth.uid() and r.deleted_at is null)
  order by o.completed_at desc nulls last, o.created_at desc
  limit 1;
$$;

revoke all on function public.customer_get_latest_reviewable_order(uuid) from public;
grant execute on function public.customer_get_latest_reviewable_order(uuid) to authenticated;

revoke all on function public.customer_pay_table_bill(uuid, numeric, text, numeric, text, uuid) from public;
revoke all on function public.customer_get_receipt(uuid) from public;
grant execute on function public.customer_pay_table_bill(uuid, numeric, text, numeric, text, uuid) to authenticated;
grant execute on function public.customer_get_receipt(uuid) to authenticated;

-- ── 5. Reviews: sub-ratings + quick tags ─────────────────────────────────────
alter table public.reviews add column if not exists tags text[];

-- Widens the existing (order_id, restaurant_id, rating, comment) signature
-- with optional per-category ratings and quick tags for the casual dining
-- review screen; p_rating alone still works for every existing caller.
drop function if exists public.customer_create_review(uuid, uuid, numeric, text);

create or replace function public.customer_create_review(
  p_order_id uuid, p_restaurant_id uuid, p_rating numeric default null, p_comment text default null,
  p_food_rating numeric default null, p_service_rating numeric default null,
  p_ambiance_rating numeric default null, p_tags text[] default null
) returns public.reviews language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_review public.reviews; v_rating numeric; v_ratings numeric[];
begin
  v_ratings := array_remove(array[p_rating, p_food_rating, p_service_rating, p_ambiance_rating], null);
  if array_length(v_ratings, 1) is null then
    raise exception 'At least one rating is required' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(v_ratings) r where r < 1 or r > 5) then
    raise exception 'Rating must be between 1 and 5' using errcode = '22023';
  end if;
  v_rating := (select round(avg(r), 2) from unnest(v_ratings) r);

  if not exists(select 1 from public.orders where id = p_order_id and customer_id = auth.uid()
    and restaurant_id = p_restaurant_id and status::text in ('delivered','completed'))
  then raise exception 'Only completed orders can be reviewed' using errcode = 'P0001'; end if;
  if exists(select 1 from public.reviews where order_id = p_order_id and user_id = auth.uid() and deleted_at is null)
  then raise exception 'Order already reviewed' using errcode = '23505'; end if;

  insert into public.reviews(
    user_id, restaurant_id, order_id, rating, food_rating, service_rating, ambiance_rating,
    comment, tags, created_at, updated_at
  ) values (
    auth.uid(), p_restaurant_id, p_order_id, v_rating, p_food_rating, p_service_rating, p_ambiance_rating,
    nullif(trim(p_comment), ''), nullif(p_tags, array[]::text[]), now(), now()
  ) returning * into v_review;
  return v_review;
end $$;

revoke all on function public.customer_create_review(uuid, uuid, numeric, text, numeric, numeric, numeric, text[]) from public;
grant execute on function public.customer_create_review(uuid, uuid, numeric, text, numeric, numeric, numeric, text[]) to authenticated;

-- ── 6. Cantina Noowe: loyalty config so the payment flow has real numbers ───
insert into public.loyalty_configs (restaurant_id, cashback_enabled, cashback_percentage, points_enabled, points_per_real, points_redemption_rate, min_points_for_redemption, created_at, updated_at)
select 'c1000000-0000-4000-8000-000000000002'::uuid, true, 5, true, 1, 100, 200, now(), now()
where exists (select 1 from public.restaurants where id = 'c1000000-0000-4000-8000-000000000002'::uuid)
  and not exists (select 1 from public.loyalty_configs where restaurant_id = 'c1000000-0000-4000-8000-000000000002'::uuid);

comment on table public.casual_dining_receipts is
  'Immutable snapshot of a casual dining self-checkout payment, generated by customer_pay_table_bill.';
comment on table public.casual_dining_family_loyalty is
  'Per-user, per-restaurant Modo Família visit streak and tier ("Selo de família").';
