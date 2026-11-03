-- T-N4-03 / N4 #4 e #6: emissão fiscal no encerramento, idempotente, com falha recuperável.
-- Cada bloco cobre um critério; o emissor em si é testado em functions/fiscal-emit.
begin;
select plan(47);

create function pg_temp.act(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true) $$;
create function pg_temp.state_of(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ok'; exception when others then return sqlstate; end $$;

create temp table _ctx(k text primary key, v uuid);
grant select on _ctx to authenticated;

-- Abre uma sessão com A e B, um item de R$60 e a divisão igual.
create function pg_temp.new_session(p_label text) returns uuid language plpgsql as $$
declare
  r uuid := 'c1000000-0000-4000-8000-000000000002'; owner_id uuid := 'c1000000-0000-4000-8000-000000000001';
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); tbl jsonb; sid uuid; menu uuid; o uuid;
begin
  insert into auth.users(id, email) values (a, a || '@fiscal.test'), (b, b || '@fiscal.test');
  insert into public.profiles(id) values (a), (b) on conflict do nothing;
  perform pg_temp.act(owner_id);
  tbl := public.restaurant_create_table(r, 'test-fiscal-' || p_label, 4);
  select id into menu from public.menu_items where restaurant_id = r limit 1;
  perform pg_temp.act(a); sid := (public.customer_open_table_session(tbl->>'qr_code')->>'tableSessionId')::uuid;
  perform pg_temp.act(b); perform public.customer_open_table_session(tbl->>'qr_code');
  insert into public.orders(restaurant_id, customer_id, table_session_id) values (r, a, sid) returning id into o;
  insert into public.order_items(order_id, menu_item_id, quantity, unit_price, total_price) values (o, menu, 3, 20, 60);
  perform pg_temp.act(a);
  perform public.customer_bill_split_commit(sid, 'equal', '{}', null, gen_random_uuid());
  insert into _ctx values (p_label || ':sid', sid), (p_label || ':a', a), (p_label || ':b', b);
  return sid;
end $$;

-- Reserva a parcela do pagante e confirma pelo mesmo caminho do webhook.
create function pg_temp.pay_share(p_sid uuid, p_user uuid, p_method text, p_tip bigint default 0) returns uuid language plpgsql as $$
declare sh public.bill_shares; tx public.gateway_transactions; pid uuid;
begin
  select id into pid from public.table_session_participants where table_session_id = p_sid and user_id = p_user;
  select * into sh from public.bill_shares where table_session_id = p_sid and participant_id = pid and status = 'open';
  tx := private.reserve_share_payment(p_user, sh.id, p_method, p_tip, gen_random_uuid(), 'asaas');
  perform private.apply_payment_event(tx.id, 'asaas', 'evt-' || tx.id, 'PAYMENT_RECEIVED', 'confirmed', tx.amount_cents);
  return tx.id;
end $$;

create function pg_temp.doc_of(p_sid uuid) returns public.fiscal_documents language sql as $$
  select * from public.fiscal_documents where table_session_id = p_sid $$;
create function pg_temp.due(p_id uuid) returns void language sql as $$
  update public.fiscal_documents set next_attempt_at = now() - interval '1 second' where id = p_id $$;

do $$
declare r uuid := 'c1000000-0000-4000-8000-000000000002';
begin
  insert into public.restaurant_payment_accounts(restaurant_id, provider, status, platform_fee_bps)
    values (r, 'asaas', 'active', 100) on conflict do nothing;
  update public.restaurant_payment_accounts set status = 'active' where restaurant_id = r;
  perform public.service_fiscal_configure(r, jsonb_build_object(
    'cnpj', '12.345.678/0001-23', 'razaoSocial', 'Casa LTDA', 'stateCode', 'SP', 'regimeTributario', 'simples_nacional',
    'taxDefaults', jsonb_build_object('ncm', '21069090', 'icms_origem', '0', 'icms_situacao_tributaria', '102',
      'pis_situacao_tributaria', '49', 'cofins_situacao_tributaria', '49')), 'tok-homolog');
  update public.menu_items set ncm = '00000000' where restaurant_id = r;
  perform pg_temp.new_session('main');
