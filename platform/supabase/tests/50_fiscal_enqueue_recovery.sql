-- ADR-030: conta encerrada cuja nota falhou ao enfileirar volta a ter documento pela varredura, sem
-- nota duplicada e sem criar nota para o que nunca teria nota. A falha que persiste chega à gerência.
begin;
select plan(54);

create function pg_temp.act(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true) $$;
create function pg_temp.state_of(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ok'; exception when others then return sqlstate; end $$;

create temp table _ctx(k text primary key, v uuid);
create function pg_temp.ctx(p_key text) returns uuid language sql as $$ select v from _ctx where k = p_key $$;

-- Qualquer nota nova cai na fila como pending: é isso que quebra a montagem. O documento sem foto nasce
-- em processing e passa, como na falha real, em que a escrita do documento em si funciona.
create function pg_temp.break_enqueue() returns void language plpgsql as $$
begin alter table public.fiscal_documents add constraint _fiscal_test_break check (status <> 'pending') not valid; end $$;
create function pg_temp.fix_enqueue() returns void language plpgsql as $$
begin alter table public.fiscal_documents drop constraint _fiscal_test_break; end $$;

-- Sessão com A e B, um item de R$60 e divisão igual.
create function pg_temp.new_session(p_label text) returns uuid language plpgsql as $$
declare
  r uuid := 'c1000000-0000-4000-8000-000000000002'; owner_id uuid := 'c1000000-0000-4000-8000-000000000001';
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); tbl jsonb; sid uuid; menu uuid; o uuid;
begin
  insert into auth.users(id, email) values (a, a || '@fiscal-rec.test'), (b, b || '@fiscal-rec.test');
  insert into public.profiles(id) values (a), (b) on conflict do nothing;
  perform pg_temp.act(owner_id);
  tbl := public.restaurant_create_table(r, 'test-rec-' || p_label, 4);
  select id into menu from public.menu_items where restaurant_id = r limit 1;
  perform pg_temp.act(a); sid := (public.customer_open_table_session(tbl->>'qr_code')->>'tableSessionId')::uuid;
  perform pg_temp.act(b); perform public.customer_open_table_session(tbl->>'qr_code');
  insert into public.orders(restaurant_id, customer_id, table_session_id) values (r, a, sid) returning id into o;
  insert into public.order_items(order_id, menu_item_id, quantity, unit_price, total_price) values (o, menu, 3, 20, 60);
  perform pg_temp.act(a);
  perform public.customer_bill_split_commit(sid, 'equal', '{}', null, gen_random_uuid());
  insert into _ctx values (p_label, sid), (p_label || ':a', a), (p_label || ':b', b), (p_label || ':order', o);
  return sid;
end $$;

create function pg_temp.pay_all(p_label text) returns void language plpgsql as $$
declare u uuid; pid uuid; sh public.bill_shares; tx public.gateway_transactions;
begin
  foreach u in array array[pg_temp.ctx(p_label || ':a'), pg_temp.ctx(p_label || ':b')] loop
    select id into pid from public.table_session_participants where table_session_id = pg_temp.ctx(p_label) and user_id = u;
    select * into sh from public.bill_shares where table_session_id = pg_temp.ctx(p_label) and participant_id = pid and status = 'open';
    tx := private.reserve_share_payment(u, sh.id, 'pix', 0, gen_random_uuid(), 'asaas');
    perform private.apply_payment_event(tx.id, 'asaas', 'evt-' || tx.id, 'PAYMENT_RECEIVED', 'confirmed', tx.amount_cents);
  end loop;
end $$;

-- Sessão paga com a montagem quebrada: conta encerrada, só o rastro, nenhum documento.
create function pg_temp.failed_session(p_label text) returns uuid language plpgsql as $$
declare sid uuid := pg_temp.new_session(p_label);
begin
  perform pg_temp.break_enqueue();
  perform pg_temp.pay_all(p_label);
  perform pg_temp.fix_enqueue();
  return sid;
end $$;

-- Pedido sem sessão, com desconto de R$10, pago pelo webhook com a montagem quebrada.
create function pg_temp.failed_order(p_label text) returns uuid language plpgsql as $$
declare
  r uuid := 'c1000000-0000-4000-8000-000000000002'; c uuid := gen_random_uuid(); menu uuid; o uuid; tx uuid;
