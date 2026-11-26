-- P1-1 / B15: pontos de fidelidade saem do PAGAMENTO confirmado, de cada pagamento, proporcional ao consumo
-- que ele cobriu (sem gorjeta/taxa e sem conveniência). Antes: quem fez o pedido levava tudo na entrega, sem pagar.
-- Idempotente pela chave da transação; estorno tira os pontos na mesma proporção.

drop trigger if exists trg_award_loyalty_on_completion on public.orders;
drop function if exists private.award_loyalty_on_operational_completion();

-- Um programa por restaurante: a tela do Dono grava por upsert.
create unique index if not exists loyalty_configs_restaurant_uq on public.loyalty_configs(restaurant_id);

-- Regra de arredondamento (única): pontos = piso(centavos de consumo × pontos_por_real / 100). Fração de ponto não é creditada.
create or replace function private.loyalty_points_for_cents(p_consumption_cents bigint, p_points_per_real numeric)
returns bigint language sql immutable as $$
  select greatest(floor(coalesce(p_consumption_cents, 0) * coalesce(p_points_per_real, 0) / 100), 0)::bigint $$;

-- Quanto do pagamento é consumo: o cobrado menos gorjeta e conveniência da NOOWE; na parte da comanda, só a base
-- da parte menos o cupom (a taxa de serviço vai por cima e não pontua).
create or replace function private.loyalty_consumption_cents(p_tx public.gateway_transactions)
returns bigint language sql stable as $$
  select greatest(least(
    coalesce(p_tx.amount_cents, 0) - coalesce(p_tx.tip_cents, 0) - coalesce(p_tx.convenience_cents, 0),
    coalesce((select s.base_cents - s.coupon_discount_cents from public.bill_shares s where s.id = p_tx.bill_share_id), p_tx.amount_cents)
  ), 0)::bigint $$;

-- Estorno proporcional: dos pontos dados, ficam piso(pontos × (cobrado − estornado) / cobrado).
create or replace function private.loyalty_points_kept(p_points bigint, p_amount_cents bigint, p_refunded_cents bigint)
returns bigint language sql immutable as $$
  select case when coalesce(p_amount_cents, 0) <= 0 then 0
    else floor(p_points::numeric * greatest(p_amount_cents - least(coalesce(p_refunded_cents, 0), p_amount_cents), 0) / p_amount_cents)::bigint end $$;