end $$;

-- ---------------------------------------------------------------------------
-- Disparo no encerramento em saldo zero
-- ---------------------------------------------------------------------------
select pg_temp.pay_share((select v from _ctx where k = 'main:sid'), (select v from _ctx where k = 'main:a'), 'pix', 300);
select is((select count(*)::int from public.fiscal_documents where table_session_id = (select v from _ctx where k = 'main:sid')), 0,
  'pagamento parcial não emite nota');

select pg_temp.act((select v from _ctx where k = 'main:a'));
select is(public.customer_get_receipt((select id from public.casual_dining_receipts where customer_id = (select v from _ctx where k = 'main:a')))->'fiscal'->>'status',
  'awaiting_close', 'recibo do primeiro pagante avisa que a nota sai no fechamento');

select pg_temp.pay_share((select v from _ctx where k = 'main:sid'), (select v from _ctx where k = 'main:b'), 'credit_card');
select is((select status from public.table_sessions where id = (select v from _ctx where k = 'main:sid')), 'ended', 'saldo zero encerra a sessão');
select is((select count(*)::int from public.fiscal_documents where table_session_id = (select v from _ctx where k = 'main:sid')), 1,
  'saldo zero enfileira uma nota');
select is((pg_temp.doc_of((select v from _ctx where k = 'main:sid'))).status, 'pending', 'nota nasce pendente, fora da transação do emissor');

select is(private.fiscal_enqueue_session((select v from _ctx where k = 'main:sid')), null::uuid, 'enfileirar de novo não cria nota');
select is((select count(*)::int from public.fiscal_documents where table_session_id = (select v from _ctx where k = 'main:sid')), 1,
  'reprocessar o encerramento continua com uma nota');
select is(private.close_session_if_settled((select v from _ctx where k = 'main:sid')), false, 'sessão encerrada não fecha duas vezes');

-- ---------------------------------------------------------------------------
-- Valores: nota fecha com as formas de pagamento; gorjeta e taxa ficam fora por padrão
-- ---------------------------------------------------------------------------
create temp table _claim as
  select public.service_fiscal_claim((pg_temp.doc_of((select v from _ctx where k = 'main:sid'))).id) as j;
select is((select (j->>'claimed')::boolean from _claim), true, 'primeira chamada reserva a nota');
select is(public.service_fiscal_claim((pg_temp.doc_of((select v from _ctx where k = 'main:sid'))).id)->>'claimed', 'false', 'segunda chamada não emite em paralelo');
select is((select j->>'token' from _claim), 'tok-homolog', 'token vem do Vault');
select is((select j->>'cnpj' from _claim), '12345678000123', 'CNPJ vai só com dígitos');
select is((select (j->>'totalCents')::bigint from _claim), 6000::bigint, 'nota = itens, sem taxa e sem gorjeta');
select is((select sum((p->>'cents')::bigint)::bigint from _claim, jsonb_array_elements(j->'payments') p), 6000::bigint,
  'soma das formas de pagamento é exatamente o total da nota');
select is((select count(*)::int from _claim, jsonb_array_elements(j->'payments') p), 2, 'uma linha por forma de pagamento');
select is((select i->>'ncm' from _claim, jsonb_array_elements(j->'items') i limit 1), '21069090', 'NCM zerado usa o padrão fiscal do restaurante');

-- ---------------------------------------------------------------------------
-- Falha do emissor não reabre a conta e fica recuperável
-- ---------------------------------------------------------------------------
select is(public.service_fiscal_record_result((pg_temp.doc_of((select v from _ctx where k = 'main:sid'))).id, 'transient',
  '{"errorCode":"network_error","errorMessage":"offline"}')->>'status', 'pending', 'falha transitória volta para a fila');
