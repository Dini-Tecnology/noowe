-- O0: ajustes encontrados ao validar a fatia no app (docs/fatias/O0-correcoes-e-hold.md).
--  * Receita é o que foi pago: pedido só entregue, ainda na comanda aberta, não é receita.
--  * Pagamento registrado pelo garçom confirma o pedido, igual ao digital.
--  * Painel: ticket médio dividido pelos pedidos pagos, não por todos os do dia.
--  * Clientes: reserva futura aparece, mas não conta como visita.
--  * Fila do bar: bebida pronta segue visível até ser entregue.
--  * Entregar um prato não manda para Limpeza a mesa com comanda aberta.
--  * Apagar um restaurante não falha na auditoria do dono em cascata (ADR-015).

create or replace function private.counts_as_revenue(p_status text, p_payment_status text)
returns boolean language sql immutable as $$
  select coalesce(p_status, '') <> 'cancelled'
     and coalesce(p_payment_status, '') <> 'refunded'
     and (coalesce(p_payment_status, '') = 'confirmed' or coalesce(p_status, '') = 'completed')
$$;

-- Cobrança nova nasce sem estorno; quem insere não precisa informar.
alter table public.gateway_transactions alter column refunded_amount_cents set default 0;

-- Pagamentos já registrados à mão antes desta regra continuam contando como receita.
update public.orders o
set payment_status = 'confirmed', updated_at = now()
where o.payment_status = 'pending'
  and o.status::text <> 'cancelled'
  and exists (
    select 1 from public.gateway_transactions g
    where g.order_id = o.id and g.provider = 'manual' and g.status = 'completed'
  );