begin
  insert into auth.users(id, email) values (c, c || '@fiscal-rec.test');
  insert into public.profiles(id) values (c) on conflict do nothing;
  select id into menu from public.menu_items where restaurant_id = r limit 1;
  insert into public.orders(restaurant_id, customer_id, order_type, discount_cents) values (r, c, 'pickup', 1000) returning id into o;
  insert into public.order_items(order_id, menu_item_id, quantity, unit_price, total_price) values (o, menu, 2, 25, 50);
  insert into public.gateway_transactions(restaurant_id, order_id, customer_id, provider, payment_method, amount_cents, status, idempotency_key, purpose, created_at, updated_at)
    values (r, o, c, 'asaas', 'pix', 4000, 'pending', 'fiscal-rec-' || o, 'order', now(), now()) returning id into tx;
  perform pg_temp.break_enqueue();
  perform private.apply_payment_event(tx, 'asaas', 'rec-' || tx, 'PAYMENT_RECEIVED', 'confirmed', 4000);
  perform pg_temp.fix_enqueue();
  insert into _ctx values (p_label, o), (p_label || ':customer', c);
  return o;
end $$;

-- Dentro da transação now() não anda: envelhecer o rastro é o que simula o tempo passando.
create function pg_temp.age_failure(p_entity uuid) returns void language sql as $$
  update public.audit_logs set created_at = now() - private.fiscal_enqueue_block_after() - interval '1 minute'
  where action = 'fiscal.enqueue_failed' and entity_id = p_entity $$;
create function pg_temp.due_again(p_doc uuid) returns void language sql as $$
  update public.fiscal_documents set next_attempt_at = now() - interval '1 second' where id = p_doc $$;

create function pg_temp.docs_of(p_sid uuid) returns integer language sql as $$
  select count(*)::int from public.fiscal_documents where table_session_id = p_sid $$;
create function pg_temp.doc_of(p_sid uuid) returns public.fiscal_documents language sql as $$
  select * from public.fiscal_documents where table_session_id = p_sid $$;
create function pg_temp.trail(p_action text, p_entity uuid) returns integer language sql as $$
  select count(*)::int from public.audit_logs where action = p_action and entity_id = p_entity $$;
create function pg_temp.posts_of(p_doc uuid) returns integer language sql as $$
  select count(*)::int from net.http_request_queue where url like '%/functions/v1/fiscal-emit'
    and convert_from(body, 'UTF8') like '%' || p_doc || '%' $$;
create function pg_temp.notices() returns integer language sql as $$
  select count(*)::int from public.notifications
  where user_id = 'c1000000-0000-4000-8000-000000000001' and notification_type = 'fiscal_document_issue' $$;

do $$
declare r uuid := 'c1000000-0000-4000-8000-000000000002';
begin
  insert into public.restaurant_payment_accounts(restaurant_id, provider, status, platform_fee_bps)
    values (r, 'asaas', 'active', 100) on conflict do nothing;
  update public.restaurant_payment_accounts set status = 'active' where restaurant_id = r;
  perform public.service_fiscal_configure(r, jsonb_build_object(
    'cnpj', '12345678000123', 'razaoSocial', 'Casa LTDA', 'stateCode', 'SP', 'regimeTributario', 'simples_nacional',
    'taxDefaults', jsonb_build_object('ncm', '21069090', 'cfop', '5102', 'icms_origem', '0', 'icms_situacao_tributaria', '102',
      'pis_situacao_tributaria', '49', 'cofins_situacao_tributaria', '49')), 'tok-rec');
  perform vault.create_secret('https://proj.test', 'project_url', 'teste');
  perform vault.create_secret('service-key', 'service_role_key', 'teste');
end $$;

-- ---------------------------------------------------------------------------
-- A falha é recuperada pela varredura, com uma nota só
-- ---------------------------------------------------------------------------
select pg_temp.failed_session('rec');
select is((select status from public.table_sessions where id = pg_temp.ctx('rec')), 'ended', 'falha ao enfileirar não desfaz o encerramento');
select is(pg_temp.docs_of(pg_temp.ctx('rec')), 0, 'partida do caso: conta encerrada sem documento');
select is(pg_temp.trail('fiscal.enqueue_failed', pg_temp.ctx('rec')), 1, 'partida do caso: só o rastro em audit_logs');

select pg_temp.act(pg_temp.ctx('rec:a'));
select is(public.customer_get_receipt((select id from public.casual_dining_receipts where customer_id = pg_temp.ctx('rec:a')))->'fiscal'->>'status',
  'delayed', 'cliente vê a nota atrasada enquanto não há documento');

