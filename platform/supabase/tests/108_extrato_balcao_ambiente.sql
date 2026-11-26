-- Decisões do QA de 26/11, itens 1–3: extrato com líquido real, Quick "Pague no balcão" e trava de ambiente.
begin;
select plan(6);
update private.dev_flags set enabled = false where key in ('simulate_order_payment', 'simulate_pix_payment');

create function pg_temp.act(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true) $$;
create function pg_temp.state_of(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ok'; exception when others then return sqlstate; end $$;
create temp table _ctx(k text primary key, v uuid);
create function pg_temp.ctx(p text) returns uuid language sql as $$ select v from _ctx where k = p $$;

do $$
declare r uuid := 'c1000000-0000-4000-8000-000000000002'; c uuid := gen_random_uuid(); b uuid := gen_random_uuid(); acc uuid; m1 uuid;
begin
  insert into public.restaurant_payment_accounts(restaurant_id, provider, status) values (r, 'asaas', 'active') on conflict do nothing;
  update public.restaurant_payment_accounts set status = 'active' where restaurant_id = r;
  select id into acc from public.restaurant_payment_accounts where restaurant_id = r;
  insert into auth.users(id, email) values (c, c || '@q108.test'), (b, b || '@q108.test');
  insert into public.profiles(id, full_name) values (c, 'Cliente'), (b, 'Barman') on conflict do nothing;
  insert into public.user_roles(user_id, restaurant_id, role, is_active) values (b, r, 'barman', true);
  update public.restaurant_model_configs set service_models = array['casual_dining','quick_service']::public.noowe_service_model[],
    pickup_capacity_per_slot = 5 where restaurant_id = r;
  update public.restaurants set opening_hours = (
    select jsonb_object_agg(d, jsonb_build_object('closed', false, 'shifts', jsonb_build_array(jsonb_build_object('open', '00:00', 'close', '23:59'))))
    from unnest(array['sunday','monday','tuesday','wednesday','thursday','friday','saturday']) d) where id = r;
  update public.restaurant_model_policies set close_orders_before_min = 0, accept_mode = 'auto', orders_paused = false, prepaid_required = true
    where restaurant_id = r and service_model = 'quick_service';
  select id into m1 from public.menu_items where restaurant_id = r and is_available order by id limit 1;
  insert into _ctx values ('r', r), ('c', c), ('b', b), ('acc', acc), ('m1', m1);
end $$;

-- 1. PAG-07: Pix de R$ 35,20 com tarifa Asaas de R$ 0,99 e split zero: líquido R$ 34,21 (não R$ 34,85).
do $$
declare g uuid; s jsonb; p jsonb; po uuid;
begin
  insert into public.orders(restaurant_id, customer_id, status, payment_status, total_cents, total_amount, order_type)
    values (pg_temp.ctx('r'), pg_temp.ctx('c'), 'pending', 'pending', 3520, 35.20, 'pickup') returning id into po;
  insert into public.gateway_transactions(restaurant_id, order_id, provider, payment_method, amount_cents, status, idempotency_key, purpose, payment_account_id, confirmed_at, refunded_amount_cents, created_at, updated_at)
    values (pg_temp.ctx('r'), po, 'asaas', 'pix', 3520, 'completed', 'q108:' || gen_random_uuid(), 'order', pg_temp.ctx('acc'), now() + interval '1 second', 0, now(), now())
    returning id into g;
  insert into private.noowe_pay_transaction_fees(gateway_transaction_id, restaurant_id, payment_method, rate_bps, amount_cents, fee_cents, tariff_cents, split_cents, convenience_cents)
    values (g, pg_temp.ctx('r'), 'pix', 100, 3520, 35, 99, 0, 0)
    on conflict (gateway_transaction_id) do update set fee_cents = 35, tariff_cents = 99, split_cents = 0, convenience_cents = 0;
  perform pg_temp.act('c1000000-0000-4000-8000-000000000001');
  s := public.restaurant_get_payment_statement(pg_temp.ctx('r'));
  select e into p from jsonb_array_elements(s->'payments') e where (e->>'paymentId')::uuid = g;
  assert (p->>'netCents')::bigint = 3421 and (p->>'feeCents')::bigint = 99, p::text;
end $$;
select pass('extrato mostra o líquido real: valor − tarifa do Asaas − split');

-- 2. Abaixo do mínimo online: "Pague no balcão", fica fora da produção até o caixa confirmar.
do $$
declare o uuid; j jsonb; v_min bigint := private.online_minimum_cents();
begin
  perform pg_temp.act(pg_temp.ctx('c'));
  o := (public.customer_create_order_v2(pg_temp.ctx('r'), 'quick_service',
    jsonb_build_array(jsonb_build_object('menu_item_id', pg_temp.ctx('m1'), 'quantity', 1)),
    gen_random_uuid(), null, null, null, 'Ana', 'takeaway', true)->>'id')::uuid;
  -- O teste não depende do preço do cardápio: o total fica abaixo do mínimo atual.
  update public.orders set total_cents = greatest(v_min - 1, 1), total_amount = greatest(v_min - 1, 1) / 100.0 where id = o;
  j := public.customer_quick_pay_at_counter(o);
  assert (j->>'payAtCounter')::boolean and j->>'orderNumber' is not null, j::text;
  assert not exists (select 1 from public.order_items where order_id = o and status::text <> 'awaiting_payment'), 'nada em produção';
  insert into _ctx values ('o', o);
end $$;
select pass('pedido abaixo do mínimo vira "Pague no balcão" e não entra em produção');

do $$
begin
  perform pg_temp.act(pg_temp.ctx('c'));
  update public.orders set total_cents = private.online_minimum_cents() + 100 where id = pg_temp.ctx('o');
  assert pg_temp.state_of(format('select public.customer_quick_pay_at_counter(%L)', pg_temp.ctx('o'))) = 'P0001', 'acima do mínimo paga pelo app';
  update public.orders set total_cents = greatest(private.online_minimum_cents() - 1, 1) where id = pg_temp.ctx('o');
  perform pg_temp.act(gen_random_uuid());
  assert pg_temp.state_of(format('select public.customer_quick_pay_at_counter(%L)', pg_temp.ctx('o'))) = 'P0002', 'pedido de outro';
end $$;
select pass('o servidor confere o mínimo e o dono do pedido');

do $$
declare t bigint;
begin
  perform pg_temp.act(pg_temp.ctx('b'));
  assert exists (select 1 from jsonb_array_elements(public.restaurant_list_counter_orders(pg_temp.ctx('r'))) e where (e->>'orderId')::uuid = pg_temp.ctx('o')), 'aparece no balcão';
  select total_cents into t from public.orders where id = pg_temp.ctx('o');
  perform public.restaurant_record_payment(pg_temp.ctx('o'), 'cash', t / 100.0, 0, null, gen_random_uuid()::text);
  assert (select payment_status::text = 'confirmed' and accepted_at is not null from public.orders where id = pg_temp.ctx('o')), 'pago e aceito';
  assert not exists (select 1 from public.order_items where order_id = pg_temp.ctx('o') and status::text = 'awaiting_payment'), 'itens liberados';
end $$;
select pass('o caixa confirma no balcão e o pedido entra em produção');

-- 3. Trava de ambiente: a subconta nasce sandbox e o segredo diz o ambiente e o provedor do Pix.
select ok((select (j->>'environment') = 'sandbox' and (j->>'pixProvider') = 'asaas'
  from (select public.service_payment_account_secrets(pg_temp.ctx('acc')) j) x), 'segredos trazem ambiente esperado e provedor do Pix');

do $$
declare n_before bigint := (select count(*) from public.audit_logs where action = 'payment.environment_mismatch');
begin
  perform public.service_payment_environment_mismatch(pg_temp.ctx('acc'), 'production');
  assert (select count(*) from public.audit_logs where action = 'payment.environment_mismatch') = n_before + 1, 'rastro';
  assert exists (select 1 from public.notifications where metadata->>'kind' = 'payment_environment_mismatch' and metadata->>'restaurant_id' = pg_temp.ctx('r')::text), 'Dono avisado';
end $$;
select pass('ambiente divergente avisa o Dono e grava rastro');
select * from finish();
rollback;