CREATE OR REPLACE FUNCTION public.restaurant_get_dashboard_snapshot(p_restaurant_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
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
    'paid_orders_today', (
      select count(*)
      from public.orders o
      where o.restaurant_id = p_restaurant_id
        and private.counts_as_revenue(o.status::text, o.payment_status::text)
        and o.created_at >= private.restaurant_day_start()
        and o.created_at < (private.restaurant_day_start() + interval '1 day')
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
$function$;

CREATE OR REPLACE FUNCTION public.restaurant_get_customers(p_restaurant_id uuid, p_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
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
           count(*) filter (where r.status::text in ('seated', 'completed')) as visits,
           min(r.reservation_time) as first_at,
           max(r.reservation_time) filter (where r.status::text in ('seated', 'completed')) as last_at
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
$function$;

CREATE OR REPLACE FUNCTION public.restaurant_get_bar_queue(p_restaurant_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  result jsonb;
begin
  perform private.require_restaurant_role(
    p_restaurant_id,
    array['owner','manager','barman','chef']::public.user_roles_role_enum[]
  );

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', oi.id,
      'order_id', o.id,
      'table_number', t.table_number,
      'customer_name', p.full_name,
      'name', coalesce(mi.name, 'Item'),
      'quantity', oi.quantity,
      'status', oi.status,
      'course', coalesce(oi.course, mi.course),
      'special_instructions', oi.special_instructions,
      'fire_at', oi.fire_at,
      'order_created_at', o.created_at,
      'created_at', oi.created_at
    ) order by coalesce(oi.fire_at, o.created_at) asc
  ), '[]'::jsonb)
  into result
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  left join public.menu_items mi on mi.id = oi.menu_item_id
  left join public.tables t on t.id = o.table_id
  left join public.profiles p on p.id = o.customer_id
  where o.restaurant_id = p_restaurant_id
    and o.status::text in ('confirmed','preparing','ready','open_for_additions')
    and oi.status::text in ('pending','preparing','ready')
    and (
      coalesce(oi.course, mi.course) = 'drink'
      or exists (
        select 1 from public.cook_stations cs
        where cs.id = coalesce(oi.station_id, mi.station_id)
          and cs.station_type in ('bar','drinks')
      )
    );

  return result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.restaurant_update_order_status_legacy_v1(p_order_id uuid, p_status text, p_estimated_time integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  target_order public.orders%rowtype;
  normalized_status text := lower(trim(p_status));
  updated_order public.orders%rowtype;
begin
  select * into target_order
  from public.orders
  where id = p_order_id
  for update;

  if target_order.id is null then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  perform private.require_restaurant_role(target_order.restaurant_id);

  if normalized_status = 'new' then
    normalized_status := 'pending';
  elsif normalized_status = 'picked_up' then
    normalized_status := 'delivered';
  end if;

  if not private.is_valid_order_status(normalized_status) then
    raise exception 'Invalid order status: %', p_status using errcode = '22023';
  end if;

  if not private.is_valid_restaurant_order_transition(target_order.status::text, normalized_status) then
    raise exception 'Invalid order status transition: % -> %', target_order.status, normalized_status
      using errcode = '23514';
  end if;

  update public.orders
  set
    status = normalized_status::public.orders_status_enum,
    estimated_time = coalesce(p_estimated_time, estimated_time),
    estimated_ready_at = case
      when p_estimated_time is not null then now() + make_interval(mins => p_estimated_time)
      else estimated_ready_at
    end,
    actual_ready_at = case
      when normalized_status = 'ready' then coalesce(actual_ready_at, now())
      else actual_ready_at
    end,
    completed_at = case
      when normalized_status in ('delivered', 'completed') then coalesce(completed_at, now())
      else completed_at
    end,
    updated_at = now()
  where id = p_order_id
  returning * into updated_order;

  if updated_order.table_id is not null and normalized_status in ('delivered', 'completed', 'cancelled') then
    update public.tables
    set
      status = case when normalized_status = 'cancelled' then status else 'cleaning' end,
      updated_at = now()
    where id = updated_order.table_id
      and restaurant_id = updated_order.restaurant_id
      -- Prato entregue não libera a mesa: com comanda aberta ela segue ocupada até a conta fechar.
      and not exists (
        select 1 from public.table_sessions ts
        where ts.table_id = updated_order.table_id and ts.status = 'active'
      );
  end if;

  return jsonb_build_object(
    'id', updated_order.id,
    'restaurant_id', updated_order.restaurant_id,
    'customer_id', updated_order.customer_id,
    'order_type', updated_order.order_type,
    'table_id', updated_order.table_id,
    'status', updated_order.status,
    'estimated_time', updated_order.estimated_time,
    'estimated_ready_at', updated_order.estimated_ready_at,
    'actual_ready_at', updated_order.actual_ready_at,
    'completed_at', updated_order.completed_at,
    'updated_at', updated_order.updated_at,
    'order_items', private.order_items_json(updated_order.id)
  );
end;
$function$;

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
    payment_status = 'confirmed',
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
$function$;

CREATE OR REPLACE FUNCTION private.user_roles_owner_after()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_kind text;
  v_restaurant uuid := case when tg_op = 'DELETE' then old.restaurant_id else new.restaurant_id end;
  v_row public.user_roles := case when tg_op = 'DELETE' then old else new end;
begin
  if pg_trigger_depth() > 1 or auth.uid() is null then return null; end if;
  -- Remoção em cascata do restaurante: não há o que transferir nem onde auditar.
  if not exists (select 1 from public.restaurants r where r.id = v_restaurant) then return null; end if;

  v_kind := private.user_roles_owner_change_kind(
    tg_op,
    case when tg_op = 'INSERT' then null else old end,
    case when tg_op = 'DELETE' then null else new end);
  if v_kind is null then return null; end if;

  -- O dono registrado em restaurants.owner_id saiu: passa para outro dono ativo (o mais antigo).
  if v_kind = 'revoked' then
    update public.restaurants r
      set owner_id = (
        select o.user_id from public.user_roles o
        where o.restaurant_id = v_restaurant and o.role = 'owner' and o.is_active
        order by o.created_at, o.id limit 1)
      where r.id = v_restaurant and r.owner_id = old.user_id
        and exists (select 1 from public.user_roles o
                    where o.restaurant_id = v_restaurant and o.role = 'owner' and o.is_active);
  end if;

  -- has_restaurant_role também lê profile_roles (o papel de dono do cadastro original mora lá):
  -- sem isto, quem perdeu o papel em user_roles continuaria com acesso de dono.
  if v_kind = 'revoked' then
    update public.profile_roles
      set is_active = false, updated_at = now()
      where user_id = old.user_id and restaurant_id = v_restaurant and role_key = 'owner' and is_active;
  end if;

  perform private.log_audit(
    v_restaurant,
    case v_kind when 'granted' then 'owner_granted' else 'owner_revoked' end,
    'user_roles', v_row.id,
    case v_kind when 'granted' then 'Dono adicionado ao restaurante' else 'Dono removido do restaurante' end,
    case when tg_op = 'INSERT' then null else jsonb_build_object('user_id', old.user_id, 'role', old.role, 'is_active', old.is_active) end,
    case when tg_op = 'DELETE' then null else jsonb_build_object('user_id', new.user_id, 'role', new.role, 'is_active', new.is_active) end);
  return null;
end $function$;
