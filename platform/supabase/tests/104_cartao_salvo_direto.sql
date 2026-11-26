-- QA PAG-02 / PAG-05: cartão salvo na conta (só token, bandeira, final e validade), recusa na hora libera a reserva e
-- pedido no cartão expira pelo prazo da política (card_hold_min).
begin;
select plan(7);
update private.dev_flags set enabled = false where key in ('simulate_order_payment', 'simulate_pix_payment');

create function pg_temp.act(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true) $$;
create function pg_temp.state_of(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ok'; exception when others then return sqlstate; end $$;
create temp table _ctx(k text primary key, v uuid);
create function pg_temp.ctx(p text) returns uuid language sql as $$ select v from _ctx where k = p $$;

do $$
declare r uuid := 'c1000000-0000-4000-8000-000000000002'; a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); acc uuid;
begin
  insert into public.restaurant_payment_accounts(restaurant_id, provider, status) values (r, 'asaas', 'active') on conflict do nothing;
  update public.restaurant_payment_accounts set status = 'active' where restaurant_id = r;
  select id into acc from public.restaurant_payment_accounts where restaurant_id = r;
  insert into auth.users(id, email) values (a, a || '@card.test'), (b, b || '@card.test');
  insert into public.profiles(id, full_name) values (a, 'Ana'), (b, 'Bia') on conflict do nothing;
  insert into _ctx values ('r', r), ('a', a), ('b', b), ('acc', acc);
end $$;

-- 1. Tokenizado: a conta do restaurante é a do token, e só o que o app pode ver volta.
do $$
declare c jsonb; c2 jsonb; other uuid := gen_random_uuid();
begin
  assert public.service_payment_card_account(pg_temp.ctx('r')) = pg_temp.ctx('acc'), 'conta do restaurante';
  c := public.service_payment_add_card(pg_temp.ctx('a'), pg_temp.ctx('acc'), 'tok_asaas_aaaa1111', 'VISA', '1111', 12, 2030);
  assert c->>'last4' = '1111' and (c->>'expMonth')::int = 12 and (c->>'expYear')::int = 2030 and (c->>'isDefault')::boolean, c::text;
  assert not (c ? 'token'), 'token não volta';
  -- Mesmo cartão em outra subconta: mesmo registro, um token por subconta.
  c2 := public.service_payment_add_card(pg_temp.ctx('a'), other, 'tok_asaas_bbbb2222', 'visa', '1111', 12, 2030);
  assert c2->>'id' = c->>'id', 'mesmo cartão';
  assert (select count(*) from public.payment_card_tokens where payment_method_id = (c->>'id')::uuid) = 2, 'um token por subconta';
  assert public.service_payment_card_token(pg_temp.ctx('a'), (c->>'id')::uuid, pg_temp.ctx('acc')) = 'tok_asaas_aaaa1111', 'token certo por conta';
  assert public.service_payment_card_token(pg_temp.ctx('b'), (c->>'id')::uuid, pg_temp.ctx('acc')) is null, 'outro usuário não usa';
  insert into _ctx values ('card1', (c->>'id')::uuid);
end $$;
select pass('cartão tokenizado guarda token por subconta e devolve só bandeira, final e validade');

-- 2. Nada parecido com número de cartão fica guardado.
select ok(not exists (select 1 from information_schema.columns where table_schema = 'public'
    and table_name in ('payment_methods', 'payment_card_tokens') and column_name ~ '(card_number|pan|ccv|cvv)')
  and not exists (select 1 from public.payment_methods pm where pm.metadata::text ~ '\d{13,19}' or pm.card_last_four !~ '^\d{4}$')
  and pg_temp.state_of(format('select public.service_payment_add_card(%L, %L, %L, %L, %L, 1, 2030)', pg_temp.ctx('a'), pg_temp.ctx('acc'), 'tok_asaas_cccc', 'VISA', '4111111111111111')) = '22023',
  'número do cartão não tem onde ser gravado e last4 longo é recusado');