select private.fiscal_dispatch_due();
select is(pg_temp.docs_of(pg_temp.ctx('rec')), 1, 'a varredura cria o documento que faltava');
select is((pg_temp.doc_of(pg_temp.ctx('rec'))).status, 'pending', 'documento entra na fila normal');
select is((pg_temp.doc_of(pg_temp.ctx('rec'))).external_ref, 's-' || pg_temp.ctx('rec'), 'mesma referência estável do encerramento');
select is((pg_temp.doc_of(pg_temp.ctx('rec'))).total_cents, 6000::bigint, 'total do encerramento');
select is(jsonb_array_length((pg_temp.doc_of(pg_temp.ctx('rec'))).snapshot->'lines'), 1, 'nota recuperada tem a foto das linhas');
select is(pg_temp.posts_of((pg_temp.doc_of(pg_temp.ctx('rec'))).id), 1, 'nota recuperada aciona fiscal-emit uma vez');
select is(pg_temp.trail('fiscal.enqueue_recovered', pg_temp.ctx('rec')), 1, 'recuperação deixa rastro');
select is(pg_temp.notices(), 0, 'falha que se resolve sozinha não avisa ninguém');

select pg_temp.act(pg_temp.ctx('rec:a'));
select is(public.customer_get_receipt((select id from public.casual_dining_receipts where customer_id = pg_temp.ctx('rec:a')))->'fiscal'->>'status',
  'issuing', 'cliente passa a ver a nota em emissão');

select private.fiscal_dispatch_due();
select is(pg_temp.docs_of(pg_temp.ctx('rec')), 1, 'varredura repetida não duplica a nota');
select is(pg_temp.trail('fiscal.enqueue_recovered', pg_temp.ctx('rec')), 1, 'varredura repetida não recupera de novo');

-- Nota com outro destino não volta atrás: o rastro antigo continua lá.
do $$
declare d uuid := (pg_temp.doc_of(pg_temp.ctx('rec'))).id;
begin
  perform public.service_fiscal_claim(d);
  perform public.service_fiscal_record_result(d, 'authorized', '{"accessKey":"41190612345678000123650010000000121743484310","number":"12","series":"1"}');
  perform private.fiscal_dispatch_due();
end $$;
select is((pg_temp.doc_of(pg_temp.ctx('rec'))).status, 'authorized', 'rastro antigo não mexe em nota autorizada');
select is(private.fiscal_enqueue_session(pg_temp.ctx('rec')), null::uuid, 'enfileirar de novo segue idempotente');

-- Quick Service, pelo mesmo caminho.
select pg_temp.failed_order('qs');
select is((select count(*)::int from public.fiscal_documents where order_id = pg_temp.ctx('qs')), 0, 'pedido pago com a montagem quebrada fica sem documento');
select private.fiscal_dispatch_due();
select is((select count(*)::int from public.fiscal_documents where order_id = pg_temp.ctx('qs')), 1, 'pedido sem sessão também é recuperado');
select is((select total_cents from public.fiscal_documents where order_id = pg_temp.ctx('qs')), 4000::bigint, 'nota do pedido com o desconto');

-- ---------------------------------------------------------------------------
-- Null de propósito não é falha: nada de nota, nada na lista da gerência
-- ---------------------------------------------------------------------------
do $$
declare sid uuid := pg_temp.new_session('sim'); sh uuid; u uuid; pid uuid;
begin
  update private.dev_flags f set enabled = true where f.key = 'simulate_share_payment';
  foreach u in array array[pg_temp.ctx('sim:a'), pg_temp.ctx('sim:b')] loop
    perform pg_temp.act(u);
    select id into pid from public.table_session_participants where table_session_id = sid and user_id = u;
    select id into sh from public.bill_shares where table_session_id = sid and participant_id = pid and status = 'open';
    perform public.customer_pay_share(sh, 'pix', gen_random_uuid());
  end loop;
  -- Rastro envelhecido e montagem quebrada: se a varredura tentasse, nasceria um documento bloqueado.
  perform private.log_system_audit('c1000000-0000-4000-8000-000000000002', 'fiscal.enqueue_failed', 'table_session', sid, 'teste', null, null);
  perform pg_temp.age_failure(sid);
  perform pg_temp.break_enqueue();
  perform private.fiscal_dispatch_due();
  perform pg_temp.fix_enqueue();
