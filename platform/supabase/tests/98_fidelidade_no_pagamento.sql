-- P1-1 / B15: pontos saem do pagamento confirmado, de cada pagamento e proporcional ao consumo dele; nunca na entrega.
begin;
select plan(6);

create function pg_temp.act(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true) $$;
create temp table _ctx(k text primary key, v uuid);
create function pg_temp.ctx(p text) returns uuid language sql as $$ select v from _ctx where k = p $$;
create function pg_temp.pts(p_user uuid) returns numeric language sql as $$
  select coalesce((select points from public.loyalty_programs where user_id = p_user and restaurant_id = 'c1000000-0000-4000-8000-000000000002'), 0) $$;

-- 1. Regra de arredondamento: piso, sem fração de ponto.
select ok(private.loyalty_points_for_cents(1999, 1) = 19 and private.loyalty_points_for_cents(1000, 1.5) = 15
  and private.loyalty_points_for_cents(333, 1.5) = 4 and private.loyalty_points_for_cents(0, 2) = 0
  and private.loyalty_points_kept(15, 1000, 500) = 7 and private.loyalty_points_kept(15, 1000, 1000) = 0,
  'pontos = piso(centavos × taxa / 100); estorno guarda o piso da parte não estornada');

-- Comanda de duas pessoas (Ana pediu tudo), dividida por igual.
do $$
declare
  r uuid := 'c1000000-0000-4000-8000-000000000002'; owner_id uuid := 'c1000000-0000-4000-8000-000000000001';
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); tbl jsonb; sid uuid; menu uuid; o uuid; sh public.bill_shares; tx public.gateway_transactions; pid uuid; u uuid;
begin
  insert into public.restaurant_payment_accounts(restaurant_id, provider, status) values (r, 'asaas', 'active') on conflict do nothing;
  update public.restaurant_payment_accounts set status = 'active' where restaurant_id = r;
  update public.restaurant_model_policies set fee_or_tip_mode = 'service_fee', service_fee_bps = 1000, split_modes = '{by_owner,equal,by_item,fixed_amount}'
    where restaurant_id = r and not prepaid_required;
  insert into auth.users(id, email) values (a, a || '@fid.test'), (b, b || '@fid.test');
  insert into public.profiles(id, full_name) values (a, 'Ana Teste'), (b, 'Bia Teste') on conflict (id) do update set full_name = excluded.full_name;
  perform pg_temp.act(owner_id);
  perform public.restaurant_upsert_loyalty_config(r, '{"points_enabled": true, "points_per_real": 1.5, "points_redemption_rate": 0.05, "min_points_for_redemption": 100, "cashback_enabled": false, "cashback_percentage": 0}');
  tbl := public.restaurant_create_table(r, 'test-fid-' || a, 4);
  select id into menu from public.menu_items where restaurant_id = r limit 1;
  perform pg_temp.act(a); sid := (public.customer_open_table_session(tbl->>'qr_code')->>'tableSessionId')::uuid;
  perform pg_temp.act(b); perform public.customer_open_table_session(tbl->>'qr_code');
  insert into public.orders(restaurant_id, customer_id, table_session_id) values (r, a, sid) returning id into o;
  insert into public.order_items(order_id, menu_item_id, quantity, unit_price, total_price) values (o, menu, 3, 20.01, 60.03);
  -- Entregue antes de pagar: não pode dar ponto.
  begin update public.orders set status = 'delivered' where id = o; exception when others then null; end;
  perform pg_temp.act(a);
  perform public.customer_bill_split_commit(sid, 'equal', '{}', null, gen_random_uuid());
  foreach u in array array[a, b] loop
    select id into pid from public.table_session_participants where table_session_id = sid and user_id = u;
    select * into sh from public.bill_shares where table_session_id = sid and participant_id = pid and status = 'open';
    tx := private.reserve_share_payment(u, sh.id, 'pix', 0, gen_random_uuid(), 'asaas');
    update public.gateway_transactions set provider_ref = 'pay_' || tx.id where id = tx.id;
    insert into _ctx values ((case when u = a then 'tx:a' else 'tx:b' end), tx.id), ((case when u = a then 'a' else 'b' end), u);
  end loop;
