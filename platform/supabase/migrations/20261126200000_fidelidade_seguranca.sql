-- Fidelidade: o cliente só LÊ o próprio saldo (pontos/faixa/totais são escritos por funções SECURITY DEFINER);
-- faixas viram configuração do restaurante; a edição do programa vai para o audit_log; cashback só sobre o consumo.

-- 1. Cliente não cria, altera nem apaga o próprio programa (antes podia gravar points/tier direto).
drop policy if exists authenticated_update_own_user_id on public.loyalty_programs;
drop policy if exists authenticated_insert_own_user_id on public.loyalty_programs;
drop policy if exists authenticated_delete_own_user_id on public.loyalty_programs;

-- 2. Faixas por gasto acumulado, em centavos. Os defaults são os valores que estavam fixos no código.
alter table public.loyalty_configs
  add column if not exists tier_silver_min_cents bigint not null default 50000,
  add column if not exists tier_gold_min_cents bigint not null default 200000,
  add column if not exists tier_platinum_min_cents bigint not null default 500000;
alter table public.loyalty_configs drop constraint if exists loyalty_configs_tiers_ascending;
alter table public.loyalty_configs add constraint loyalty_configs_tiers_ascending
  check (tier_silver_min_cents > 0 and tier_silver_min_cents < tier_gold_min_cents and tier_gold_min_cents < tier_platinum_min_cents);

-- Regra única de faixa: gasto acumulado (reais, como em loyalty_programs.total_spent) contra os cortes do restaurante.
create or replace function private.loyalty_tier_for(p_total_spent numeric, p_cfg public.loyalty_configs)
returns text language sql immutable as $$
  select case
    when round(coalesce(p_total_spent, 0) * 100) >= p_cfg.tier_platinum_min_cents then 'platinum'
    when round(coalesce(p_total_spent, 0) * 100) >= p_cfg.tier_gold_min_cents then 'gold'
    when round(coalesce(p_total_spent, 0) * 100) >= p_cfg.tier_silver_min_cents then 'silver'
    else 'bronze' end $$;

CREATE OR REPLACE FUNCTION private.loyalty_on_payment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_cfg public.loyalty_configs; v_cons bigint; v_points bigint; v_credit private.loyalty_payment_credits; v_rev bigint;
begin
  if new.customer_id is null then return new; end if;

  if new.status = 'completed' and (tg_op = 'INSERT' or old.status is distinct from 'completed') then
    select * into v_cfg from public.loyalty_configs where restaurant_id = new.restaurant_id;
    if v_cfg.id is not null and v_cfg.points_enabled then
      v_cons := private.loyalty_consumption_cents(new);
      v_points := private.loyalty_points_for_cents(v_cons, v_cfg.points_per_real);
      if v_points > 0 then
        insert into private.loyalty_payment_credits(gateway_transaction_id, user_id, restaurant_id, consumption_cents, points)
          values (new.id, new.customer_id, new.restaurant_id, v_cons, v_points)
          on conflict do nothing;
        if found then
          insert into public.loyalty_programs(user_id, restaurant_id, points, total_visits, total_spent, tier, last_visit,
              rewards_claimed, available_rewards, awarded_order_ids, is_active, created_at, updated_at)
            values (new.customer_id, new.restaurant_id, v_points, 1, v_cons::numeric / 100,
              private.loyalty_tier_for(v_cons::numeric / 100, v_cfg), now(),
              '[]'::jsonb, '[]'::jsonb, new.id::text, true, now(), now())
          on conflict (user_id, restaurant_id) do update set
            points = public.loyalty_programs.points + v_points,
            total_visits = public.loyalty_programs.total_visits + 1,
            total_spent = public.loyalty_programs.total_spent + v_cons::numeric / 100,
            last_visit = now(),
            awarded_order_ids = coalesce(public.loyalty_programs.awarded_order_ids, '') || ',' || new.id::text,
            tier = private.loyalty_tier_for(public.loyalty_programs.total_spent + v_cons::numeric / 100, v_cfg),
            updated_at = now();
        end if;
      end if;
    end if;
  end if;

  if coalesce(new.refunded_amount_cents, 0) > coalesce(case when tg_op = 'UPDATE' then old.refunded_amount_cents end, 0) then
    select * into v_credit from private.loyalty_payment_credits where gateway_transaction_id = new.id for update;
    if v_credit.gateway_transaction_id is not null then
      v_rev := v_credit.points - private.loyalty_points_kept(v_credit.points, new.amount_cents, new.refunded_amount_cents) - v_credit.reversed_points;
      if v_rev > 0 then
        update private.loyalty_payment_credits set reversed_points = reversed_points + v_rev, updated_at = now()
          where gateway_transaction_id = new.id;
        update public.loyalty_programs set points = greatest(points - v_rev, 0), updated_at = now()
          where user_id = v_credit.user_id and restaurant_id = v_credit.restaurant_id;
      end if;
    end if;
  end if;
  return new;