end $$;
select is(pg_temp.docs_of(pg_temp.ctx('sim')), 0, 'pagamento simulado não vira nota');
select is(pg_temp.trail('fiscal.enqueue_not_applicable', pg_temp.ctx('sim')), 1, 'caso encerrado fica marcado');
select private.fiscal_dispatch_due();
select is(pg_temp.trail('fiscal.enqueue_not_applicable', pg_temp.ctx('sim')), 1, 'caso encerrado sai da varredura');
select is(pg_temp.docs_of(pg_temp.ctx('sim')), 0, 'simulado continua sem nota na varredura seguinte');

do $$
declare sid uuid := pg_temp.new_session('nolines');
begin
  update public.order_items set status = 'cancelled' where order_id = pg_temp.ctx('nolines:order');
  perform private.log_system_audit('c1000000-0000-4000-8000-000000000002', 'fiscal.enqueue_failed', 'table_session', sid, 'teste', null, null);
  perform pg_temp.age_failure(sid);
  perform private.fiscal_dispatch_due();
end $$;
select is(pg_temp.docs_of(pg_temp.ctx('nolines')), 0, 'conta sem linhas e sem pagamento não vira nota');
select is(pg_temp.trail('fiscal.enqueue_not_applicable', pg_temp.ctx('nolines')), 1, 'conta sem linhas é caso encerrado, não falha');

-- Pedido estornado antes da varredura não é mais venda.
select pg_temp.failed_order('refunded');
update public.orders set payment_status = 'refunded' where id = pg_temp.ctx('refunded');
select private.fiscal_dispatch_due();
select is((select count(*)::int from public.fiscal_documents where order_id = pg_temp.ctx('refunded')), 0, 'pedido estornado depois da falha não vira nota');

-- ---------------------------------------------------------------------------
-- Falha que persiste chega à gerência como documento bloqueado
-- ---------------------------------------------------------------------------
select pg_temp.failed_session('stuck');
select pg_temp.break_enqueue();
select private.fiscal_dispatch_due();
select is(pg_temp.docs_of(pg_temp.ctx('stuck')), 0, 'falha recente: tenta de novo sem incomodar ninguém');
select is(pg_temp.notices(), 0, 'falha recente não avisa');

select pg_temp.age_failure(pg_temp.ctx('stuck'));
select private.fiscal_dispatch_due();
select is((pg_temp.doc_of(pg_temp.ctx('stuck'))).status, 'blocked', 'falha persistente vira documento bloqueado');
select is((pg_temp.doc_of(pg_temp.ctx('stuck'))).total_cents, 6000::bigint, 'a lista mostra o valor da conta');
select is(pg_temp.notices(), 1, 'dono recebe o aviso de nota parada');
select ok((pg_temp.doc_of(pg_temp.ctx('stuck'))).error_message !~ '_fiscal_test_break', 'a lista não leva o erro técnico');
select is(pg_temp.trail('fiscal.enqueue_retry_failed', pg_temp.ctx('stuck')), 1, 'o erro técnico fica na auditoria');
select is(public.service_fiscal_claim((pg_temp.doc_of(pg_temp.ctx('stuck'))).id)->>'claimed', 'false', 'documento sem foto não vai para a Focus');

-- A varredura continua tentando, com espera crescente e sem repetir o aviso.
select private.fiscal_dispatch_due();
select is((pg_temp.doc_of(pg_temp.ctx('stuck'))).attempts, 0, 'antes da hora não tenta de novo');
select pg_temp.due_again((pg_temp.doc_of(pg_temp.ctx('stuck'))).id);
select private.fiscal_dispatch_due();
select is((pg_temp.doc_of(pg_temp.ctx('stuck'))).attempts, 1, 'vencida a espera, tenta de novo');
select ok((pg_temp.doc_of(pg_temp.ctx('stuck'))).next_attempt_at > now(), 'nova espera fica agendada');
select is(pg_temp.notices(), 1, 'nova tentativa sem sucesso não avisa de novo');
select is(pg_temp.docs_of(pg_temp.ctx('stuck')), 1, 'continua um documento só');
-- Falha de semanas: as tentativas não param, e a conta da espera não pode estourar.
update public.fiscal_documents set attempts = 100000 where id = (pg_temp.doc_of(pg_temp.ctx('stuck'))).id;
select pg_temp.due_again((pg_temp.doc_of(pg_temp.ctx('stuck'))).id);
select private.fiscal_dispatch_due();
select ok((pg_temp.doc_of(pg_temp.ctx('stuck'))).next_attempt_at between now() and now() + (select max_delay from private.fiscal_retry_policy()),
  'espera fica no teto da política, mesmo depois de muitas tentativas');

