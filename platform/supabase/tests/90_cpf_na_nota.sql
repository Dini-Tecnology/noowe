-- CPF do cliente (resposta do Pedro de 05/11/2026): "CPF na nota" opcional na NFC-e do restaurante e o CPF da cobrança como
-- tomador da nota da conveniência da NOOWE.
begin;
select plan(6);

create function pg_temp.act(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true) $$;
create function pg_temp.state_of(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ok'; exception when others then return sqlstate; end $$;

create temp table _ctx(k text primary key, v uuid);
create function pg_temp.ctx(p text) returns uuid language sql as $$ select v from _ctx where k = p $$;

-- 1. Documento válido só com os dígitos verificadores certos.
select ok(private.tax_document_valid('529.982.247-25') and private.tax_document_valid('12345678909') and private.tax_document_valid('11.222.333/0001-81')
  and not private.tax_document_valid('111.111.111-11') and not private.tax_document_valid('12345678900')
  and not private.tax_document_valid('11222333000180') and not private.tax_document_valid('123') and not private.tax_document_valid(null),
  'CPF e CNPJ conferem os dígitos verificadores');

-- Comanda de duas pessoas paga online por inteiro.
do $$
declare
  r uuid := 'c1000000-0000-4000-8000-000000000002'; owner_id uuid := 'c1000000-0000-4000-8000-000000000001';
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); tbl jsonb; sid uuid; menu uuid; o uuid; sh public.bill_shares; tx public.gateway_transactions; pid uuid; u uuid;
begin
  insert into public.restaurant_payment_accounts(restaurant_id, provider, status) values (r, 'asaas', 'active') on conflict do nothing;
  update public.restaurant_payment_accounts set status = 'active' where restaurant_id = r;
  update public.restaurant_model_policies set fee_or_tip_mode = 'service_fee', service_fee_bps = 1000, split_modes = '{by_owner,equal,by_item,fixed_amount}'
    where restaurant_id = r and not prepaid_required;
  insert into auth.users(id, email) values (a, a || '@cpf.test'), (b, b || '@cpf.test');
  insert into public.profiles(id, full_name) values (a, 'Ana Teste'), (b, 'Bia Teste') on conflict (id) do update set full_name = excluded.full_name;
  perform pg_temp.act(owner_id);
  tbl := public.restaurant_create_table(r, 'test-cpf-' || a, 4);
  select id into menu from public.menu_items where restaurant_id = r limit 1;
  perform pg_temp.act(a); sid := (public.customer_open_table_session(tbl->>'qr_code')->>'tableSessionId')::uuid;
  perform pg_temp.act(b); perform public.customer_open_table_session(tbl->>'qr_code');
  insert into public.orders(restaurant_id, customer_id, table_session_id) values (r, a, sid) returning id into o;
  insert into public.order_items(order_id, menu_item_id, quantity, unit_price, total_price) values (o, menu, 2, 20, 40);
  perform pg_temp.act(a);
  perform public.customer_bill_split_commit(sid, 'equal', '{}', null, gen_random_uuid());
  foreach u in array array[a, b] loop
    select id into pid from public.table_session_participants where table_session_id = sid and user_id = u;
    select * into sh from public.bill_shares where table_session_id = sid and participant_id = pid and status = 'open';
    tx := private.reserve_share_payment(u, sh.id, 'pix', 0, gen_random_uuid(), 'asaas');
    insert into _ctx values ((case when u = a then 'tx:a' else 'tx:b' end), tx.id), ((case when u = a then 'a' else 'b' end), u);
  end loop;
  insert into _ctx values ('sid', sid);
end $$;