select is((select status from public.table_sessions where id = (select v from _ctx where k = 'main:sid')), 'ended', 'falha do emissor não reabre a conta');
select ok((pg_temp.doc_of((select v from _ctx where k = 'main:sid'))).next_attempt_at > now(), 'retentativa fica agendada');
select is(public.service_fiscal_claim((pg_temp.doc_of((select v from _ctx where k = 'main:sid'))).id)->>'claimed', 'false', 'antes da hora não reenvia');
select ok(not exists (select 1 from private.fiscal_due_documents() x where x = (pg_temp.doc_of((select v from _ctx where k = 'main:sid'))).id), 'varredura respeita o agendamento');
select pg_temp.due((pg_temp.doc_of((select v from _ctx where k = 'main:sid'))).id);
select ok(exists (select 1 from private.fiscal_due_documents() x where x = (pg_temp.doc_of((select v from _ctx where k = 'main:sid'))).id), 'varredura encontra a nota vencida');

do $$
declare d uuid := (pg_temp.doc_of((select v from _ctx where k = 'main:sid'))).id; p record;
begin
  select * into p from private.fiscal_retry_policy();
  update public.fiscal_documents set attempts = p.max_attempts - 1 where id = d;
  perform public.service_fiscal_claim(d);
  perform public.service_fiscal_record_result(d, 'transient', '{"errorCode":"http_500","errorMessage":"fora"}');
end $$;
select is((pg_temp.doc_of((select v from _ctx where k = 'main:sid'))).status, 'failed', 'esgotou as tentativas: para e espera a gerência');
select ok(exists (select 1 from public.audit_logs where action = 'fiscal.emission_failed'
  and entity_id = (pg_temp.doc_of((select v from _ctx where k = 'main:sid'))).id), 'falha definitiva deixa rastro');

select pg_temp.act((select v from _ctx where k = 'main:a'));
select is(public.customer_get_receipt((select id from public.casual_dining_receipts where customer_id = (select v from _ctx where k = 'main:a')))->'fiscal'->>'status',
  'delayed', 'cliente vê atraso, sem detalhe interno');
select is(pg_temp.state_of(format($q$select public.restaurant_fiscal_retry(%L, 'cliente')$q$, (pg_temp.doc_of((select v from _ctx where k = 'main:sid'))).id)), '42501', 'cliente não reenvia nota');
select pg_temp.act('c1000000-0000-4000-8000-000000000001');
select is(pg_temp.state_of(format($q$select public.restaurant_fiscal_retry(%L, '  ')$q$, (pg_temp.doc_of((select v from _ctx where k = 'main:sid'))).id)), '22023', 'reenvio exige motivo');
select is(public.restaurant_fiscal_retry((pg_temp.doc_of((select v from _ctx where k = 'main:sid'))).id, 'SEFAZ voltou')->>'status', 'pending', 'gerência devolve a nota à fila');
select is((select reason from public.audit_logs where action = 'fiscal.emission_retry'
  and entity_id = (pg_temp.doc_of((select v from _ctx where k = 'main:sid'))).id), 'SEFAZ voltou', 'reenvio grava autor e motivo');

-- ---------------------------------------------------------------------------
-- Nota autorizada aparece no recibo, com o número emitido
-- ---------------------------------------------------------------------------
do $$
declare d uuid := (pg_temp.doc_of((select v from _ctx where k = 'main:sid'))).id;
begin
  perform public.service_fiscal_claim(d);
  perform public.service_fiscal_record_result(d, 'authorized',
    '{"accessKey":"41190612345678000123650010000000121743484310","number":"12","series":"1","qrCodeUrl":"http://qr","danfeUrl":"http://danfe"}');
  perform public.service_fiscal_record_result(d, 'rejected', '{"errorCode":"704","errorMessage":"tarde"}');
end $$;
select is((pg_temp.doc_of((select v from _ctx where k = 'main:sid'))).status, 'authorized', 'resultado atrasado não desfaz nota autorizada');

select pg_temp.act((select v from _ctx where k = 'main:b'));
create temp table _receipt as
  select public.customer_get_receipt((select id from public.casual_dining_receipts where customer_id = (select v from _ctx where k = 'main:b'))) as j;