-- A gerência vê a falha persistir ao reenviar, sem perder a nota.
select pg_temp.act('c1000000-0000-4000-8000-000000000001');
select is(pg_temp.state_of(format($q$select public.restaurant_fiscal_retry(%L, 'tentando')$q$, (pg_temp.doc_of(pg_temp.ctx('stuck'))).id)), 'P0001',
  'reenvio diz que a nota ainda não pôde ser montada');
select is((pg_temp.doc_of(pg_temp.ctx('stuck'))).status, 'blocked', 'reenvio sem sucesso mantém a nota na lista');

-- A causa foi corrigida: o mesmo documento volta à fila sozinho, com a foto.
select pg_temp.fix_enqueue();
create temp table _stuck as select (pg_temp.doc_of(pg_temp.ctx('stuck'))).id;
select pg_temp.due_again((select id from _stuck));
select private.fiscal_dispatch_due();
select is((pg_temp.doc_of(pg_temp.ctx('stuck'))).id, (select id from _stuck), 'recuperar mantém o mesmo documento');
select is((pg_temp.doc_of(pg_temp.ctx('stuck'))).status, 'pending', 'documento volta à fila sem ninguém reenviar');
select is((public.service_fiscal_claim((select id from _stuck))->>'totalCents')::bigint, 6000::bigint, 'nota recuperada vai para a Focus com o total certo');

-- O reenvio da gerência também monta a nota, e grava autor e motivo.
select pg_temp.failed_session('manual');
select pg_temp.break_enqueue();
select pg_temp.age_failure(pg_temp.ctx('manual'));
select private.fiscal_dispatch_due();
select pg_temp.fix_enqueue();
select pg_temp.act('c1000000-0000-4000-8000-000000000001');
select is(public.restaurant_fiscal_retry((pg_temp.doc_of(pg_temp.ctx('manual'))).id, 'suporte corrigiu')->>'status', 'pending', 'reenvio monta a nota e devolve à fila');
select is(jsonb_array_length((pg_temp.doc_of(pg_temp.ctx('manual'))).snapshot->'lines'), 1, 'reenvio grava a foto das linhas');
select is((select reason from public.audit_logs where action = 'fiscal.emission_retry' and entity_id = (pg_temp.doc_of(pg_temp.ctx('manual'))).id),
  'suporte corrigiu', 'reenvio grava o motivo');

-- Pedido marcado completed depois do encerramento some das linhas da sessão: o null não pode descartar
-- uma nota que continua devida.
select pg_temp.failed_session('gone_lines');
update public.orders set status = 'completed' where id = pg_temp.ctx('gone_lines:order');
select pg_temp.age_failure(pg_temp.ctx('gone_lines'));
select private.fiscal_dispatch_due();
select is((pg_temp.doc_of(pg_temp.ctx('gone_lines'))).status, 'blocked', 'conta paga sem linhas chega à gerência');
select is(pg_temp.trail('fiscal.enqueue_not_applicable', pg_temp.ctx('gone_lines')), 0, 'conta paga sem linhas não é descartada');

-- Documento sem foto de uma venda que deixou de existir sai da lista: nunca foi à Focus.
select pg_temp.failed_order('later');
select pg_temp.break_enqueue();
select pg_temp.age_failure(pg_temp.ctx('later'));
select private.fiscal_dispatch_due();
select pg_temp.fix_enqueue();
select is((select status from public.fiscal_documents where order_id = pg_temp.ctx('later')), 'blocked', 'pedido com falha persistente fica bloqueado');
update public.orders set payment_status = 'refunded' where id = pg_temp.ctx('later');
select pg_temp.due_again((select id from public.fiscal_documents where order_id = pg_temp.ctx('later')));
select private.fiscal_dispatch_due();
select is((select count(*)::int from public.fiscal_documents where order_id = pg_temp.ctx('later')), 0, 'estorno depois do bloqueio tira a nota da lista');
select is(pg_temp.trail('fiscal.enqueue_not_applicable', pg_temp.ctx('later')), 1, 'a saída fica registrada');

select * from finish();
rollback;