-- 2. CPF da cobrança: só dígitos, só válido, e a função de pagamento sabe se já está guardado.
do $$
declare a uuid := pg_temp.ctx('a'); b uuid := pg_temp.ctx('b'); acc uuid;
begin
  select id into acc from public.restaurant_payment_accounts where restaurant_id = 'c1000000-0000-4000-8000-000000000002';
  assert not (public.service_payment_customer(acc, a)->>'hasTaxDocument')::boolean, 'ainda sem CPF guardado';
  assert public.service_customer_save_tax_document(a, '529.982.247-25', 'payment'), 'guarda o válido';
  assert not public.service_customer_save_tax_document(b, '111.111.111-11', 'payment'), 'inválido não é guardado';
  assert (select document from private.customer_tax_documents where user_id = a) = '52998224725', 'só os dígitos';
  assert not exists (select 1 from private.customer_tax_documents where user_id = b), 'nada para quem mandou inválido';
  assert (public.service_payment_customer(acc, a)->>'hasTaxDocument')::boolean, 'agora guardado';
  perform pg_temp.act(a);
  assert public.customer_get_tax_document() = '52998224725', 'o cliente vê o próprio';
  perform pg_temp.act(b);
  assert public.customer_get_tax_document() is null, 'e ninguém vê o dos outros';
end $$;
select pass('o CPF da cobrança fica guardado, só com dígitos válidos, e cada um vê só o próprio');

-- 3. "CPF na nota": só o dono do pagamento escolhe, o documento precisa ser válido e desmarcar tira.
select is(pg_temp.state_of(format('select public.service_payment_set_receipt_document(%L, %L, %L)', pg_temp.ctx('tx:a'), pg_temp.ctx('b'), '52998224725')),
  'P0002', 'pagamento de outra pessoa não aceita CPF');
do $$
begin
  assert pg_temp.state_of(format('select public.service_payment_set_receipt_document(%L, %L, %L)', pg_temp.ctx('tx:a'), pg_temp.ctx('a'), '12345678900')) = '22023', 'inválido recusado';
  perform public.service_payment_set_receipt_document(pg_temp.ctx('tx:a'), pg_temp.ctx('a'), '529.982.247-25');
  perform public.service_payment_set_receipt_document(pg_temp.ctx('tx:a'), pg_temp.ctx('a'), null);
  assert not exists (select 1 from private.payment_receipt_documents where gateway_transaction_id = pg_temp.ctx('tx:a')), 'desmarcou, saiu';
  -- Só a segunda pessoa pede CPF na nota, com outro documento.
  perform public.service_payment_set_receipt_document(pg_temp.ctx('tx:b'), pg_temp.ctx('b'), '123.456.789-09');
end $$;

-- 4. A nota da comanda leva o CPF de quem pediu. Sem pedido, sai sem CPF.
do $$
declare sid uuid := pg_temp.ctx('sid'); u text; tx public.gateway_transactions; d public.fiscal_documents;
begin
  delete from public.restaurant_subscriptions where restaurant_id = 'c1000000-0000-4000-8000-000000000002';
  foreach u in array array['a', 'b'] loop
    select * into tx from public.gateway_transactions where id = pg_temp.ctx('tx:' || u);
    update public.gateway_transactions set provider_ref = 'pay_' || tx.id where id = tx.id;
    perform private.apply_payment_event(tx.id, 'asaas', 'evt-' || tx.id, 'PAYMENT_RECEIVED', 'confirmed', tx.amount_cents);
  end loop;
  if not exists (select 1 from public.fiscal_documents where table_session_id = sid) then perform private.fiscal_enqueue_session(sid); end if;
  select * into d from public.fiscal_documents where table_session_id = sid and external_ref = 's-' || sid;
  assert d.id is not null, 'nota da comanda';
  assert private.fiscal_consumer_document(d) = '12345678909', 'CPF de quem pediu: ' || coalesce(private.fiscal_consumer_document(d), '-');
  assert position('consumerDocument' in pg_get_functiondef('public.service_fiscal_claim(uuid)'::regprocedure)) > 0, 'vai no pedido de emissão';
  delete from private.payment_receipt_documents where gateway_transaction_id = pg_temp.ctx('tx:b');
  assert private.fiscal_consumer_document(d) is null, 'sem pedido, consumidor não identificado';
  perform public.service_payment_set_receipt_document(pg_temp.ctx('tx:b'), pg_temp.ctx('b'), '12345678909');
  perform public.service_payment_set_receipt_document(pg_temp.ctx('tx:a'), pg_temp.ctx('a'), '52998224725');
  update public.gateway_transactions set confirmed_at = now() - interval '2 minutes' where id = pg_temp.ctx('tx:a');
  update public.gateway_transactions set confirmed_at = now() - interval '1 minute' where id = pg_temp.ctx('tx:b');
  assert private.fiscal_consumer_document(d) = '52998224725', 'os dois pediram: vale o do primeiro pagamento';
  update public.gateway_transactions set confirmed_at = now() - interval '3 minutes' where id = pg_temp.ctx('tx:b');
  assert private.fiscal_consumer_document(d) = '12345678909', 'e muda se o outro pagou antes';
  insert into _ctx values ('doc1', d.id);