-- 3. Lista: com validade, filtrada pelo restaurante.
do $$
declare l jsonb;
begin
  perform pg_temp.act(pg_temp.ctx('a'));
  l := public.customer_list_saved_cards(pg_temp.ctx('r'));
  assert jsonb_array_length(l) = 1 and l->0->>'lastFour' = '1111' and (l->0->>'expMonth')::int = 12, l::text;
  assert jsonb_array_length(public.customer_list_saved_cards(gen_random_uuid())) = 0, 'outro restaurante: sem cartão cobrável';
  assert jsonb_array_length(public.customer_list_saved_cards()) = 1, 'sem filtro: todos';
  perform pg_temp.act(pg_temp.ctx('b'));
  assert jsonb_array_length(public.customer_list_saved_cards()) = 0, 'ninguém vê o dos outros';
end $$;
select pass('a lista mostra validade e só os cartões cobráveis no restaurante');

-- 4. Padrão e remoção: só do próprio usuário; remover apaga tokens e passa o padrão adiante.
do $$
declare c2 uuid;
begin
  c2 := (public.service_payment_add_card(pg_temp.ctx('a'), pg_temp.ctx('acc'), 'tok_asaas_dddd4444', 'MASTERCARD', '4444', 1, 2031)->>'id')::uuid;
  assert pg_temp.state_of(format('select public.service_payment_set_default_card(%L, %L)', pg_temp.ctx('b'), c2)) = 'P0002', 'alheio: set_default';
  assert pg_temp.state_of(format('select public.service_payment_remove_card(%L, %L)', pg_temp.ctx('b'), c2)) = 'P0002', 'alheio: remove';
  perform public.service_payment_set_default_card(pg_temp.ctx('a'), c2);
  assert (select is_default from public.payment_methods where id = c2) and not (select is_default from public.payment_methods where id = pg_temp.ctx('card1')), 'um só padrão';
  perform public.service_payment_remove_card(pg_temp.ctx('a'), c2);
  assert not exists (select 1 from public.payment_card_tokens where payment_method_id = c2), 'tokens apagados';
  assert (select is_default from public.payment_methods where id = pg_temp.ctx('card1')), 'padrão passou adiante';
end $$;
select pass('padrão e remoção só pelo dono; remover apaga os tokens');

-- Pedido Quick pago antes (prepaid) para os blocos de cartão.
do $$
declare r uuid := pg_temp.ctx('r'); res jsonb; m1 uuid;
begin
  update public.restaurant_model_configs set service_models = array['casual_dining','quick_service']::public.noowe_service_model[],
    pickup_capacity_per_slot = 50 where restaurant_id = r;
  update public.restaurants set opening_hours = (
    select jsonb_object_agg(d, jsonb_build_object('closed', false, 'shifts', jsonb_build_array(jsonb_build_object('open', '00:00', 'close', '23:59'))))
    from unnest(array['sunday','monday','tuesday','wednesday','thursday','friday','saturday']) d) where id = r;
  update public.restaurant_model_policies set close_orders_before_min = 0, accept_mode = 'auto', orders_paused = false, card_hold_min = 15
    where restaurant_id = r and service_model = 'quick_service';
  select id into m1 from public.menu_items where restaurant_id = r and is_available order by id limit 1;
  perform pg_temp.act(pg_temp.ctx('a'));
  res := public.customer_create_order_v2(r, 'quick_service', jsonb_build_array(jsonb_build_object('menu_item_id', m1, 'quantity', 3)),
    gen_random_uuid(), null, null, null, 'Ana', 'takeaway', true);
  insert into _ctx values ('o', (res->>'id')::uuid);
end $$;