-- Um crédito por pagamento: a chave primária é o que impede o reenvio do webhook de creditar duas vezes.
create table if not exists private.loyalty_payment_credits (
  gateway_transaction_id uuid primary key references public.gateway_transactions(id) on delete cascade,
  user_id uuid not null,
  restaurant_id uuid not null,
  consumption_cents bigint not null,
  points bigint not null,
  reversed_points bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table private.loyalty_payment_credits enable row level security;

create or replace function private.loyalty_on_payment()
returns trigger language plpgsql security definer set search_path = public, private, pg_temp as $$
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
            values (new.customer_id, new.restaurant_id, v_points, 1, v_cons::numeric / 100, 'bronze', now(),
              '[]'::jsonb, '[]'::jsonb, new.id::text, true, now(), now())
          on conflict (user_id, restaurant_id) do update set
            points = public.loyalty_programs.points + v_points,
            total_visits = public.loyalty_programs.total_visits + 1,
            total_spent = public.loyalty_programs.total_spent + v_cons::numeric / 100,
            last_visit = now(),
            awarded_order_ids = coalesce(public.loyalty_programs.awarded_order_ids, '') || ',' || new.id::text,
            -- Faixas mantidas como já eram (loyalty_award_points).
            tier = case
              when (public.loyalty_programs.total_spent + v_cons::numeric / 100) >= 5000 then 'platinum'
              when (public.loyalty_programs.total_spent + v_cons::numeric / 100) >= 2000 then 'gold'
              when (public.loyalty_programs.total_spent + v_cons::numeric / 100) >= 500 then 'silver'
              else 'bronze' end,
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
end $$;

drop trigger if exists trg_loyalty_on_payment on public.gateway_transactions;
create trigger trg_loyalty_on_payment after insert or update of status, refunded_amount_cents on public.gateway_transactions
  for each row execute function private.loyalty_on_payment();

-- Tela do Dono: cria/edita o programa. Só o Dono grava.
create or replace function public.restaurant_upsert_loyalty_config(p_restaurant_id uuid, p_config jsonb)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v public.loyalty_configs;
begin
  perform private.require_restaurant_role(p_restaurant_id, array['owner']::public.user_roles_role_enum[]);
  if coalesce((p_config->>'points_per_real')::numeric, 0) < 0 or coalesce((p_config->>'points_redemption_rate')::numeric, 0) < 0
     or coalesce((p_config->>'min_points_for_redemption')::numeric, 0) < 0
     or coalesce((p_config->>'cashback_percentage')::numeric, 0) not between 0 and 100 then
    raise exception 'Valores do programa inválidos' using errcode = '22023';
  end if;
  insert into public.loyalty_configs(restaurant_id, points_enabled, points_per_real, points_redemption_rate,
      min_points_for_redemption, cashback_enabled, cashback_percentage, created_at, updated_at)
    values (p_restaurant_id, coalesce((p_config->>'points_enabled')::boolean, false), coalesce((p_config->>'points_per_real')::numeric, 0),
      coalesce((p_config->>'points_redemption_rate')::numeric, 0), coalesce((p_config->>'min_points_for_redemption')::numeric, 0),
      coalesce((p_config->>'cashback_enabled')::boolean, false), coalesce((p_config->>'cashback_percentage')::numeric, 0), now(), now())
  on conflict (restaurant_id) do update set
    points_enabled = excluded.points_enabled, points_per_real = excluded.points_per_real,
    points_redemption_rate = excluded.points_redemption_rate, min_points_for_redemption = excluded.min_points_for_redemption,
    cashback_enabled = excluded.cashback_enabled, cashback_percentage = excluded.cashback_percentage, updated_at = now()
  returning * into v;
  return to_jsonb(v);
end $$;
revoke all on function public.restaurant_upsert_loyalty_config(uuid, jsonb) from public, anon;
grant execute on function public.restaurant_upsert_loyalty_config(uuid, jsonb) to authenticated;

CREATE OR REPLACE FUNCTION public.restaurant_record_payment(p_order_id uuid, p_payment_method text, p_amount numeric, p_tip_amount numeric DEFAULT 0, p_notes text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_order record;
  v_updated_order record;
  v_tx_id uuid;
  v_existing record;
  v_key text;
  v_order_open bigint;
  v_order_total bigint;
begin
  select * into v_order from public.orders where id = p_order_id;
  if v_order.id is null then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  perform private.require_restaurant_role(
    v_order.restaurant_id,
    array['owner','manager','waiter','maitre','barman']::public.user_roles_role_enum[]
  );
  -- Barman cobra no balcão (pedido sem mesa). Garçom, nas mesas dele.
  if v_order.table_id is not null and not private.has_restaurant_role(v_order.restaurant_id, array['owner','manager','waiter','maitre']::public.user_roles_role_enum[]) then
    raise exception 'Restaurant access denied' using errcode = '42501'; end if;
  if not private.has_restaurant_role(v_order.restaurant_id, array['owner','manager','maitre']::public.user_roles_role_enum[])
     and exists (select 1 from public.tables t where t.id = v_order.table_id and t.assigned_waiter_id <> auth.uid()) then
    raise exception 'Esta mesa é de outro garçom' using errcode = '42501'; end if;

  -- Pedido de comanda aberta abate do saldo único: o valor vem do servidor, não do app (G5). Versões antigas chegam por aqui.
  if v_order.table_session_id is not null and exists (
      select 1 from public.table_sessions ts where ts.id = v_order.table_session_id and ts.status = 'active') then
    select nullif(coalesce(sum(l.open_cents), 0), 0)::bigint into v_order_open from private.session_lines(v_order.table_session_id) l
      join public.order_items oi on oi.id = l.order_item_id where oi.order_id = p_order_id;
    -- Sem isto a base nula significaria "o saldo inteiro da mesa".
    if v_order_open is null then raise exception 'Este pedido não tem consumo em aberto' using errcode = '22023'; end if;
    return public.restaurant_record_bill_payment(v_order.table_session_id, p_payment_method,
      md5(p_order_id::text || ':' || coalesce(p_idempotency_key, gen_random_uuid()::text))::uuid,
      v_order_open, false, round(coalesce(p_tip_amount, 0) * 100)::bigint);
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Invalid payment amount: %', p_amount using errcode = '22023';
  end if;

  -- O servidor confere o valor (invariante 2). Pedido sem total conhecido não tem o que conferir: fica como veio.
  v_order_total := coalesce(v_order.total_cents, round(coalesce(v_order.total_amount, v_order.subtotal) * 100)::bigint);
  if v_order_total is not null and round(p_amount * 100)::bigint <> v_order_total then
    raise exception 'O valor não confere com o pedido' using errcode = '22023';
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

  -- Dois toques com chaves diferentes não cobram duas vezes (invariante 10).
  if v_order.payment_status::text = 'confirmed' then
    raise exception 'Este pedido já foi pago' using errcode = '23505';
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
  if p_payment_method = 'cash' then
    perform private.cash_record(v_order.restaurant_id, 'sale', round(p_amount * 100)::bigint, 'Recebido no pedido', v_tx_id, p_order_id);
  end if;

  update public.orders
  set
    payment_method = p_payment_method,
    payment_status = 'confirmed',
    tip_amount     = coalesce(tip_amount, 0) + p_tip_amount,
    completed_at   = case when completed_at is null then now() else completed_at end,
    updated_at     = now()
  where id = p_order_id
  returning * into v_updated_order;

  -- Pontos de fidelidade saem do pagamento confirmado (gatilho em gateway_transactions), não daqui.

  return jsonb_build_object(
    'transaction_id', v_tx_id,
    'order_id', p_order_id,
    'payment_method', p_payment_method,
    'amount', p_amount,
    'tip_amount', p_tip_amount,
    'status', 'completed'
  );
end;
$function$;
