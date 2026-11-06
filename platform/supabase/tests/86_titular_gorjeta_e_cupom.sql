-- Respostas 49, 55 e 79 (05/11/2026).
begin;
select plan(6);
create function pg_temp.act(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true) $$;
create function pg_temp.state_of(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ok'; exception when others then return sqlstate; end $$;
create temp table _ctx(k text primary key, v uuid);
create function pg_temp.ctx(p text) returns uuid language sql as $$ select v from _ctx where k = p $$;

do $$
declare r uuid := 'c1000000-0000-4000-8000-000000000002'; a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid(); tbl jsonb; sid uuid;
begin
  insert into auth.users(id, email) values (a, a || '@titular.test'), (b, b || '@titular.test'), (c, c || '@titular.test');
  insert into public.profiles(id, full_name) values (a, 'Ana'), (b, 'Bia'), (c, 'Caio') on conflict (id) do update set full_name = excluded.full_name;
  perform pg_temp.act('c1000000-0000-4000-8000-000000000001');
  tbl := public.restaurant_create_table(r, 'titular-' || a, 4);
  perform pg_temp.act(a); sid := (public.customer_open_table_session(tbl->>'qr_code')->>'tableSessionId')::uuid;
  perform pg_temp.act(b); perform public.customer_open_table_session(tbl->>'qr_code');
  insert into _ctx values ('r', r), ('a', a), ('b', b), ('c', c), ('sid', sid),
    ('pa', (select id from public.table_session_participants where table_session_id = sid and user_id = a)),
    ('pb', (select id from public.table_session_participants where table_session_id = sid and user_id = b));
end $$;

do $$
declare sid uuid := pg_temp.ctx('sid'); j jsonb;
begin
  perform pg_temp.act(pg_temp.ctx('b'));
  assert pg_temp.state_of(format($q$select public.customer_offer_host_transfer(%L, %L)$q$, sid, pg_temp.ctx('pa'))) = '42501', 'só o titular oferece';
  perform pg_temp.act(pg_temp.ctx('a'));
  j := public.customer_list_host_candidates(sid);
  assert jsonb_array_length(j) = 1 and (j->0->>'participantId')::uuid = pg_temp.ctx('pb'), 'só quem está na mesa: ' || j::text;
  j := public.customer_offer_host_transfer(sid, pg_temp.ctx('pb'));
  insert into _ctx values ('t', (j->>'transferId')::uuid);
  assert (select is_host from public.table_session_participants where id = pg_temp.ctx('pa')), 'oferecer não muda nada ainda';
  assert exists (select 1 from public.notifications n where n.user_id = pg_temp.ctx('b') and n.metadata->>'kind' = 'host_transfer_offer'), 'avisa quem recebe';
  perform pg_temp.act(pg_temp.ctx('c'));
  assert pg_temp.state_of(format($q$select public.customer_respond_host_transfer(%L, true)$q$, pg_temp.ctx('t'))) = '42501', 'só quem recebeu aceita';
end $$;
select pass('o titular oferece a titularidade a quem está na mesa, e só quem recebeu responde');

do $$
declare sid uuid := pg_temp.ctx('sid'); j jsonb;
begin
  perform pg_temp.act(pg_temp.ctx('b'));
  j := public.customer_pending_host_transfer(sid);
  assert (j->>'incoming')::boolean and j->>'fromName' is not null, 'quem recebe vê o pedido: ' || coalesce(j::text, '-');
  j := public.customer_respond_host_transfer(pg_temp.ctx('t'), true);
  assert (select is_host from public.table_session_participants where id = pg_temp.ctx('pb')) and not (select is_host from public.table_session_participants where id = pg_temp.ctx('pa')), 'trocou';
  assert (select customer_id from public.table_sessions where id = sid) = pg_temp.ctx('b'), 'a comanda passa a ser dela';
  assert exists (select 1 from public.audit_logs a where a.action = 'bill.host_transferred' and a.entity_id = sid), 'com rastro';
  assert public.customer_pending_host_transfer(sid) is null, 'nada pendente';
end $$;
select pass('aceito, a titularidade muda, com rastro; o antigo titular sai como qualquer convidado');

do $$
declare j jsonb; v_min bigint;
begin
  perform pg_temp.act(pg_temp.ctx('a'));
  j := public.customer_tip_quote(10000, 0, 3000);
  assert not (j->>'confirmTip')::boolean, '30% não pede';
  j := public.customer_tip_quote(10000, 0, 3001);
  assert (j->>'confirmTip')::boolean, 'acima de 30% pede confirmação';
  assert pg_temp.state_of($q$select public.customer_tip_quote(10000, 0, 10000)$q$) = 'ok', 'até 100% vale';
  select min_online_charge_cents into v_min from private.noowe_billing_settings;
  j := public.customer_tip_quote(v_min - 1, 0, 0);
  assert not (j->>'cardAvailable')::boolean, 'abaixo do mínimo do cartão, o cartão some';
  j := public.customer_tip_quote(v_min, 0, 0);
  assert (j->>'cardAvailable')::boolean and (j->>'pixAvailable')::boolean, 'no mínimo, os dois';
end $$;
select pass('gorjeta acima de 30% do consumo pede confirmação, e o servidor diz que meios cabem no valor');

do $$
declare r uuid := pg_temp.ctx('r'); o public.orders; p public.promotions; pid uuid;
begin
  insert into public.orders(restaurant_id, customer_id, total_cents, subtotal_cents, service_model, payment_status)
    values (r, pg_temp.ctx('a'), 2000, 2000, 'quick_service', 'pending') returning * into o;
  insert into public.order_items(order_id, menu_item_id, quantity, unit_price, total_price)
    values (o.id, (select id from public.menu_items where restaurant_id = r limit 1), 1, 20, 20);
  select * into o from public.orders where id = o.id;
  perform pg_temp.act('c1000000-0000-4000-8000-000000000001');
  pid := (public.restaurant_upsert_coupon(r, jsonb_build_object('code', 'ZERA' || upper(substr(md5(random()::text), 1, 4)),
    'title', 'Cortesia', 'discountKind', 'percent', 'discountBps', 10000, 'validFrom', now() - interval '1 day', 'validUntil', now() + interval '30 days'))->>'id')::uuid;
  select * into p from public.promotions where id = pid;
  perform private.coupon_order_set(o, p, pg_temp.ctx('a'));
  select * into o from public.orders where id = o.id;
  assert o.total_cents = 0 and o.coupon_discount_cents = 2000, 'desconto integral: ' || o.total_cents;
  assert o.payment_status = 'confirmed', 'pago com cupom: ' || o.payment_status;
  assert exists (select 1 from public.audit_logs a where a.action = 'order.paid_with_coupon' and a.entity_id = o.id), 'com rastro';
end $$;
select pass('pedido zerado pelo cupom fica pago, sem cobrança, e segue como pedido pago');

select ok(not has_table_privilege('authenticated', 'public.table_session_host_transfers', 'SELECT'), 'pedidos de titularidade só pelas funções');
-- Validação das notas de 06/11: o Pix tem mínimo próprio, independente do cartão.
do $$
declare b private.noowe_billing_settings;
begin
  select * into b from private.noowe_billing_settings;
  assert not (private.quote_flags(b.min_pix_charge_cents - 1, 0, b.min_pix_charge_cents - 1)->>'pixAvailable')::boolean, 'abaixo do mínimo do Pix, sem Pix';
  assert (private.quote_flags(b.min_pix_charge_cents, 0, b.min_pix_charge_cents)->>'pixAvailable')::boolean, 'no mínimo do Pix, com Pix';
  perform set_config('noowe.param_author', 'teste', true);
  update private.noowe_billing_settings set min_pix_charge_cents = 100, min_online_charge_cents = 500;
  assert (private.quote_flags(300, 0, 300)->>'pixAvailable')::boolean and not (private.quote_flags(300, 0, 300)->>'cardAvailable')::boolean,
    'baixar o mínimo do Pix libera o Pix sem mudar o cartão';
end $$;
select pass('o Pix tem mínimo próprio no parâmetro, separado do cartão');
select * from finish();
rollback;