end $$;

-- 2. Na entrega, nada: quem pediu não leva os pontos da mesa.
select ok(pg_temp.pts(pg_temp.ctx('a')) = 0 and pg_temp.pts(pg_temp.ctx('b')) = 0
  and not exists (select 1 from pg_trigger where tgname = 'trg_award_loyalty_on_completion'),
  'pedido entregue e ainda não pago não credita ponto');

-- 3. Pagou: cada um recebe pelo consumo que o próprio pagamento cobriu (sem a taxa de serviço).
do $$
declare t public.gateway_transactions; u text;
begin
  foreach u in array array['a', 'b'] loop
    select * into t from public.gateway_transactions where id = pg_temp.ctx('tx:' || u);
    perform private.apply_payment_event(t.id, 'asaas', 'evt-' || t.id, 'PAYMENT_RECEIVED', 'confirmed', t.amount_cents);
  end loop;
end $$;
select ok((select bool_and(pg_temp.pts(g.customer_id) = private.loyalty_points_for_cents(private.loyalty_consumption_cents(g), 1.5)
              and pg_temp.pts(g.customer_id) > 0)
           from public.gateway_transactions g where g.id in (pg_temp.ctx('tx:a'), pg_temp.ctx('tx:b'))),
  'cada pagador leva os pontos do próprio consumo pago');

-- 4. Duas pessoas: a soma do consumo creditado é o consumo da comanda, dividido entre elas.
select is((select sum(consumption_cents) from private.loyalty_payment_credits
            where gateway_transaction_id in (pg_temp.ctx('tx:a'), pg_temp.ctx('tx:b')))::bigint, 6003::bigint,
  'o consumo creditado soma o consumo da comanda, dividido entre os dois pagamentos');

-- 5. Reenvio do webhook (mesmo e novo evento) não credita de novo.
do $$
declare t public.gateway_transactions; before numeric := pg_temp.pts(pg_temp.ctx('a'));
begin
  select * into t from public.gateway_transactions where id = pg_temp.ctx('tx:a');
  perform private.apply_payment_event(t.id, 'asaas', 'evt-' || t.id, 'PAYMENT_RECEIVED', 'confirmed', t.amount_cents);
  perform private.apply_payment_event(t.id, 'asaas', 'evt2-' || t.id, 'PAYMENT_CONFIRMED', 'confirmed', t.amount_cents);
  assert pg_temp.pts(pg_temp.ctx('a')) = before, 'reenvio creditou de novo';
end $$;
select pass('reenvio do webhook não credita duas vezes');

-- 6. Estorno de metade tira metade dos pontos; o resto, o restante.
do $$
declare c private.loyalty_payment_credits; t public.gateway_transactions; p0 numeric := pg_temp.pts(pg_temp.ctx('b'));
begin
  select * into c from private.loyalty_payment_credits where gateway_transaction_id = pg_temp.ctx('tx:b');
  select * into t from public.gateway_transactions where id = c.gateway_transaction_id;
  update public.gateway_transactions set refunded_amount_cents = t.amount_cents / 2 where id = t.id;
  assert pg_temp.pts(pg_temp.ctx('b')) = p0 - (c.points - private.loyalty_points_kept(c.points, t.amount_cents, t.amount_cents / 2)), 'metade';
  update public.gateway_transactions set refunded_amount_cents = t.amount_cents where id = t.id;
  assert pg_temp.pts(pg_temp.ctx('b')) = p0 - c.points, 'tudo';
end $$;
select pass('estorno tira os pontos na proporção do valor estornado');

select * from finish();
rollback;
