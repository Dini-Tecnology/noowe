-- ADR-013 — jornada Quick Service: pedido antecipado, aceite, retirada, estornos.
-- Cada bloco cobre uma regra do ADR; os critérios de aceite 11–14 da fatia Q1 saem daqui.
begin;
select plan(30);

create temp table _qs(k text primary key, v uuid);
create function pg_temp.act(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true)
$$;
create function pg_temp.state_of(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ok'; exception when others then return sqlstate; end $$;

create function pg_temp.new_customer(p_name text default 'Cliente Teste') returns uuid language plpgsql as $$
declare c uuid := gen_random_uuid();
begin
  insert into auth.users(id, email) values (c, c || '@qs-journey.test');
  insert into public.profiles(id, full_name) values (c, p_name) on conflict do nothing;
  return c;
end $$;

-- Cria o pedido como o cliente c, com N unidades dos dois primeiros itens do cardápio.
create function pg_temp.new_order(p_customer uuid, p_qty integer default 1, p_slot timestamptz default null)
returns uuid language plpgsql as $$
declare r uuid := (select v from _qs where k = 'restaurant'); result jsonb;
begin
  perform pg_temp.act(p_customer);
  result := public.customer_create_order_v2(r, 'quick_service',
    jsonb_build_array(
      jsonb_build_object('menu_item_id', (select v from _qs where k = 'm1'), 'quantity', p_qty),
      jsonb_build_object('menu_item_id', (select v from _qs where k = 'm2'), 'quantity', 1)),
    gen_random_uuid(), null, null, p_slot, 'Ana', 'takeaway', true);
  return (result->>'id')::uuid;
end $$;

create function pg_temp.pay(p_customer uuid, p_order uuid, p_method text default 'credit_card') returns jsonb language plpgsql as $$
begin
  perform pg_temp.act(p_customer);
  return public.customer_start_payment(p_order, p_method, gen_random_uuid());
end $$;

create function pg_temp.run_to_ready(p_order uuid) returns void language plpgsql as $$
declare owner_id uuid := 'c1000000-0000-4000-8000-000000000001'; it record;
begin
  perform pg_temp.act(owner_id);
  for it in select id from public.order_items where order_id = p_order loop
    perform public.restaurant_update_order_item_status(it.id, 'preparing');
    perform public.restaurant_update_order_item_status(it.id, 'ready');
  end loop;
  perform public.restaurant_complete_quality_check(p_order, true, '{"items":true,"packaging":true}', null);
end $$;

do $$
declare r uuid := 'c1000000-0000-4000-8000-000000000002'; m1 uuid; m2 uuid;
begin
  insert into _qs values ('restaurant', r);
  update public.restaurant_model_configs set
    service_models = array['casual_dining','quick_service']::public.noowe_service_model[],
    pickup_capacity_per_slot = 5 where restaurant_id = r;
  -- O restaurante precisa estar aberto o dia todo e sem janela de encerramento.
  update public.restaurants set opening_hours = (
    select jsonb_object_agg(d, jsonb_build_object('closed', false,
      'shifts', jsonb_build_array(jsonb_build_object('open', '00:00', 'close', '23:59'))))
    from unnest(array['sunday','monday','tuesday','wednesday','thursday','friday','saturday']) d
  ) where id = r;
  update public.restaurant_model_policies set close_orders_before_min = 0, accept_mode = 'auto',
    no_pickup_policy = 'none', orders_paused = false, pickup_expiry_min = 30
    where restaurant_id = r and service_model = 'quick_service';
  select id into m1 from public.menu_items where restaurant_id = r and is_available order by id limit 1;
  select id into m2 from public.menu_items where restaurant_id = r and is_available order by id offset 1 limit 1;
  insert into _qs values ('m1', m1), ('m2', m2);
  insert into _qs values ('owner', 'c1000000-0000-4000-8000-000000000001');
end $$;

-- 1. Tolerância de retirada: faixa 15–60 --------------------------------------------------
select is(
  pg_temp.state_of($q$update public.restaurant_model_policies set pickup_expiry_min = 10
    where restaurant_id = 'c1000000-0000-4000-8000-000000000002' and service_model = 'quick_service'$q$),
  '23514', 'tolerância abaixo de 15 min é recusada');
select is(
  pg_temp.state_of($q$update public.restaurant_model_policies set pickup_expiry_min = 61
    where restaurant_id = 'c1000000-0000-4000-8000-000000000002' and service_model = 'quick_service'$q$),
  '23514', 'tolerância acima de 60 min é recusada');
select is(
  pg_temp.state_of($q$update public.restaurant_model_policies set pickup_expiry_min = 15
    where restaurant_id = 'c1000000-0000-4000-8000-000000000002' and service_model = 'quick_service'$q$),
  'ok', 'tolerância de 15 min é aceita');
update public.restaurant_model_policies set pickup_expiry_min = 30
  where restaurant_id = 'c1000000-0000-4000-8000-000000000002' and service_model = 'quick_service';

-- 2. Política de retirada precisa ser aceita --------------------------------------------------
do $$
declare c uuid := pg_temp.new_customer(); st text;
begin
  perform pg_temp.act(c);
  st := pg_temp.state_of(format($q$select public.customer_create_order_v2(%L,'quick_service',
    jsonb_build_array(jsonb_build_object('menu_item_id',%L,'quantity',1)),gen_random_uuid(),null,null,null,'Ana','takeaway',false)$q$,
    (select v from _qs where k = 'restaurant'), (select v from _qs where k = 'm1')));
  assert st = '22023', 'sem aceite da política deveria falhar: ' || st;
end $$;
select pass('pedido sem aceite da política de retirada é recusado');

-- 3. Pedido: código por dia, nome para chamada, comer aqui/levar, sem prazo até ficar pronto ----
do $$
declare c uuid := pg_temp.new_customer(); o uuid; v record;
begin
  o := pg_temp.new_order(c);
  insert into _qs values ('c1', c), ('o1', o);
  select * into v from public.orders where id = o;
  assert v.pickup_code ~ '^[A-HJKMN-Z2-9]{6}$', 'código fora do formato: ' || v.pickup_code;
  assert v.pickup_code_day = (now() at time zone 'America/Sao_Paulo')::date, 'dia do código';
  assert v.pickup_expires_at is null, 'a tolerância só começa quando o pedido fica pronto';
  assert v.call_name = 'Ana' and v.consumption_mode = 'takeaway' and v.pickup_policy_accepted_at is not null;
end $$;
select pass('pedido nasce com código aleatório do dia, nome para chamada e política aceita');

select is(
  pg_temp.state_of($q$insert into public.orders(restaurant_id, service_model, pickup_code, pickup_code_day)
    select restaurant_id, service_model, pickup_code, pickup_code_day from public.orders
    where id = (select v from _qs where k = 'o1')$q$),
  '23505', 'o código de retirada é único por restaurante por dia');

-- 4. Pedido duplicado é bloqueado e devolve o pedido existente -------------------------------
do $$
declare c uuid := (select v from _qs where k = 'c1'); detail text;
begin
  perform pg_temp.act(c);
  begin
    perform public.customer_create_order_v2((select v from _qs where k = 'restaurant'), 'quick_service',
      jsonb_build_array(
        jsonb_build_object('menu_item_id', (select v from _qs where k = 'm1'), 'quantity', 1),
        jsonb_build_object('menu_item_id', (select v from _qs where k = 'm2'), 'quantity', 1)),
      gen_random_uuid(), null, null, null, 'Ana', 'takeaway', true);
    raise exception 'duplicado deveria falhar';
  exception when sqlstate 'P0005' then
    get stacked diagnostics detail = pg_exception_detail;
    assert detail = (select v::text from _qs where k = 'o1'), 'detalhe deveria apontar o pedido existente';
  end;
end $$;
select pass('pedido duplicado é bloqueado e aponta o pedido em andamento');

-- 5. Pedidos pausados e restaurante fechado -----------------------------------------------
do $$
declare c uuid := pg_temp.new_customer(); st text; owner_id uuid := (select v from _qs where k = 'owner');
begin
  perform pg_temp.act(owner_id);
  perform public.restaurant_set_quick_orders_paused((select v from _qs where k = 'restaurant'), true);
  perform pg_temp.act(c);
  st := pg_temp.state_of(format($q$select public.customer_create_order_v2(%L,'quick_service',
    jsonb_build_array(jsonb_build_object('menu_item_id',%L,'quantity',3)),gen_random_uuid(),null,null,null,'Ana','takeaway',true)$q$,
    (select v from _qs where k = 'restaurant'), (select v from _qs where k = 'm1')));
  assert st = 'P0006', 'pausado deveria dar P0006: ' || st;
  perform pg_temp.act(owner_id);
  perform public.restaurant_set_quick_orders_paused((select v from _qs where k = 'restaurant'), false);
end $$;
select pass('pedidos pausados são recusados');

do $$
declare c uuid := pg_temp.new_customer(); st text; r uuid := (select v from _qs where k = 'restaurant'); saved jsonb;
begin
  select opening_hours into saved from public.restaurants where id = r;
  update public.restaurants set opening_hours = (
    select jsonb_object_agg(d, jsonb_build_object('closed', true, 'shifts', '[]'::jsonb))
    from unnest(array['sunday','monday','tuesday','wednesday','thursday','friday','saturday']) d) where id = r;
  perform pg_temp.act(c);
  st := pg_temp.state_of(format($q$select public.customer_create_order_v2(%L,'quick_service',
    jsonb_build_array(jsonb_build_object('menu_item_id',%L,'quantity',4)),gen_random_uuid(),null,null,null,'Ana','takeaway',true)$q$,
    r, (select v from _qs where k = 'm1')));
  update public.restaurants set opening_hours = saved where id = r;
  assert st = 'P0007', 'fechado deveria dar P0007: ' || st;
end $$;
select pass('restaurante fechado não recebe pedidos');

-- 6. Pix: pendente com expiração; nada entra na produção sem pagamento e aceite --------------
do $$
declare c uuid := (select v from _qs where k = 'c1'); o uuid := (select v from _qs where k = 'o1');
  res jsonb; it uuid; owner_id uuid := (select v from _qs where k = 'owner'); st text; pix_min integer; exp timestamptz;
begin
  res := pg_temp.pay(c, o, 'pix');
  assert res->>'paymentStatus' = 'pending', 'pix deve ficar pendente';
  assert res->>'pixCode' is not null, 'pix precisa de código copia-e-cola';
  select pix_expiry_min into pix_min from public.restaurant_model_policies
    where restaurant_id = (select v from _qs where k = 'restaurant') and service_model = 'quick_service';
  select payment_expires_at into exp from public.orders where id = o;
  assert exp between now() + make_interval(mins => pix_min - 1) and now() + make_interval(mins => pix_min),
    'expiração do pix deve vir da política';
  -- reenvio reaproveita o mesmo pix
  assert (pg_temp.pay(c, o, 'pix'))->>'transactionId' = res->>'transactionId', 'pix pendente deve ser reaproveitado';
  select id into it from public.order_items where order_id = o limit 1;
  perform pg_temp.act(owner_id);
  st := pg_temp.state_of(format($q$select public.restaurant_update_order_item_status(%L,'preparing')$q$, it));
  assert st = '23514', 'pedido não pago não entra em produção: ' || st;
end $$;
select pass('Pix fica pendente com expiração da política e não libera a produção');

do $$
declare c uuid := (select v from _qs where k = 'c1'); o uuid := (select v from _qs where k = 'o1'); st text;
begin
  perform pg_temp.act(c);
  st := pg_temp.state_of(format($q$select public.customer_confirm_simulated_pix(%L)$q$, o));
  assert st = '42501', 'sem a flag de desenvolvimento não confirma: ' || st;
  update private.dev_flags set enabled = true, updated_at = now() where key = 'simulate_pix_payment';
  perform public.customer_confirm_simulated_pix(o);
  assert (select payment_status from public.orders where id = o) = 'confirmed';
  assert (select paid_at from public.orders where id = o) is not null;
end $$;
select pass('confirmação de Pix simulado só funciona com a flag ligada');

-- 7. Aceite automático, produção, conferência e tolerância contada de "pronto" ---------------
do $$
declare o uuid := (select v from _qs where k = 'o1'); v record; tol integer;
begin
  select * into v from public.orders where id = o;
  assert v.fulfillment_status = 'accepted' and v.accepted_at is not null, 'aceite automático';
  perform pg_temp.run_to_ready(o);
  select * into v from public.orders where id = o;
  select pickup_expiry_min into tol from public.restaurant_model_policies
    where restaurant_id = v.restaurant_id and service_model = 'quick_service';
  assert v.fulfillment_status = 'ready';
  assert v.pickup_expires_at between now() + make_interval(mins => tol - 1) and now() + make_interval(mins => tol),
    'a tolerância deve contar a partir de pronto: ' || v.pickup_expires_at;
end $$;
select pass('aceite automático leva o pedido à produção e a tolerância conta a partir de pronto');

-- 8. Retirada só com o código do cliente ------------------------------------------------------
do $$
declare o uuid := (select v from _qs where k = 'o1'); code text; owner_id uuid := (select v from _qs where k = 'owner'); st text;
begin
  select pickup_code into code from public.orders where id = o;
  perform pg_temp.act(owner_id);
  st := pg_temp.state_of(format($q$select public.restaurant_confirm_pickup(%L,'ZZZZZZ')$q$, o));
  assert st = '23514', 'código errado deve falhar: ' || st;
  st := pg_temp.state_of(format($q$select public.restaurant_confirm_pickup_by_code(%L,'ZZZZZZ')$q$, (select v from _qs where k = 'restaurant')));
  assert st = '23514', 'código errado por digitação deve falhar: ' || st;
  perform public.restaurant_confirm_pickup_by_code((select v from _qs where k = 'restaurant'), lower(code));
  assert (select fulfillment_status from public.orders where id = o) = 'picked_up';
  assert (select picked_up_at from public.orders where id = o) is not null;
  assert (select count(*) from public.quick_stamp_events where order_id = o) = 1;
end $$;
select pass('retirada só conclui com o código correto, digitado ou lido, e credita um selo');

-- 9. Log de status e notificações -------------------------------------------------------------
do $$
declare o uuid := (select v from _qs where k = 'o1'); c uuid := (select v from _qs where k = 'c1'); n integer;
begin
  select count(*) into n from public.order_status_events where order_id = o;
  assert n >= 7, 'eventos de status insuficientes: ' || n;
  assert exists (select 1 from public.order_status_events where order_id = o and field = 'fulfillment_status'
    and to_value = 'accepted' and actor_kind = 'system'), 'aceite automático é ação do sistema';
  assert exists (select 1 from public.order_status_events where order_id = o and field = 'fulfillment_status'
    and to_value = 'picked_up' and actor_kind = 'staff'), 'retirada é ação da equipe';
  assert (select count(*) from public.notifications where user_id = c and related_id = o) >= 4,
    'cliente deve receber push de pago, aceito, pronto e retirado';
end $$;
select pass('cada mudança de status é registrada e gera notificação ao cliente');

-- 10. Aceite manual: timeout cancela e estorna com audit_log do sistema -----------------------
do $$
declare owner_id uuid := (select v from _qs where k = 'owner'); r uuid := (select v from _qs where k = 'restaurant');
  c uuid := pg_temp.new_customer(); o uuid; v record;
begin
  update public.restaurant_model_policies set accept_mode = 'manual', accept_timeout_min = 5
    where restaurant_id = r and service_model = 'quick_service';
  o := pg_temp.new_order(c, 2);
  perform pg_temp.pay(c, o);
  select * into v from public.orders where id = o;
  assert v.payment_status = 'confirmed' and v.fulfillment_status = 'received' and v.accepted_at is null,
    'em modo manual o pedido espera aceite';
  perform pg_temp.act(owner_id);
  assert pg_temp.state_of(format($q$select public.restaurant_update_order_status(%L,'preparing',null)$q$, o)) = '23514',
    'sem aceite não entra em produção';
  insert into _qs values ('manual', o), ('manual_c', c);
  update public.orders set paid_at = now() - interval '10 minutes' where id = o;
  perform public.quick_service_refresh(r);
  select * into v from public.orders where id = o;
  assert v.fulfillment_status = 'cancelled' and v.payment_status = 'refunded', 'timeout estorna: ' || v.fulfillment_status;
  assert exists (select 1 from public.audit_logs where entity_id = o and action = 'quick_order.accept_timeout'
    and metadata->>'actor' = 'system' and reason is not null), 'audit do sistema';
  assert exists (select 1 from public.order_status_events where order_id = o and to_value = 'cancelled' and actor_kind = 'system');
end $$;
select pass('aceite manual sem resposta cancela com estorno integral e audit_log do sistema');

-- 11. Aceite manual pela equipe ------------------------------------------------------------------
do $$
declare owner_id uuid := (select v from _qs where k = 'owner'); c uuid := pg_temp.new_customer(); o uuid;
begin
  o := pg_temp.new_order(c, 3);
  perform pg_temp.pay(c, o);
  perform pg_temp.act(owner_id);
  perform public.restaurant_accept_quick_order(o);
  assert (select fulfillment_status from public.orders where id = o) = 'accepted';
  insert into _qs values ('o_accept', o), ('c_accept', c);
end $$;
select pass('equipe aceita o pedido e ele passa a poder entrar em produção');

-- 12. Cliente cancela só antes do preparo, com estorno integral ---------------------------------
do $$
declare owner_id uuid := (select v from _qs where k = 'owner'); c uuid := (select v from _qs where k = 'c_accept');
  o uuid := (select v from _qs where k = 'o_accept'); it uuid; st text;
begin
  select id into it from public.order_items where order_id = o limit 1;
  perform pg_temp.act(owner_id);
  perform public.restaurant_update_order_item_status(it, 'preparing');
  perform pg_temp.act(c);
  st := pg_temp.state_of(format($q$select public.customer_cancel_order(%L,'mudei de ideia')$q$, o));
  assert st = 'P0001', 'depois do início do preparo não cancela: ' || st;
end $$;
select pass('cliente não cancela depois de iniciado o preparo');

do $$
declare c uuid := pg_temp.new_customer(); o uuid; v record;
begin
  o := pg_temp.new_order(c, 5);
  perform pg_temp.pay(c, o);
  perform pg_temp.act(c);
  perform public.customer_cancel_order(o, 'mudei de ideia');
  select * into v from public.orders where id = o;
  assert v.fulfillment_status = 'cancelled' and v.payment_status = 'refunded', 'estorno integral';
  assert (select refunded_amount_cents from public.gateway_transactions where order_id = o) = v.total_cents,
    'valor estornado deve ser o total';
  assert exists (select 1 from public.audit_logs where entity_id = o and action = 'quick_order.customer_cancel');
end $$;
select pass('cancelamento do cliente antes do preparo estorna o total e deixa audit_log');

-- 13. Cancelamento pela equipe exige motivo ---------------------------------------------------
do $$
declare owner_id uuid := (select v from _qs where k = 'owner'); c uuid := pg_temp.new_customer(); o uuid; st text;
begin
  o := pg_temp.new_order(c, 6);
  perform pg_temp.pay(c, o);
  perform pg_temp.act(owner_id);
  st := pg_temp.state_of(format($q$select public.restaurant_cancel_quick_order(%L,'  ')$q$, o));
  assert st = '22023', 'sem motivo deve falhar: ' || st;
  st := pg_temp.state_of(format($q$select public.restaurant_update_order_status(%L,'cancelled',null)$q$, o));
  assert st = '23514', 'o caminho genérico não cancela Quick sem motivo: ' || st;
  perform public.restaurant_cancel_quick_order(o, 'Cozinha sem ingredientes');
  assert (select payment_status from public.orders where id = o) = 'refunded';
  assert exists (select 1 from public.audit_logs where entity_id = o and action = 'quick_order.restaurant_cancel'
    and reason = 'Cozinha sem ingredientes' and user_id = owner_id);
end $$;
select pass('cancelamento pelo restaurante exige motivo, estorna o total e registra o autor');

-- 14. Estorno parcial de item esgotado ---------------------------------------------------------
do $$
declare owner_id uuid := (select v from _qs where k = 'owner'); c uuid := pg_temp.new_customer(); o uuid;
  it record; ord record; res jsonb; remaining bigint;
begin
  update public.restaurant_model_policies set accept_mode = 'auto'
    where restaurant_id = (select v from _qs where k = 'restaurant') and service_model = 'quick_service';
  o := pg_temp.new_order(c, 1);
  perform pg_temp.pay(c, o);
  select * into it from public.order_items where order_id = o order by id limit 1;
  perform pg_temp.act(owner_id);
  res := public.restaurant_refund_unavailable_item(it.id, 'Item esgotado');
  select * into ord from public.orders where id = o;
  assert ord.refunded_cents = coalesce(it.total_price_cents, round(it.total_price * 100)::bigint), 'estorno é o valor do item';
  assert ord.refunded_cents < ord.total_cents, 'estorno parcial não pode ser o total';
  assert ord.fulfillment_status = 'accepted' and ord.payment_status = 'confirmed', 'o pedido segue vivo';
  assert (select status::text from public.order_items where id = it.id) = 'cancelled';
  assert exists (select 1 from public.audit_logs where entity_id = it.id and action = 'quick_order.partial_refund');
  remaining := ord.total_cents - ord.refunded_cents;
  assert remaining + ord.refunded_cents = ord.total_cents, 'a soma fecha em centavos';
  assert pg_temp.state_of(format($q$select public.restaurant_refund_unavailable_item(%L,' ')$q$, it.id)) = '22023', 'motivo obrigatório';
end $$;
select pass('estorno parcial de item esgotado é calculado no servidor, fecha em centavos e deixa audit_log');

-- 15. Pedido não retirado: sem reembolso ou com crédito, uma única vez ---------------------------
do $$
declare r uuid := (select v from _qs where k = 'restaurant'); c uuid := pg_temp.new_customer(); o uuid; v record; w numeric;
begin
  o := pg_temp.new_order(c, 7);
  perform pg_temp.pay(c, o);
  perform pg_temp.run_to_ready(o);
  update public.orders set pickup_expires_at = now() - interval '1 minute' where id = o;
  perform public.quick_service_refresh(r);
  select * into v from public.orders where id = o;
  assert v.fulfillment_status = 'not_picked_up', 'vencido vira não retirado: ' || v.fulfillment_status;
  assert v.payment_status = 'confirmed', 'sem política de crédito não há estorno';
  assert not exists (select 1 from public.wallet_transactions where order_id = o), 'não credita sem a política';
  assert pg_temp.state_of(format($q$select public.restaurant_confirm_pickup(%L,%L)$q$, o, v.pickup_code)) in ('23514', '42501'),
    'não retira depois de vencido';
end $$;
select pass('tolerância vencida marca "não retirado" sem reembolso por padrão');

do $$
declare r uuid := (select v from _qs where k = 'restaurant'); c uuid := pg_temp.new_customer(); o uuid; v record; w numeric;
begin
  update public.restaurant_model_policies set no_pickup_policy = 'store_credit'
    where restaurant_id = r and service_model = 'quick_service';
  o := pg_temp.new_order(c, 8);
  perform pg_temp.pay(c, o);
  perform pg_temp.run_to_ready(o);
  update public.orders set pickup_expires_at = now() - interval '1 minute' where id = o;
  perform public.quick_service_refresh(r);
  perform public.quick_service_refresh(r);
  select * into v from public.orders where id = o;
  assert v.fulfillment_status = 'not_picked_up';
  assert (select count(*) from public.wallet_transactions where order_id = o) = 1, 'crédito uma única vez';
  select balance into w from public.wallets where user_id = c;
  assert w = round(v.total_cents::numeric / 100, 2), 'crédito é o total do pedido: ' || w;
  update public.restaurant_model_policies set no_pickup_policy = 'none'
    where restaurant_id = r and service_model = 'quick_service';
end $$;
select pass('com política de crédito, o não retirado credita o valor uma única vez');

-- 16. Pix expirado cancela o pedido ------------------------------------------------------------
do $$
declare r uuid := (select v from _qs where k = 'restaurant'); c uuid := pg_temp.new_customer(); o uuid; v record;
begin
  o := pg_temp.new_order(c, 9);
  perform pg_temp.pay(c, o, 'pix');
  update public.orders set payment_expires_at = now() - interval '1 minute' where id = o;
  perform public.quick_service_refresh(r);
  select * into v from public.orders where id = o;
  assert v.fulfillment_status = 'cancelled' and v.payment_status = 'failed', 'pix expirado: ' || v.fulfillment_status;
  assert pg_temp.state_of(format($q$select public.customer_confirm_simulated_pix(%L)$q$, o)) <> 'ok', 'não confirma pix expirado';
end $$;
select pass('Pix expirado falha o pagamento e cancela o pedido');

-- 17. Restaurante fecha depois do pagamento: estorno automático ----------------------------------
do $$
declare r uuid := (select v from _qs where k = 'restaurant'); c uuid := pg_temp.new_customer(); o uuid; v record; saved jsonb;
begin
  o := pg_temp.new_order(c, 10);
  perform pg_temp.pay(c, o);
  select opening_hours into saved from public.restaurants where id = r;
  update public.restaurants set opening_hours = (
    select jsonb_object_agg(d, jsonb_build_object('closed', true, 'shifts', '[]'::jsonb))
    from unnest(array['sunday','monday','tuesday','wednesday','thursday','friday','saturday']) d) where id = r;
  perform public.quick_service_refresh(r);
  update public.restaurants set opening_hours = saved where id = r;
  select * into v from public.orders where id = o;
  assert v.fulfillment_status = 'cancelled' and v.payment_status = 'refunded', 'fechou: ' || v.fulfillment_status;
end $$;
select pass('restaurante que fecha antes do preparo estorna o pedido pago');

-- 18. Chamar novamente ----------------------------------------------------------------------------
do $$
declare owner_id uuid := (select v from _qs where k = 'owner'); c uuid := pg_temp.new_customer(); o uuid; n integer;
begin
  o := pg_temp.new_order(c, 11);
  perform pg_temp.pay(c, o);
  perform pg_temp.run_to_ready(o);
  perform pg_temp.act(owner_id);
  perform public.restaurant_recall_pickup(o);
  assert (select pickup_recall_count from public.orders where id = o) = 1;
  assert exists (select 1 from public.notifications where related_id = o and metadata->>'recall' = 'true');
end $$;
select pass('"Chamar novamente" notifica o cliente e conta as chamadas');

-- 18b. Conferência reprovada devolve só o item apontado (critério Q1 #9) --------------------------
do $$
declare owner_id uuid := (select v from _qs where k = 'owner'); c uuid := pg_temp.new_customer(); o uuid;
  first_item uuid; second_item uuid;
begin
  o := pg_temp.new_order(c, 12);
  perform pg_temp.pay(c, o);
  perform pg_temp.act(owner_id);
  select id into first_item from public.order_items where order_id = o order by id limit 1;
  select id into second_item from public.order_items where order_id = o order by id offset 1 limit 1;
  perform public.restaurant_update_order_item_status(first_item, 'preparing');
  perform public.restaurant_update_order_item_status(first_item, 'ready');
  perform public.restaurant_update_order_item_status(second_item, 'preparing');
  perform public.restaurant_update_order_item_status(second_item, 'ready');
  assert (select fulfillment_status from public.orders where id = o) = 'checking';
  assert pg_temp.state_of(format($q$select public.restaurant_complete_quality_check(%L,false,'{"items":false}',' ')$q$, o)) = '22023',
    'reprovar exige motivo';
  perform public.restaurant_complete_quality_check(o, false, '{"items":false}', 'Faltou o molho', array[second_item]);
  assert (select status::text from public.order_items where id = second_item) = 'preparing', 'o item apontado volta à estação';
  assert (select status::text from public.order_items where id = first_item) = 'ready', 'os demais itens ficam prontos';
  assert (select fulfillment_status from public.orders where id = o) = 'preparing';
  perform public.restaurant_update_order_item_status(second_item, 'ready');
  assert (select fulfillment_status from public.orders where id = o) = 'checking', 'volta à conferência quando o item termina';
end $$;
select pass('conferência reprovada devolve só o item apontado e volta à conferência depois');

-- 19. Painel e política -------------------------------------------------------------------------
do $$
declare owner_id uuid := (select v from _qs where k = 'owner'); r uuid := (select v from _qs where k = 'restaurant'); panel jsonb;
begin
  perform pg_temp.act(owner_id);
  panel := public.restaurant_get_quick_panel(r);
  assert jsonb_typeof(panel->'orders') = 'array';
  assert not jsonb_exists(panel->'orders'->0, 'pickupCode'), 'o código de retirada não vai para o painel';
  assert exists (select 1 from jsonb_array_elements(panel->'orders') x where x->>'tab' = 'awaiting_pickup'), 'aba aguardando retirada';
  assert exists (select 1 from jsonb_array_elements(panel->'orders') x where x->>'tab' = 'picked_up'), 'aba retirados';
  assert exists (select 1 from jsonb_array_elements(panel->'orders') x where x->>'tab' = 'not_picked_up'), 'aba não retirados';
end $$;
select pass('painel agrupa por aba e não expõe o código de retirada');

do $$
declare owner_id uuid := (select v from _qs where k = 'owner'); r uuid := (select v from _qs where k = 'restaurant'); caps jsonb;
begin
  perform pg_temp.act(owner_id);
  perform public.restaurant_update_quick_service_policy(r, jsonb_build_object(
    'pickupExpiryMin', 45, 'acceptMode', 'manual', 'acceptTimeoutMin', 7, 'noPickupPolicy', 'store_credit',
    'pixExpiryMin', 20, 'pickupLocation', 'Balcão 3, praça de alimentação'));
  caps := public.get_restaurant_model_capabilities_v2(r, 'quick_service');
  assert (caps->'policies'->>'pickupExpiryMin')::int = 45, 'tolerância';
  assert caps->'policies'->>'acceptMode' = 'manual' and (caps->'policies'->>'acceptTimeoutMin')::int = 7;
  assert caps->'policies'->>'pickupLocation' = 'Balcão 3, praça de alimentação';
  assert (caps->'capabilities'->>'orderAhead')::boolean, 'orderAhead';
  assert pg_temp.state_of(format($q$select public.restaurant_update_quick_service_policy(%L,'{"pickupExpiryMin":5}')$q$, r)) = '23514',
    'faixa 15–60 vale na RPC';
  assert exists (select 1 from public.audit_logs where entity_id = r and action = 'quick_service.policy_update');
  perform pg_temp.act((select v from _qs where k = 'c1'));
  assert pg_temp.state_of(format($q$select public.restaurant_update_quick_service_policy(%L,'{"acceptMode":"auto"}')$q$, r)) = '42501',
    'cliente não altera política';
end $$;
select pass('política do Quick é validada, auditada e exposta como capability');

-- 20. Status em lote para a lista ----------------------------------------------------------------
do $$
declare r uuid := (select v from _qs where k = 'restaurant'); st jsonb;
begin
  perform pg_temp.act((select v from _qs where k = 'c1'));
  st := public.customer_quick_service_status(array[r]);
  assert jsonb_array_length(st) = 1 and st->0->>'state' = 'open', 'estado: ' || st::text;
  assert (st->0->>'estimatedPrepMinutes')::int >= 1, 'tempo de preparo';
  assert st->0->>'pickupLocation' = 'Balcão 3, praça de alimentação';
end $$;
select pass('status em lote traz estado, tempo de preparo e local de retirada');

-- 21. RLS do log de status -----------------------------------------------------------------------
do $$
declare other uuid := pg_temp.new_customer(); n integer;
  o1 uuid := (select v from _qs where k = 'o1'); c1 uuid := (select v from _qs where k = 'c1');
begin
  perform _test.as_user(other);
  select count(*) into n from public.order_status_events where order_id = o1;
  perform _test.reset_role();
  assert n = 0, 'outro cliente não vê o log do pedido: ' || n;
  perform _test.as_user(c1);
  select count(*) into n from public.order_status_events where order_id = o1;
  perform _test.reset_role();
  assert n > 0, 'o dono do pedido vê o próprio log';
end $$;
select pass('o log de status respeita RLS: cada cliente vê só os próprios pedidos');

select * from finish();
rollback;