end $function$;

-- 3. Tela do Dono: grava o programa e deixa rastro (antes/depois, autor, horário) na mesma transação.
-- Campo ausente no payload mantém o valor atual (ou o default da coluna, na criação).
CREATE OR REPLACE FUNCTION public.restaurant_upsert_loyalty_config(p_restaurant_id uuid, p_config jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare v_old public.loyalty_configs; v public.loyalty_configs; v_created boolean;
begin
  perform private.require_restaurant_role(p_restaurant_id, array['owner']::public.user_roles_role_enum[]);
  if coalesce((p_config->>'points_per_real')::numeric, 0) < 0 or coalesce((p_config->>'points_redemption_rate')::numeric, 0) < 0
     or coalesce((p_config->>'min_points_for_redemption')::numeric, 0) < 0
     or coalesce((p_config->>'cashback_percentage')::numeric, 0) not between 0 and 100 then
    raise exception 'Valores do programa inválidos' using errcode = '22023';
  end if;
  insert into public.loyalty_configs(restaurant_id, points_enabled, points_per_real, points_redemption_rate,
      min_points_for_redemption, cashback_enabled, cashback_percentage, created_at, updated_at)
    values (p_restaurant_id, false, 0, 0, 0, false, 0, now(), now())
    on conflict (restaurant_id) do nothing;
  v_created := found;
  select * into v_old from public.loyalty_configs where restaurant_id = p_restaurant_id for update;
  v := v_old;
  v.points_enabled := coalesce((p_config->>'points_enabled')::boolean, v_old.points_enabled, false);
  v.points_per_real := coalesce((p_config->>'points_per_real')::numeric, v_old.points_per_real, 0);
  v.points_redemption_rate := coalesce((p_config->>'points_redemption_rate')::numeric, v_old.points_redemption_rate, 0);
  v.min_points_for_redemption := coalesce((p_config->>'min_points_for_redemption')::numeric, v_old.min_points_for_redemption, 0);
  v.cashback_enabled := coalesce((p_config->>'cashback_enabled')::boolean, v_old.cashback_enabled, false);
  v.cashback_percentage := coalesce((p_config->>'cashback_percentage')::numeric, v_old.cashback_percentage, 0);
  v.tier_silver_min_cents := coalesce((p_config->>'tier_silver_min_cents')::bigint, v_old.tier_silver_min_cents);
  v.tier_gold_min_cents := coalesce((p_config->>'tier_gold_min_cents')::bigint, v_old.tier_gold_min_cents);
  v.tier_platinum_min_cents := coalesce((p_config->>'tier_platinum_min_cents')::bigint, v_old.tier_platinum_min_cents);
  if not (v.tier_silver_min_cents > 0 and v.tier_silver_min_cents < v.tier_gold_min_cents
          and v.tier_gold_min_cents < v.tier_platinum_min_cents) then
    raise exception 'Faixas devem ser crescentes: prata < ouro < platina' using errcode = '22023';
  end if;
  update public.loyalty_configs set
    points_enabled = v.points_enabled, points_per_real = v.points_per_real,
    points_redemption_rate = v.points_redemption_rate, min_points_for_redemption = v.min_points_for_redemption,
    cashback_enabled = v.cashback_enabled, cashback_percentage = v.cashback_percentage,
    tier_silver_min_cents = v.tier_silver_min_cents, tier_gold_min_cents = v.tier_gold_min_cents,
    tier_platinum_min_cents = v.tier_platinum_min_cents, updated_at = now()
  where id = v_old.id
  returning * into v;
  perform private.log_audit(p_restaurant_id, 'loyalty_config.updated', 'loyalty_config', v.id,
    'Programa de fidelidade alterado pelo dono',
    case when v_created then null else to_jsonb(v_old) end, to_jsonb(v));
  return to_jsonb(v);
end $function$;
revoke all on function public.restaurant_upsert_loyalty_config(uuid, jsonb) from public, anon;
grant execute on function public.restaurant_upsert_loyalty_config(uuid, jsonb) to authenticated;

-- 4. Cashback sobre o consumo do pagamento (sem gorjeta/taxa/conveniência), como os pontos.
CREATE OR REPLACE FUNCTION private.apply_customer_wallet_payment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_wallet_id uuid;
  v_wallet public.wallets;
  v_amount numeric := abs(coalesce(new.amount, new.amount_cents / 100));
  v_cashback_percentage numeric;
  v_cashback numeric;
  v_restaurant_name text;
begin
  if new.provider = 'simulated' then return new; end if;
  if new.customer_id is null or new.status <> 'completed' or v_amount <= 0 then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'completed' then return new; end if;

  v_wallet_id := private.ensure_customer_wallet(new.customer_id);
  select * into v_wallet from public.wallets where id = v_wallet_id for update;
  select name into v_restaurant_name from public.restaurants where id = new.restaurant_id;

  if new.payment_method = 'wallet' and not exists (
    select 1 from public.wallet_transactions
    where wallet_id = v_wallet_id and idempotency_key = 'wallet-payment:' || new.id::text
  ) then
    if v_wallet.balance < v_amount then
      raise exception 'Insufficient wallet balance' using errcode = 'P0001';
    end if;
    update public.wallets set balance = balance - v_amount, updated_at = now() where id = v_wallet_id;
    insert into public.wallet_transactions(
      wallet_id, transaction_type, amount, balance_before, balance_after,
      description, order_id, external_transaction_id, idempotency_key, metadata
    ) values (
      v_wallet_id, 'payment', -v_amount, v_wallet.balance, v_wallet.balance - v_amount,
      coalesce(v_restaurant_name, 'Pagamento'), new.order_id, new.id,
      'wallet-payment:' || new.id::text, jsonb_build_object('gateway_transaction_id', new.id)
    );
    v_wallet.balance := v_wallet.balance - v_amount;
  end if;

  select lc.cashback_percentage into v_cashback_percentage
  from public.loyalty_configs lc
  where lc.restaurant_id = new.restaurant_id and lc.cashback_enabled
  order by lc.updated_at desc limit 1;
  -- Centavos inteiros sobre o consumo; a carteira guarda reais.
  v_cashback := round(private.loyalty_consumption_cents(new) * coalesce(v_cashback_percentage, 0) / 100)::bigint / 100.0;

  if v_cashback > 0 and not exists (
    select 1 from public.wallet_transactions
    where wallet_id = v_wallet_id and idempotency_key = 'cashback:' || new.id::text
  ) then
    update public.wallets set balance = balance + v_cashback, updated_at = now() where id = v_wallet_id;
    insert into public.wallet_transactions(
      wallet_id, transaction_type, amount, balance_before, balance_after,
      description, order_id, external_transaction_id, idempotency_key, metadata
    ) values (
      v_wallet_id, 'cashback', v_cashback, v_wallet.balance, v_wallet.balance + v_cashback,
      'Cashback recebido', new.order_id, new.id, 'cashback:' || new.id::text,
      jsonb_build_object('gateway_transaction_id', new.id, 'restaurant_name', v_restaurant_name)
    );
  end if;
  return new;
end;
$function$;