select is((select j->'fiscal'->>'number' from _receipt), '12', 'recibo referencia o número emitido');
select is((select j->'fiscal'->>'accessKey' from _receipt), '41190612345678000123650010000000121743484310', 'recibo traz a chave real');
select ok((select (j->'fiscal'->>'homologation')::boolean from _receipt), 'nota de homologação vem marcada como tal');
select ok((select not (j::text ~ 'tok-homolog') from _receipt), 'recibo não vaza o token');

-- ---------------------------------------------------------------------------
-- Cadastro incompleto bloqueia antes de chamar o emissor; simulado nunca vira nota
-- ---------------------------------------------------------------------------
do $$
declare
  r uuid := 'c1000000-0000-4000-8000-000000000002'; sid uuid; v_claim jsonb; d uuid;
begin
  update public.fiscal_configs set tax_defaults = tax_defaults - 'ncm' where restaurant_id = r;
  sid := pg_temp.new_session('blocked');
  perform pg_temp.pay_share(sid, (select v from _ctx where k = 'blocked:a'), 'pix');
  perform pg_temp.pay_share(sid, (select v from _ctx where k = 'blocked:b'), 'pix');
  d := (pg_temp.doc_of(sid)).id;
  v_claim := public.service_fiscal_claim(d);
  assert v_claim->>'blocked' = 'fiscal_data_incomplete', 'NCM ausente bloqueia a emissão';
  assert (pg_temp.doc_of(sid)).status = 'blocked', 'documento fica bloqueado';
  assert public.service_fiscal_claim(d)->>'claimed' = 'false', 'bloqueado não entra na varredura';

  -- Provisionar não libera nota antiga sozinho; o reenvio é decisão registrada.
  update public.fiscal_configs set focus_token_secret_id = null where restaurant_id = r;
  update public.fiscal_documents set status = 'pending', next_attempt_at = now() where id = d;
  assert public.service_fiscal_claim(d)->>'blocked' = 'fiscal_config_missing', 'sem token não chama o emissor';

  perform public.service_fiscal_configure(r, jsonb_build_object('cnpj', '12345678000123', 'razaoSocial', 'Casa LTDA',
    'stateCode', 'SP', 'regimeTributario', 'simples_nacional', 'serviceFeeInDocument', true,
    'taxDefaults', jsonb_build_object('ncm', '21069090', 'icms_origem', '0', 'icms_situacao_tributaria', '102',
      'pis_situacao_tributaria', '49', 'cofins_situacao_tributaria', '49')), 'tok-2');
  assert (pg_temp.doc_of(sid)).status = 'blocked', 'provisionar não libera nota antiga';

  -- Com a taxa dentro da nota, itens e formas seguem batendo com o total.
  perform pg_temp.act('c1000000-0000-4000-8000-000000000001');
  perform public.restaurant_fiscal_retry(d, 'cadastro corrigido');
  v_claim := public.service_fiscal_claim(d);
  assert v_claim->>'token' = 'tok-2', 'token atualizado no Vault';
  assert (v_claim->>'totalCents')::bigint = (select total_all from private.session_totals(sid)) or
         (v_claim->>'totalCents')::bigint = (select sum(amount_cents) from public.bill_shares where table_session_id = sid and status = 'paid'),
         'taxa dentro da nota: total = pago';
  assert (select sum((p->>'cents')::bigint) from jsonb_array_elements(v_claim->'payments') p) = (v_claim->>'totalCents')::bigint,
    'formas de pagamento fecham com a taxa';
  assert (select sum((i->>'grossCents')::bigint + (i->>'feeCents')::bigint) from jsonb_array_elements(v_claim->'items') i) = (v_claim->>'totalCents')::bigint,
    'itens fecham com a taxa';
  update public.fiscal_configs set service_fee_in_document = false where restaurant_id = r;
end $$;
select pass('cadastro incompleto bloqueia, reenvio registrado e taxa dentro da nota');