end $$;
select pass('a NFC-e da comanda leva o CPF de quem marcou "CPF na nota"; sem isso, consumidor não identificado');

-- O acréscimo depois de reabrir só leva CPF de pagamento feito depois de reabrir.
do $$
declare sid uuid := pg_temp.ctx('sid'); r uuid := 'c1000000-0000-4000-8000-000000000002'; menu uuid; o uuid; v uuid; d public.fiscal_documents;
begin
  update public.table_sessions set reopened_count = reopened_count + 1, reopened_at = now() + interval '1 minute' where id = sid;
  select id into menu from public.menu_items where restaurant_id = r limit 1;
  insert into public.orders(restaurant_id, customer_id, table_session_id) values (r, pg_temp.ctx('a'), sid) returning id into o;
  insert into public.order_items(order_id, menu_item_id, quantity, unit_price, total_price) values (o, menu, 1, 15, 15);
  v := private.fiscal_enqueue_session(sid);
  select * into d from public.fiscal_documents where id = v;
  assert d.id is not null and private.fiscal_consumer_document(d) is null, 'acréscimo sem os CPFs da primeira nota';
end $$;
select pass('a nota do acréscimo não herda o CPF dos pagamentos da primeira');

-- 5. Conveniência: o tomador é quem pagou, com o CPF guardado. Nota antiga sem documento é completada quando o CPF aparece.
do $$
declare r uuid := 'c1000000-0000-4000-8000-000000000002'; g1 uuid := gen_random_uuid(); g2 uuid := gen_random_uuid(); n private.noowe_fee_notes;
begin
  insert into public.gateway_transactions(id, restaurant_id, provider, amount_cents, status, payment_method, idempotency_key, purpose, confirmed_at, convenience_cents, customer_id, created_at, updated_at)
    values (g1, r, 'asaas', 2000, 'completed', 'pix', 'c-' || g1, 'order', now(), 99, pg_temp.ctx('a'), now(), now()),
           (g2, r, 'asaas', 2000, 'completed', 'pix', 'c-' || g2, 'order', now(), 99, pg_temp.ctx('b'), now(), now());
  perform private.fee_notes_generate(now());
  select * into n from private.noowe_fee_notes where gateway_transaction_id = g1;
  assert n.taker_document = '52998224725' and n.taker_name = 'Ana Teste', 'tomador com CPF: ' || row_to_json(n)::text;
  select * into n from private.noowe_fee_notes where gateway_transaction_id = g2;
  assert n.taker_document is null and private.fee_note_blocker(n) like 'Cliente sem CPF%' or not private.nfse_ready('convenience'), 'sem CPF guardado, espera';
  perform public.service_customer_save_tax_document(pg_temp.ctx('b'), '12345678909', 'provider');
  perform private.fee_notes_generate(now());
  select * into n from private.noowe_fee_notes where gateway_transaction_id = g2;
  assert n.taker_document = '12345678909' and n.taker_name = 'Bia Teste', 'completou: ' || row_to_json(n)::text;
end $$;
select pass('a nota da conveniência sai para o CPF de quem pagou, e a que esperava é completada');

select * from finish();
rollback;