-- 5. Recusa na hora: a cobrança falha, o pedido segue pendente (fora da produção) e aceita outro cartão.
do $$
declare res jsonb; o public.orders; t public.gateway_transactions;
begin
  res := public.service_payment_reserve_order(pg_temp.ctx('a'), pg_temp.ctx('o'), 'credit_card', gen_random_uuid());
  assert not public.service_payment_card_declined((res->>'paymentId')::uuid, pg_temp.ctx('b'), 'x'), 'só o dono';
  assert public.service_payment_card_declined((res->>'paymentId')::uuid, pg_temp.ctx('a'), 'Transação não autorizada');
  select * into t from public.gateway_transactions where id = (res->>'paymentId')::uuid;
  select * into o from public.orders where id = pg_temp.ctx('o');
  assert t.status = 'failed' and t.last_error = 'Transação não autorizada', t.status;
  assert o.payment_status = 'pending' and o.fulfillment_status = 'received', o.payment_status || '/' || o.fulfillment_status;
  res := public.service_payment_reserve_order(pg_temp.ctx('a'), pg_temp.ctx('o'), 'credit_card', gen_random_uuid());
  assert res->>'status' = 'creating', 'outra tentativa abre nova cobrança';
end $$;
select pass('recusa do cartão falha a cobrança na hora e o pedido Quick não entra em produção');

-- 6. Cartão também expira pelo card_hold_min e a varredura cancela o pedido.
do $$
declare o public.orders;
begin
  select * into o from public.orders where id = pg_temp.ctx('o');
  assert o.payment_expires_at between now() + interval '14 minutes' and now() + interval '16 minutes', 'prazo do card_hold_min: ' || coalesce(o.payment_expires_at::text, 'null');
  update public.orders set payment_expires_at = now() - interval '1 minute' where id = o.id;
  perform public.quick_service_refresh(pg_temp.ctx('r'));
  select * into o from public.orders where id = pg_temp.ctx('o');
  assert o.fulfillment_status = 'cancelled' and o.payment_status = 'failed', o.fulfillment_status;
end $$;
select pass('pedido no cartão sem pagamento expira pela tolerância da política');

-- 7. Parcela da conta: recusa libera a parcela na hora.
do $$
declare
  r uuid := pg_temp.ctx('r'); owner_id uuid := 'c1000000-0000-4000-8000-000000000001'; a uuid := pg_temp.ctx('a');
  tbl jsonb; sid uuid; menu uuid; o uuid; sh public.bill_shares; tx public.gateway_transactions; pid uuid;
begin
  update public.restaurant_model_policies set fee_or_tip_mode = 'service_fee', service_fee_bps = 1000, split_modes = '{by_owner,equal,by_item,fixed_amount}'
    where restaurant_id = r and not prepaid_required;
  perform pg_temp.act(owner_id);
  tbl := public.restaurant_create_table(r, 'test-card-' || a, 4);
  select id into menu from public.menu_items where restaurant_id = r limit 1;
  perform pg_temp.act(a); sid := (public.customer_open_table_session(tbl->>'qr_code')->>'tableSessionId')::uuid;
  insert into public.orders(restaurant_id, customer_id, table_session_id) values (r, a, sid) returning id into o;
  insert into public.order_items(order_id, menu_item_id, quantity, unit_price, total_price) values (o, menu, 2, 20, 40);
  perform public.customer_bill_split_commit(sid, 'equal', '{}', null, gen_random_uuid());
  select id into pid from public.table_session_participants where table_session_id = sid and user_id = a;
  select * into sh from public.bill_shares where table_session_id = sid and participant_id = pid and status = 'open';
  tx := private.reserve_share_payment(a, sh.id, 'credit_card', 0, gen_random_uuid(), 'asaas');
  assert (select status from public.bill_shares where id = sh.id) <> 'open', 'reservada';
  assert public.service_payment_card_declined(tx.id, a, 'Saldo insuficiente');
  assert (select status from public.bill_shares where id = sh.id) = 'open', 'liberada: ' || (select status from public.bill_shares where id = sh.id);
  assert (select status from public.gateway_transactions where id = tx.id) = 'failed';
end $$;
select pass('recusa do cartão libera a parcela da conta na hora');

select * from finish();
rollback;