-- Falha ao enfileirar não desfaz o encerramento.
do $$
declare sid uuid := pg_temp.new_session('enqfail');
begin
  alter table public.fiscal_documents add constraint _fiscal_test_break check (total_cents < 0) not valid;
  perform pg_temp.pay_share(sid, (select v from _ctx where k = 'enqfail:a'), 'pix');
  perform pg_temp.pay_share(sid, (select v from _ctx where k = 'enqfail:b'), 'pix');
  alter table public.fiscal_documents drop constraint _fiscal_test_break;
  assert (select status from public.table_sessions where id = sid) = 'ended', 'sessão fecha mesmo sem conseguir enfileirar';
  assert exists (select 1 from public.audit_logs where action = 'fiscal.enqueue_failed' and entity_id = sid), 'falha fica registrada';
end $$;
select pass('falha ao enfileirar não reabre a conta e deixa rastro');

-- Pagamento simulado não existe para o fisco.
do $$
declare sid uuid := pg_temp.new_session('sim'); a uuid := (select v from _ctx where k = 'sim:a'); b uuid := (select v from _ctx where k = 'sim:b'); sh uuid; pid uuid; receipt uuid;
begin
  update private.dev_flags f set enabled = true where f.key = 'simulate_share_payment';
  foreach pid in array array[a, b] loop
    perform pg_temp.act(pid);
    select s.id into sh from public.bill_shares s join public.table_session_participants p on p.id = s.participant_id
      where s.table_session_id = sid and p.user_id = pid and s.status = 'open';
    perform public.customer_pay_share(sh, 'pix', gen_random_uuid());
  end loop;
  assert (select status from public.table_sessions where id = sid) = 'ended', 'simulado encerra a sessão';
  assert not exists (select 1 from public.fiscal_documents where table_session_id = sid), 'simulado não vira nota';
  perform pg_temp.act(a);
  select id into receipt from public.casual_dining_receipts where customer_id = a;
  assert public.customer_get_receipt(receipt)->'fiscal'->>'status' = 'none', 'recibo simulado não promete nota';
end $$;
select pass('pagamento simulado não emite nota');

-- ---------------------------------------------------------------------------
-- Quick Service: o pagamento confirmado é o encerramento
-- ---------------------------------------------------------------------------
do $$
declare
  r uuid := 'c1000000-0000-4000-8000-000000000002'; c uuid := gen_random_uuid(); other uuid := gen_random_uuid();
  menu uuid; o uuid; tx uuid; late uuid; late_tx uuid; d public.fiscal_documents; v_claim jsonb;
begin
  insert into auth.users(id, email) values (c, c || '@fiscal.test'), (other, other || '@fiscal.test');
  insert into public.profiles(id) values (c), (other) on conflict do nothing;
  select id into menu from public.menu_items where restaurant_id = r limit 1;
  insert into public.orders(restaurant_id, customer_id, order_type, discount_cents) values (r, c, 'pickup', 1000) returning id into o;
  insert into public.order_items(order_id, menu_item_id, quantity, unit_price, total_price) values (o, menu, 2, 25, 50);
  insert into public.gateway_transactions(restaurant_id, order_id, customer_id, provider, payment_method, amount_cents, status, idempotency_key, purpose, created_at, updated_at)
    values (r, o, c, 'asaas', 'pix', 4000, 'pending', 'fiscal-qs-' || o, 'order', now(), now()) returning id into tx;
  perform private.apply_payment_event(tx, 'asaas', 'qs-1', 'PAYMENT_RECEIVED', 'confirmed', 4000);
  assert (select count(*) from public.fiscal_documents where order_id = o) = 1, 'pagamento confirmado enfileira a nota';
  perform private.apply_payment_event(tx, 'asaas', 'qs-1', 'PAYMENT_RECEIVED', 'confirmed', 4000);
  perform private.apply_payment_event(tx, 'asaas', 'qs-2', 'PAYMENT_CONFIRMED', 'confirmed', 4000);
  assert (select count(*) from public.fiscal_documents where order_id = o) = 1, 'webhook repetido não duplica';
  select * into d from public.fiscal_documents where order_id = o;
  v_claim := public.service_fiscal_claim(d.id);
  assert (v_claim->>'totalCents')::bigint = 4000, 'desconto do combo reduz a nota';
  assert (select sum((i->>'discountCents')::bigint) from jsonb_array_elements(v_claim->'items') i) = 1000, 'desconto alocado sem perder centavo';
  assert (select sum((p->>'cents')::bigint) from jsonb_array_elements(v_claim->'payments') p) = 4000, 'forma de pagamento fecha com a nota';
  perform pg_temp.act(c);
  assert public.customer_order_fiscal(o)->>'status' = 'issuing', 'cliente acompanha a emissão';
  perform pg_temp.act(other);
  assert pg_temp.state_of(format('select public.customer_order_fiscal(%L)', o)) = 'P0002', 'outro cliente não vê a nota';

  -- Pagamento tardio vira estorno: não é venda, não vira nota.
  insert into public.orders(restaurant_id, customer_id, order_type, payment_expires_at) values (r, c, 'pickup', now() - interval '1 hour') returning id into late;
  insert into public.order_items(order_id, menu_item_id, quantity, unit_price, total_price) values (late, menu, 1, 25, 25);
  insert into public.gateway_transactions(restaurant_id, order_id, customer_id, provider, payment_method, amount_cents, status, idempotency_key, purpose, created_at, updated_at)
    values (r, late, c, 'asaas', 'pix', 2500, 'pending', 'fiscal-late-' || late, 'order', now(), now()) returning id into late_tx;
  perform private.apply_payment_event(late_tx, 'asaas', 'late-1', 'PAYMENT_RECEIVED', 'confirmed', 2500);
  assert not exists (select 1 from public.fiscal_documents where order_id = late), 'pagamento tardio não emite nota';
end $$;
select pass('Quick Service: confirmado emite uma vez, com desconto; tardio não emite');

-- ---------------------------------------------------------------------------
-- RLS e fronteira de serviço (invariante 9)
-- ---------------------------------------------------------------------------
-- Pedido de mesa no recibo: a nota é a do encerramento da sessão.
select pg_temp.act((select v from _ctx where k = 'main:a'));
select is(public.customer_order_fiscal((select id from public.orders where table_session_id = (select v from _ctx where k = 'main:sid') limit 1))->>'number',
  '12', 'pedido de mesa mostra a nota da sessão');

-- O banco aciona a Edge Function sem esperar ninguém abrir o app.
do $$
declare d uuid; v_sent integer;
begin
  perform vault.create_secret('https://proj.test', 'project_url', 'teste');
  perform vault.create_secret('service-key', 'service_role_key', 'teste');
  update public.fiscal_documents set status = 'failed' where status in ('pending', 'processing');
  insert into public.fiscal_documents(restaurant_id, external_ref) values ('c1000000-0000-4000-8000-000000000002', 'test-dispatch') returning id into d;
  insert into _ctx values ('dispatch', d);
end $$;
select ok((select count(*) from net.http_request_queue where url = 'https://proj.test/functions/v1/fiscal-emit'
  and convert_from(body, 'UTF8') like '%' || (select v from _ctx where k = 'dispatch') || '%') = 1, 'nota nova aciona fiscal-emit');
select is(private.fiscal_dispatch_due(), 1, 'varredura reaciona a nota vencida');
select is((select jobname from cron.job where jobname = 'fiscal-emission-sweep'), 'fiscal-emission-sweep', 'varredura agendada no pg_cron');
select _test.reset_role();

select _test.as_user('c1000000-0000-4000-8000-000000000001');
select ok((select count(*) from public.fiscal_documents) > 0, 'dono lê as notas da unidade');
select is((select count(*)::int from public.fiscal_documents where restaurant_id <> 'c1000000-0000-4000-8000-000000000002'), 0, 'dono não lê nota de outro estabelecimento');
select _test.reset_role();

select _test.as_user((select v from _ctx where k = 'main:a'));
select is((select count(*)::int from public.fiscal_documents), 0, 'cliente não lê a tabela fiscal');
select is(pg_temp.state_of('select count(*) from public.fiscal_configs'), '42501', 'cliente não lê a configuração fiscal');
select is(pg_temp.state_of(format('select public.service_fiscal_claim(%L)', gen_random_uuid())), '42501', 'cliente não reserva emissão nem lê token');
select _test.reset_role();

select * from finish();
rollback;
